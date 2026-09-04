import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processComplexJob } from './processComplexJob.ts';
import { PlanComplexStageFn } from '../dialectic-service/dialectic.interface.ts';
import {
    buildDialecticJobRow,
    buildProcessComplexJobPayload,
    buildDialecticStageRecipeStep,
    buildDialecticPlanJobPayload,
} from '../_shared/dialectic.mock.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { createPlanJobContext, createJobContext } from './createJobContext/createJobContext.ts';
import { buildJobContextParams } from './createJobContext/JobContext.mock.ts';

describe('processComplexJob', () => {

    beforeEach(() => {
        resetMockNotificationService();
    });

    // Contract: a planning pass that delegates to planComplexStage, receives child
    // jobs, inserts them, and updates the parent to waiting_for_children completes
    // and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step with inputs_required: []; mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children, insert and update succeed; buildJobContextParams with
    // planComplexStage returning one child job.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: result is { planned: true }; insert was called once; update was called
    // with status 'waiting_for_children'.
    it('plans and enqueues child jobs', async () => {
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
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assert('planned' in result);
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assertEquals(insertCalls.callCount, 1);
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
    });

    // Contract: a generic Error thrown by planComplexStage reaches the outer catch
    // and returns the error arm with retriable: true.
    // Arrange: buildProcessComplexJobPayload; valid stage/instance/steps path;
    // planComplexStage throws new Error('Planner failed!').
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: result is the error arm with retriable true.
    it('handles planner failure gracefully', async () => {
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
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.retriable, true);
        }
    });

    // Contract: when planComplexStage returns an empty array, the parent job is
    // marked completed and the function returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid stage/instance/steps path;
    // planComplexStage returns []; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: result is { planned: true }; update was called with status 'completed'.
    it('completes parent job if planner returns no children', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assert('planned' in result);
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const completedUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'completed';
        });
        assert(completedUpdates.length > 0);
    });

    // Contract: an insert error returns the error arm with retriable: true.
    // Arrange: buildProcessComplexJobPayload; valid path; planComplexStage returns
    // one child job; insert returns a PostgresError.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: result is the error arm with retriable true.
    it('fails parent job if child job insert fails', async () => {
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
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: { name: 'PostgresError', message: 'Insert failed', code: '23505', details: 'duplicate' } }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.retriable, true);
        }
    });

    // Contract: an update error on the waiting_for_children write returns the error
    // arm with retriable: true.
    // Arrange: buildProcessComplexJobPayload; valid path; planComplexStage returns
    // one child job; insert succeeds; update returns a PostgresError.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: result is the error arm with retriable true.
    it('fails parent job if status update fails', async () => {
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
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: { name: 'PostgresError', message: 'Update failed', code: 'P0001', details: null } } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.retriable, true);
        }
    });

    // Contract: a ContextWindowError thrown by planComplexStage returns the error
    // arm with retriable: false.
    // Arrange: buildProcessComplexJobPayload; valid path; planComplexStage throws
    // new ContextWindowError('Context window exceeded').
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: result is the error arm with retriable false; error is a
    // ContextWindowError.
    it('handles ContextWindowError gracefully', async () => {
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
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.retriable, false);
            assertEquals(result.error instanceof ContextWindowError, true);
        }
    });

    // Contract: planComplexStage is called with the first ready step from the recipe,
    // the child jobs it returns are inserted, and the parent is updated to
    // waiting_for_children. The planning pass completes and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; planComplexStage
    // returns one child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage was called once; its 4th argument (recipeStep) has
    // step_slug matching the valid step's step_slug; insert was called once; update
    // was called with status 'waiting_for_children'; result is { planned: true }.
    it('should fetch the modern recipe, identify the first step, and enqueue child jobs', async () => {
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
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, validStep.step_slug);
        }
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assertEquals(insertCalls.callCount, 1);
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: when the planning pass begins, a planner_started notification is sent
    // with the step_key of the first ready step. PLAN notifications omit modelId and
    // document_key.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; planComplexStage
    // returns one child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: sendJobNotificationEvent was called with type 'planner_started' and a
    // non-empty step_key; that payload lacks modelId and document_key; result is
    // { planned: true }.
    it('emits planner_started when planner work begins with step context', async () => {
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
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const startedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
            (c) => isRecord(c.args[0]) && c.args[0].type === 'planner_started',
        );
        assertExists(startedCall);
        const notif = startedCall.args[0];
        if (isRecord(notif) && notif.type === 'planner_started') {
            assertEquals(typeof notif.step_key, 'string');
            assert(notif.step_key.length > 0);
            assertEquals('modelId' in notif, false);
            assertEquals('document_key' in notif, false);
        }
        assert('planned' in result);
    });

    // Contract: when a step has a completed child job (tracked via
    // planner_metadata.recipe_step_id), that step is excluded from readySteps and
    // planComplexStage is called with the next ready step. The planning pass
    // completes and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid path with two steps (step-one,
    // step-two); one completed child job for step-one with valid planner_metadata;
    // planComplexStage returns one child job for step-two; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage was called once; its 4th argument has step_slug
    // 'step-two'; result is { planned: true }.
    it('should correctly advance to the next step when waking up from a "pending_next_step" status', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwo = buildDialecticStageRecipeStep({ id: 'step-2', step_slug: 'step-two', inputs_required: [] });
        if (stepOne === null || stepTwo === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-1' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwo], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'step-two');
        }
        assert('planned' in result);
    });

    // Contract: when all recipe steps have completed child jobs, planComplexStage is
    // not called, the parent job is marked completed, and the function returns
    // { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; one completed
    // child job for that step; planComplexStage returns [] (should not be called).
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called 0 times; update called with status 'completed';
    // result is { planned: true }.
    it('should mark the parent job as "completed" after the final step is processed', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild], error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const completedUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'completed';
        });
        assert(completedUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: completed steps are tracked via planner_metadata.recipe_step_id
    // mapped to step_slug through stepSlugById. A completed child for the first step
    // excludes that step from readySteps, and planComplexStage is called with the
    // second step only.
    // Arrange: buildProcessComplexJobPayload; valid path with two steps
    // (build-stage-header, generate-business-case); one completed child for
    // build-stage-header with planner_metadata.recipe_step_id matching that step's id;
    // planComplexStage returns [].
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with the second step (generate-business-case);
    // result is { planned: true }.
    it('should track completed steps using planner_metadata.recipe_step_id instead of step_slug', async () => {
        // Arrange
        const headerStep = buildDialecticStageRecipeStep({ id: 'header-step-id', step_slug: 'build-stage-header', inputs_required: [] });
        const businessStep = buildDialecticStageRecipeStep({ id: 'business-step-id', step_slug: 'generate-business-case', inputs_required: [] });
        if (headerStep === null || businessStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedHeaderChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'header-step-id' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [headerStep, businessStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedHeaderChild], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-business-case');
        }
        assert('planned' in result);
    });

    // Contract: a step with a completed child job is excluded from readySteps;
    // planComplexStage is called only for steps with no completed children.
    // Arrange: buildProcessComplexJobPayload; valid path with two steps
    // (build-stage-header, generate-business-case); one completed child for
    // build-stage-header; planComplexStage returns [].
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with generate-business-case; not called
    // with build-stage-header; result is { planned: true }.
    it('should NOT plan already-completed steps, only plan steps that are not yet completed', async () => {
        // Arrange
        const headerStep = buildDialecticStageRecipeStep({ id: 'header-step-id', step_slug: 'build-stage-header', inputs_required: [] });
        const businessStep = buildDialecticStageRecipeStep({ id: 'business-step-id', step_slug: 'generate-business-case', inputs_required: [] });
        if (headerStep === null || businessStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedHeaderChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'header-step-id' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [headerStep, businessStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedHeaderChild], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-business-case');
        }
        assert('planned' in result);
    });

    // Contract: when all recipe steps have completed child jobs, planComplexStage is
    // not called and the parent job is marked completed. The function returns
    // { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; one completed
    // child for that step; planComplexStage returns [] (should not be called).
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called 0 times; update called with status 'completed';
    // result is { planned: true }.
    it('should complete the parent job when all steps have completed child jobs', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild], error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const completedUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'completed';
        });
        assert(completedUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: a completed child job whose planner_metadata.recipe_step_id does not
    // match any step in the recipe does not exclude any step from readySteps — the
    // mismatched step_id maps to no step_slug, so no step is marked completed.
    // planComplexStage is called with the first step.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; one completed
    // child with planner_metadata.recipe_step_id 'nonexistent-step-id'; planComplexStage
    // returns [].
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with the valid step; result is
    // { planned: true }.
    it('should still plan steps when step_slug does not match completedStepSlugs Set (mismatch in step tracking)', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const mismatchedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'nonexistent-step-id' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [mismatchedChild], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, validStep.step_slug);
        }
        assert('planned' in result);
    });

    // Contract: when all recipe steps have completed child jobs, planComplexStage is
    // not called and the parent job is marked completed. The function returns
    // { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; one completed
    // child for that step; planComplexStage returns [] (should not be called).
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called 0 times; update called with status 'completed';
    // result is { planned: true }.
    it('should mark the parent PLAN job as completed when all recipe steps are successfully completed', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild], error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const completedUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'completed';
        });
        assert(completedUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: child jobs returned by planComplexStage that lack an idempotency_key
    // have one assigned (crypto.randomUUID) before insert. The planning pass completes
    // and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; planComplexStage
    // returns one child job with idempotency_key null; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: the insert call's data includes a child job with a non-null
    // idempotency_key; result is { planned: true }.
    it('child jobs inserted by main planner include UUID idempotency_key', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJobWithoutKey = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002', idempotency_key: null });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJobWithoutKey];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assertEquals(insertCalls.callCount, 1);
        const insertData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertData)) {
            const insertedChild = insertData[0];
            if (isRecord(insertedChild)) {
                assertExists(insertedChild.idempotency_key);
            }
        }
        assert('planned' in result);
    });

    // Contract: on a unique constraint violation (code 23505 on idempotency_key)
    // during child job insert, existing child jobs are queried and the parent is
    // updated to waiting_for_children. The function returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; valid path with one step; planComplexStage
    // returns one child job with an idempotency_key; insert returns error with code
    // '23505' and message containing 'idempotency_key'; select for existing children
    // returns one row; update succeeds.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: update called with status 'waiting_for_children'; result is
    // { planned: true }.
    it('on unique constraint violation (23505 on idempotency_key) during child job insert, existing child jobs are queried and processing continues without throwing', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002', idempotency_key: 'existing-key' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const existingChild = buildDialecticJobRow({ id: 'existing-child-id', idempotency_key: 'existing-key' });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: {
                    select: { data: [existingChild], error: null },
                    insert: { data: null, error: { name: 'PostgresError', message: 'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key"', code: '23505', details: null } },
                    update: { data: null, error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: the JWT reaching ctx.planComplexStage is payload.job.payload.user_jwt,
    // read from the job row's own payload — not a retired authToken parameter.
    // Captured at the call site so the retired parameter cannot return unnoticed.
    // Arrange: buildProcessComplexJobPayload with a plan payload carrying user_jwt
    // 'test-jwt-from-payload'; valid path with one step; planComplexStage returns one
    // child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage's 5th argument (authToken) is 'test-jwt-from-payload';
    // result is { planned: true }.
    it('passes payload.job.payload.user_jwt as the authToken to planComplexStage', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planPayload = buildDialecticPlanJobPayload({ user_jwt: 'test-jwt-from-payload' });
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN' }), payload: planPayload },
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
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        assertEquals(planComplexStageSpy.calls[0].args[4], 'test-jwt-from-payload');
        assert('planned' in result);
    });
});
