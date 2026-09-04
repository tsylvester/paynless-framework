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
    buildDialecticStageRecipeEdge,
} from '../_shared/dialectic.mock.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { describe, it, beforeEach } from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import { resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { createPlanJobContext, createJobContext } from './createJobContext/createJobContext.ts';
import { buildJobContextParams } from './createJobContext/JobContext.mock.ts';

describe('processComplexJob with Cloned Recipe Instance', () => {

    beforeEach(() => {
        resetMockNotificationService();
    });

    // Contract: a cloned recipe instance's steps are read from
    // dialectic_stage_recipe_steps and the first ready step is delegated to
    // planComplexStage. The planning pass completes and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; mock dialectic_stages returns a row
    // with active_recipe_instance_id 'instance-1'; mock dialectic_stage_recipe_instances
    // returns a cloned instance (is_cloned: true); mock dialectic_stage_recipe_steps
    // returns one valid step with inputs_required: []; mock dialectic_stage_recipe_edges
    // returns empty; mock dialectic_generation_jobs select returns empty children,
    // insert and update succeed; buildJobContextParams with planComplexStage returning
    // one child job.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with the valid step; update called with
    // status 'waiting_for_children'; result is { planned: true }.
    it('should fetch the CLONED recipe and plan the first step', async () => {
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
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: when a step in a cloned recipe has a completed child job, the next
    // ready step is delegated to planComplexStage. The planning pass completes and
    // returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; cloned instance; two steps (step-one,
    // step-two); one completed child for step-one; planComplexStage returns one child
    // job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with step-two; update called with
    // 'waiting_for_children'; result is { planned: true }.
    it('should advance to the next step in a CLONED recipe', async () => {
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
        const { client, spies } = createMockSupabaseClient(undefined, {
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
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: when all steps in a cloned recipe have completed child jobs, the
    // parent is marked completed and the function returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; cloned instance; one step; one completed
    // child for that step; planComplexStage returns [] (should not be called).
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called 0 times; update called with status 'completed';
    // result is { planned: true }.
    it('should complete the parent job after the final step of a CLONED recipe', async () => {
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

    // Contract: a step's config_override is passed through to planComplexStage as
    // part of the recipe step argument. The planning pass completes and returns
    // { planned: true }.
    // Arrange: buildProcessComplexJobPayload; cloned instance; one step with
    // config_override { custom: 'value' }; planComplexStage returns one child job;
    // insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once; its 4th argument has config_override
    // matching { custom: 'value' }; result is { planned: true }.
    it('should pass step overrides to the planner function', async () => {
        // Arrange
        const stepWithOverride = buildDialecticStageRecipeStep({ inputs_required: [], config_override: { custom: 'value' } });
        if (stepWithOverride === null) throw new Error('buildDialecticStageRecipeStep returned null');
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
                dialectic_stage_recipe_steps: { select: { data: [stepWithOverride], error: null } },
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
            const configOverride = recipeStepArg.config_override;
            if (isRecord(configOverride)) {
                assertEquals(configOverride.custom, 'value');
            }
        }
        assert('planned' in result);
    });

    // Contract: a step marked is_skipped: true is excluded from readySteps; the
    // subsequent step is delegated to planComplexStage instead. The planning pass
    // completes and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; cloned instance; three steps (step-one,
    // step-two with is_skipped: true, step-three); no completed children; edges define
    // step-two depends on step-one, step-three depends on step-two; planComplexStage
    // returns one child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with step-three (step-two is skipped);
    // result is { planned: true }.
    it('should skip a step marked as is_skipped and plan the subsequent step', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwo = buildDialecticStageRecipeStep({ id: 'step-2', step_slug: 'step-two', inputs_required: [], is_skipped: true });
        const stepThree = buildDialecticStageRecipeStep({ id: 'step-3', step_slug: 'step-three', inputs_required: [] });
        if (stepOne === null || stepTwo === null || stepThree === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const edgeOneToTwo = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2' });
        const edgeTwoToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2', to_step_id: 'step-3' });
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
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwo, stepThree], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [edgeOneToTwo, edgeTwoToThree], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'step-three');
        }
        assert('planned' in result);
    });
});

describe('processComplexJob with Parallel Recipe Graph', () => {

    beforeEach(() => {
        resetMockNotificationService();
    });

    // Contract: when a step's single dependency is met (fork point), all parallel
    // successor steps are delegated to planComplexStage. The planning pass completes
    // and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; template instance (is_cloned: false);
    // three steps (step-one, step-two-a, step-two-b); edge from step-one to step-two-a
    // and step-one to step-two-b; one completed child for step-one; planComplexStage
    // returns one child job per call; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called twice — once with step-two-a, once with
    // step-two-b; update called with 'waiting_for_children'; result is
    // { planned: true }.
    it('should enqueue all parallel steps when their single dependency is met (fork)', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwoA = buildDialecticStageRecipeStep({ id: 'step-2a', step_slug: 'step-two-a', inputs_required: [] });
        const stepTwoB = buildDialecticStageRecipeStep({ id: 'step-2b', step_slug: 'step-two-b', inputs_required: [] });
        if (stepOne === null || stepTwoA === null || stepTwoB === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const edgeOneToTwoA = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2a' });
        const edgeOneToTwoB = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2b' });
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedStepOne = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-1' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: false, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwoA, stepTwoB], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [edgeOneToTwoA, edgeOneToTwoB], error: null } },
                dialectic_generation_jobs: { select: { data: [completedStepOne], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 2);
        const plannedSlugs = planComplexStageSpy.calls.map((c) => {
            const step = c.args[3];
            return isRecord(step) ? step.step_slug : undefined;
        });
        assert(plannedSlugs.includes('step-two-a'));
        assert(plannedSlugs.includes('step-two-b'));
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: when only one of two parallel dependencies is met, the join step is
    // NOT delegated to planComplexStage — only the remaining parallel step is. The
    // planning pass completes and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; template instance; four steps
    // (step-one, step-two-a, step-two-b, step-three); edges step-one→step-two-a,
    // step-one→step-two-b, step-two-a→step-three, step-two-b→step-three; one completed
    // child for step-one and one for step-two-a (step-two-b incomplete); planComplexStage
    // returns one child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with step-two-b; not called with step-three;
    // result is { planned: true }.
    it('should NOT enqueue the join step when only one of two parallel dependencies is met', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwoA = buildDialecticStageRecipeStep({ id: 'step-2a', step_slug: 'step-two-a', inputs_required: [] });
        const stepTwoB = buildDialecticStageRecipeStep({ id: 'step-2b', step_slug: 'step-two-b', inputs_required: [] });
        const stepThree = buildDialecticStageRecipeStep({ id: 'step-3', step_slug: 'step-three', inputs_required: [] });
        if (stepOne === null || stepTwoA === null || stepTwoB === null || stepThree === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const edgeOneToTwoA = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2a' });
        const edgeOneToTwoB = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2b' });
        const edgeTwoAToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2a', to_step_id: 'step-3' });
        const edgeTwoBToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2b', to_step_id: 'step-3' });
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedStepOne = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-1' } },
        });
        const completedStepTwoA = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-2a' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: false, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwoA, stepTwoB, stepThree], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [edgeOneToTwoA, edgeOneToTwoB, edgeTwoAToThree, edgeTwoBToThree], error: null } },
                dialectic_generation_jobs: { select: { data: [completedStepOne, completedStepTwoA], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'step-two-b');
        }
        assert('planned' in result);
    });

    // Contract: when all parallel dependencies are met (join point), the join step
    // is delegated to planComplexStage. The planning pass completes and returns
    // { planned: true }.
    // Arrange: buildProcessComplexJobPayload; template instance; four steps
    // (step-one, step-two-a, step-two-b, step-three); edges step-one→step-two-a,
    // step-one→step-two-b, step-two-a→step-three, step-two-b→step-three; completed
    // children for step-one, step-two-a, and step-two-b; planComplexStage returns one
    // child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with step-three; update called with
    // 'waiting_for_children'; result is { planned: true }.
    it('should enqueue the join step when all parallel dependencies are met (join)', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwoA = buildDialecticStageRecipeStep({ id: 'step-2a', step_slug: 'step-two-a', inputs_required: [] });
        const stepTwoB = buildDialecticStageRecipeStep({ id: 'step-2b', step_slug: 'step-two-b', inputs_required: [] });
        const stepThree = buildDialecticStageRecipeStep({ id: 'step-3', step_slug: 'step-three', inputs_required: [] });
        if (stepOne === null || stepTwoA === null || stepTwoB === null || stepThree === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const edgeOneToTwoA = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2a' });
        const edgeOneToTwoB = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2b' });
        const edgeTwoAToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2a', to_step_id: 'step-3' });
        const edgeTwoBToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2b', to_step_id: 'step-3' });
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedStepOne = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-1' } },
        });
        const completedStepTwoA = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-2a' } },
        });
        const completedStepTwoB = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-2b' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: false, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwoA, stepTwoB, stepThree], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [edgeOneToTwoA, edgeOneToTwoB, edgeTwoAToThree, edgeTwoBToThree], error: null } },
                dialectic_generation_jobs: { select: { data: [completedStepOne, completedStepTwoA, completedStepTwoB], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'step-three');
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });
});

describe('processComplexJob with Cloned Parallel Recipe Graph', () => {

    beforeEach(() => {
        resetMockNotificationService();
    });

    // Contract: a cloned instance with a parallel graph forks when the single
    // dependency is met — all parallel successors are delegated to planComplexStage.
    // The planning pass completes and returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload; cloned instance (is_cloned: true);
    // three steps (step-one, step-two-a, step-two-b); edges step-one→step-two-a,
    // step-one→step-two-b; one completed child for step-one; planComplexStage returns
    // one child job per call; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called twice — once with step-two-a, once with
    // step-two-b; update called with 'waiting_for_children'; result is
    // { planned: true }.
    it('should enqueue all parallel steps when their single dependency is met (fork)', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwoA = buildDialecticStageRecipeStep({ id: 'step-2a', step_slug: 'step-two-a', inputs_required: [] });
        const stepTwoB = buildDialecticStageRecipeStep({ id: 'step-2b', step_slug: 'step-two-b', inputs_required: [] });
        if (stepOne === null || stepTwoA === null || stepTwoB === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const edgeOneToTwoA = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2a' });
        const edgeOneToTwoB = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2b' });
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedStepOne = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-1' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwoA, stepTwoB], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [edgeOneToTwoA, edgeOneToTwoB], error: null } },
                dialectic_generation_jobs: { select: { data: [completedStepOne], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 2);
        const plannedSlugs = planComplexStageSpy.calls.map((c) => {
            const step = c.args[3];
            return isRecord(step) ? step.step_slug : undefined;
        });
        assert(plannedSlugs.includes('step-two-a'));
        assert(plannedSlugs.includes('step-two-b'));
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: a cloned instance with a parallel graph does NOT enqueue the join
    // step when only one of two parallel dependencies is met — only the remaining
    // parallel step is delegated. The planning pass completes and returns
    // { planned: true }.
    // Arrange: buildProcessComplexJobPayload; cloned instance; four steps
    // (step-one, step-two-a, step-two-b, step-three); edges step-one→step-two-a,
    // step-one→step-two-b, step-two-a→step-three, step-two-b→step-three; completed
    // children for step-one and step-two-a (step-two-b incomplete); planComplexStage
    // returns one child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with step-two-b; not called with step-three;
    // result is { planned: true }.
    it('should NOT enqueue the join step when only one of two parallel dependencies is met', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwoA = buildDialecticStageRecipeStep({ id: 'step-2a', step_slug: 'step-two-a', inputs_required: [] });
        const stepTwoB = buildDialecticStageRecipeStep({ id: 'step-2b', step_slug: 'step-two-b', inputs_required: [] });
        const stepThree = buildDialecticStageRecipeStep({ id: 'step-3', step_slug: 'step-three', inputs_required: [] });
        if (stepOne === null || stepTwoA === null || stepTwoB === null || stepThree === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const edgeOneToTwoA = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2a' });
        const edgeOneToTwoB = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2b' });
        const edgeTwoAToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2a', to_step_id: 'step-3' });
        const edgeTwoBToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2b', to_step_id: 'step-3' });
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedStepOne = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-1' } },
        });
        const completedStepTwoA = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-2a' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwoA, stepTwoB, stepThree], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [edgeOneToTwoA, edgeOneToTwoB, edgeTwoAToThree, edgeTwoBToThree], error: null } },
                dialectic_generation_jobs: { select: { data: [completedStepOne, completedStepTwoA], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'step-two-b');
        }
        assert('planned' in result);
    });

    // Contract: a cloned instance with a parallel graph enqueues the join step when
    // all parallel dependencies are met. The planning pass completes and returns
    // { planned: true }.
    // Arrange: buildProcessComplexJobPayload; cloned instance; four steps
    // (step-one, step-two-a, step-two-b, step-three); edges step-one→step-two-a,
    // step-one→step-two-b, step-two-a→step-three, step-two-b→step-three; completed
    // children for step-one, step-two-a, and step-two-b; planComplexStage returns one
    // child job; insert and update succeed.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with step-three; update called with
    // 'waiting_for_children'; result is { planned: true }.
    it('should enqueue the join step when all parallel dependencies are met (join)', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwoA = buildDialecticStageRecipeStep({ id: 'step-2a', step_slug: 'step-two-a', inputs_required: [] });
        const stepTwoB = buildDialecticStageRecipeStep({ id: 'step-2b', step_slug: 'step-two-b', inputs_required: [] });
        const stepThree = buildDialecticStageRecipeStep({ id: 'step-3', step_slug: 'step-three', inputs_required: [] });
        if (stepOne === null || stepTwoA === null || stepTwoB === null || stepThree === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const edgeOneToTwoA = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2a' });
        const edgeOneToTwoB = buildDialecticStageRecipeEdge({ from_step_id: 'step-1', to_step_id: 'step-2b' });
        const edgeTwoAToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2a', to_step_id: 'step-3' });
        const edgeTwoBToThree = buildDialecticStageRecipeEdge({ from_step_id: 'step-2b', to_step_id: 'step-3' });
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedStepOne = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-1' } },
        });
        const completedStepTwoA = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-2a' } },
        });
        const completedStepTwoB = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: 'step-2b' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwoA, stepTwoB, stepThree], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [edgeOneToTwoA, edgeOneToTwoB, edgeTwoAToThree, edgeTwoBToThree], error: null } },
                dialectic_generation_jobs: { select: { data: [completedStepOne, completedStepTwoA, completedStepTwoB], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isRecord(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'step-three');
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children';
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });
});
