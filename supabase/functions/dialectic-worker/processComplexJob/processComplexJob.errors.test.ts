import {
    assertEquals,
    assertExists,
    assert,
    assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../../types_db.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { processComplexJob } from '../processComplexJob/processComplexJob.ts';
import {
    PlanComplexStageFn,
} from '../../dialectic-service/dialectic.interface.ts';
import {
    buildDialecticJobRow,
    buildDialecticPlanJobPayload,
    buildProcessComplexJobPayload,
    buildDialecticStageRecipeStep,
    buildDialecticRecipeTemplateStep,
    invalidateDialecticPlanJobPayload,
    invalidateDialecticSkeletonJobPayload,
    invalidateProcessComplexJobPayload,
} from '../../_shared/dialectic.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ContextWindowError } from '../../_shared/utils/errors.ts';
import { isRecord } from '../../_shared/utils/type_guards.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { mockNotificationService, resetMockNotificationService } from '../../_shared/utils/notification.service.mock.ts';
import { createPlanJobContext, createJobContext } from '../createJobContext/createJobContext.ts';
import { buildIPlanJobContext, buildJobContextParams } from '../createJobContext/JobContext.mock.ts';

describe('processComplexJob', () => {

    beforeEach(() => {
        resetMockNotificationService();
    });

    // Error Handling & Input Validation

    // Contract: a first-pass job (prerequisite_job_id absent) whose payload fails
    // isDialecticPlanJobPayload returns the error arm carrying the invalid-payload
    // message with retriable: false, and no row is written.
    // Arrange: ProcessComplexJobPayload invalidated via invalidateDialecticPlanJobPayload
    // corrupting sessionId to null, composed through invalidateProcessComplexJobPayload
    // with prerequisite_job_id null.
    // Act: processComplexJob(ctx, { dbClient }, invalidPayload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if the job payload is not a valid DialecticPlanJobPayload', async () => {
        // Arrange
        const invalidPlanPayload: unknown = invalidateDialecticPlanJobPayload({ sessionId: null });
        const invalidPayload: unknown = invalidateProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ prerequisite_job_id: null }), payload: invalidPlanPayload },
        });
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {});

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, invalidPayload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `[processComplexJob] Job a0000002-0000-4000-a000-000000000002 has an invalid payload for complex processing.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: a deferred-planning job (prerequisite_job_id set) whose payload fails
    // isDialecticSkeletonJobPayload returns the error arm carrying the deferred
    // invalid-payload message with retriable: false, and no row is written.
    // Arrange: DialecticSkeletonJobPayload invalidated via invalidateDialecticSkeletonJobPayload
    // corrupting planner_metadata to null, composed through invalidateProcessComplexJobPayload
    // with prerequisite_job_id set.
    // Act: processComplexJob(ctx, { dbClient }, invalidPayload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if a deferred-planning job has a payload that is not a valid DialecticSkeletonJobPayload', async () => {
        // Arrange
        const invalidSkeletonPayload: unknown = invalidateDialecticSkeletonJobPayload({ planner_metadata: null });
        const invalidPayload: unknown = invalidateProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ prerequisite_job_id: 'prereq-1' }), payload: invalidSkeletonPayload },
        });
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {});

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, invalidPayload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `[processComplexJob] Job a0000002-0000-4000-a000-000000000002 has an invalid payload for deferred planning.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: neither the row nor its payload carries a stage slug — the row's
    // stage_slug is empty and the payload's stageSlug is omitted — returns the error
    // arm carrying the missing-stageSlug message with retriable: false, and no row
    // is written.
    // Arrange: buildProcessComplexJobPayload with job.stage_slug overridden to '' and
    // payload.stageSlug omitted via rest-destructure (the payload still passes
    // isDialecticPlanJobPayload because stageSlug is optional).
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if neither the row nor the payload carries a stageSlug', async () => {
        // Arrange
        const { stageSlug: _omit, ...planPayloadWithoutStageSlug } = buildDialecticPlanJobPayload();
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ stage_slug: '' }), payload: planPayloadWithoutStageSlug },
        });
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {});

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `[processComplexJob] Job a0000002-0000-4000-a000-000000000002 is missing stageSlug.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: the dialectic_stages select returns no row (or a row with no
    // active_recipe_instance_id), so the stage is not found or has no active recipe —
    // returns the error arm carrying the missing-stage message with retriable: false,
    // and no dialectic_generation_jobs update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages select returns empty data so .single() yields no row.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if the stage recipe cannot be found in the database', async () => {
        // Arrange
        const payload = buildProcessComplexJobPayload();
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `Stage 'thesis' not found or has no active recipe.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: the dialectic_stage_recipe_instances select returns no row for the
    // active_recipe_instance_id the stage row carried — returns the error arm carrying
    // the missing-instance message with retriable: false, and no dialectic_generation_jobs
    // update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages select returns a row with active_recipe_instance_id 'instance-1';
    // mock dialectic_stage_recipe_instances select returns empty data so .single() yields
    // no row.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if the recipe instance cannot be found in the database', async () => {
        // Arrange
        const payload = buildProcessComplexJobPayload();
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `Recipe instance not found for stage 'thesis' with instance ID 'instance-1'.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: a cloned instance whose dialectic_stage_recipe_steps select returns
    // an empty array — returns the error arm carrying the no-recipe-steps message with
    // retriable: false, and no dialectic_generation_jobs update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance (is_cloned: true) with
    // id 'instance-1'; mock dialectic_stage_recipe_steps returns empty data.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if a cloned recipe instance has no recipe steps', async () => {
        // Arrange
        const payload = buildProcessComplexJobPayload();
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `Active recipe instance 'instance-1' has no recipe steps.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: a non-cloned instance whose dialectic_recipe_template_steps select
    // returns an empty array — returns the error arm carrying the no-recipe-steps
    // message with retriable: false, and no dialectic_generation_jobs update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a non-cloned instance (is_cloned: false)
    // with template_id 'template-1'; mock dialectic_recipe_template_steps returns empty
    // data.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if a recipe template has no recipe steps', async () => {
        // Arrange
        const payload = buildProcessComplexJobPayload();
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: false, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_recipe_template_steps: {
                    select: { data: [], error: null },
                },
                dialectic_recipe_template_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `Recipe template 'template-1' has no recipe steps.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: a cloned instance whose step rows all fail isDialecticStageRecipeStep
    // — returns the error arm carrying the no-valid-recipe-steps message with
    // retriable: false, and no dialectic_generation_jobs update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance (is_cloned: true); mock
    // dialectic_stage_recipe_steps returns one row built from buildDialecticStageRecipeStep
    // with job_type overridden to 'INVALID', which fails the guard.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if a cloned instance has step rows that all fail isDialecticStageRecipeStep', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep();
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const invalidStepRow: object = { ...validStep, job_type: 'INVALID' };
        const payload = buildProcessComplexJobPayload();
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [invalidStepRow], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `Active recipe instance 'instance-1' has no valid recipe steps.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: a non-cloned instance whose template step rows all fail
    // isDialecticRecipeTemplateStep — returns the error arm carrying the no-valid-recipe-steps
    // message with retriable: false, and no dialectic_generation_jobs update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a non-cloned instance (is_cloned: false) with
    // template_id 'template-1'; mock dialectic_recipe_template_steps returns one row built
    // from buildDialecticRecipeTemplateStep with job_type overridden to 'INVALID', which
    // fails the guard.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with exact message, retriable false, zero update calls on
    // dialectic_generation_jobs.
    it('should fail the job if a template has step rows that all fail isDialecticRecipeTemplateStep', async () => {
        // Arrange
        const invalidTemplateStepRow: object = { ...buildDialecticRecipeTemplateStep(), job_type: 'INVALID' };
        const payload = buildProcessComplexJobPayload();
        const ctx = buildIPlanJobContext();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: false, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_recipe_template_steps: {
                    select: { data: [invalidTemplateStepRow], error: null },
                },
                dialectic_recipe_template_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, `Recipe template 'template-1' has no valid recipe steps.`);
            assertEquals(result.retriable, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: planComplexStage throws a generic Error inside the planning try block
    // — the error is surfaced unchanged in the error arm with retriable: true (transient
    // enqueue/update failures the catch also handles are retriable), and no
    // dialectic_generation_jobs update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step from buildDialecticStageRecipeStep;
    // buildJobContextParams with planComplexStage overridden to a function that throws
    // new Error('Planner failed!'), sliced via createJobContext then createPlanJobContext.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with error.message 'Planner failed!', retriable true, error is
    // not a ContextWindowError, zero update calls on dialectic_generation_jobs.
    it('should fail the job if the "planComplexStage" dependency throws a generic error', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep();
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const throwingPlanner: PlanComplexStageFn = async () => {
            throw new Error('Planner failed!');
        };
        const baseParams = buildJobContextParams({ planComplexStage: throwingPlanner });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, 'Planner failed!');
            assertEquals(result.retriable, true);
            assertEquals(result.error instanceof ContextWindowError, false);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: a generic Error in the planning try block is retriable, so the
    // job_failed notification is NOT sent — the runner will retry, and a job the runner
    // will retry is never told it failed.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step from buildDialecticStageRecipeStep;
    // buildJobContextParams with planComplexStage overridden to a function that throws
    // new Error('Planner failed!'), sliced via createJobContext then createPlanJobContext.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: sendJobNotificationEvent was called zero times.
    it('does not emit job_failed notification when planner throws a generic error', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep();
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const throwingPlanner: PlanComplexStageFn = async () => {
            throw new Error('Planner failed!');
        };
        const baseParams = buildJobContextParams({ planComplexStage: throwingPlanner });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 0);
    });

    // Contract: a ContextWindowError in the planning try block is non-retriable, so the
    // job_failed notification IS sent — its payload carries step_key (required by
    // JobNotificationBase), omits modelId and document_key (PLAN-specific), and carries
    // the error in the ApiError field.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step from buildDialecticStageRecipeStep;
    // buildJobContextParams with planComplexStage overridden to a function that throws
    // new ContextWindowError('Context window exceeded'), sliced via createJobContext then
    // createPlanJobContext.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: sendJobNotificationEvent was called once with a JobFailedPayload whose
    // type is 'job_failed', step_key is a non-empty string, modelId and document_key are
    // absent, and error.message is 'Context window exceeded'.
    it('emits job_failed notification when planner throws a ContextWindowError', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep();
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const throwingPlanner: PlanComplexStageFn = async () => {
            throw new ContextWindowError('Context window exceeded');
        };
        const baseParams = buildJobContextParams({ planComplexStage: throwingPlanner });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1);
        const notificationPayload = mockNotificationService.sendJobNotificationEvent.calls[0].args[0];
        if (notificationPayload.type === 'job_failed') {
            assertEquals(typeof notificationPayload.step_key, 'string');
            assert(notificationPayload.step_key.length > 0);
            assertEquals('modelId' in notificationPayload, false);
            assertEquals('document_key' in notificationPayload, false);
            assertEquals(notificationPayload.error.message, 'Context window exceeded');
        }

    // Contract: planComplexStage throws a ContextWindowError inside the planning try
    // block — the error is surfaced unchanged in the error arm with retriable: false
    // (the context window will not change on retry), and no dialectic_generation_jobs
    // update was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step from buildDialecticStageRecipeStep;
    // buildJobContextParams with planComplexStage overridden to a function that throws
    // new ContextWindowError('Context window exceeded'), sliced via createJobContext then
    // createPlanJobContext.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with error.message 'Context window exceeded', retriable false,
    // error is a ContextWindowError, zero update calls on dialectic_generation_jobs.
    it('should fail the job with a specific message if "planComplexStage" throws a ContextWindowError', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep();
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const throwingPlanner: PlanComplexStageFn = async () => {
            throw new ContextWindowError('Context window exceeded');
        };
        const baseParams = buildJobContextParams({ planComplexStage: throwingPlanner });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.error.message, 'Context window exceeded');
            assertEquals(result.retriable, false);
            assertEquals(result.error instanceof ContextWindowError, true);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 0);
    });

    // Contract: the insert of child jobs fails with a non-idempotency error — the
    // outer catch returns the error arm with retriable: true (transient Postgrest
    // error), and no dialectic_generation_jobs update with status: 'failed' was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step with inputs_required: [];
    // mock dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs
    // select returns empty children, insert returns a Postgrest error, update succeeds;
    // buildJobContextParams with planComplexStage returning one child job.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with retriable true, zero update calls with status: 'failed'.
    it('should fail the job if it fails to insert the new child jobs into the database', async () => {
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
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
                dialectic_generation_jobs: {
                    select: { data: [], error: null },
                    insert: { data: null, error: { name: 'PostgresError', message: 'Insert failed', code: '23505', details: 'duplicate' } },
                    update: { data: null, error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.retriable, true);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const failedUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'failed';
        });
        assertEquals(failedUpdates.length, 0);
    });

    // Contract: the update to waiting_for_children fails — the outer catch returns
    // the error arm with retriable: true (transient Postgrest error), and no
    // dialectic_generation_jobs update with status: 'failed' was issued.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step with inputs_required: [];
    // mock dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs
    // select returns empty children, insert succeeds, update returns a Postgrest error;
    // buildJobContextParams with planComplexStage returning one child job.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: error arm with retriable true, zero update calls with status: 'failed'.
    it('should fail the job if it fails to update its own status to "waiting_for_children"', async () => {
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
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
                dialectic_generation_jobs: {
                    select: { data: [], error: null },
                    insert: { data: null, error: null },
                    update: { data: null, error: { name: 'PostgresError', message: 'Update failed', code: 'P0001', details: null } },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assertEquals(result.retriable, true);
        }
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const failedUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'failed';
        });
        assertEquals(failedUpdates.length, 0);
    });

    // Contract: a child job whose payload has no planner_metadata at all — the child
    // tracking loop throws, indicating planner_metadata is required. The workplan
    // preserves the child-job tracking as-is, so this path still throws.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step; mock dialectic_generation_jobs
    // select returns one child job whose payload is { planner_metadata: undefined }.
    // Act & Assert: processComplexJob throws an error whose message includes
    // 'planner_metadata.recipe_step_id is missing or invalid'.
    it('should throw an error when a completed child job has planner_metadata: undefined', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const ctx = buildIPlanJobContext();
        const payload = buildProcessComplexJobPayload();
        const childWithBadMetadata = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: undefined },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
                dialectic_generation_jobs: {
                    select: { data: [childWithBadMetadata], error: null },
                },
            },
        });

        // Act & Assert
        await assertRejects(
            () => processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload),
            Error,
            'planner_metadata.recipe_step_id is missing or invalid',
        );
    });

    // Contract: a child job whose payload has planner_metadata: {} (empty object,
    // missing recipe_step_id) — the child tracking loop throws.
    // Arrange: same as above but child payload is { planner_metadata: {} }.
    // Act & Assert: processComplexJob throws an error whose message includes
    // 'planner_metadata.recipe_step_id is missing or invalid'.
    it('should throw an error when a completed child job has planner_metadata: {} (missing recipe_step_id)', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const ctx = buildIPlanJobContext();
        const payload = buildProcessComplexJobPayload();
        const childWithEmptyMetadata = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: {} },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
                dialectic_generation_jobs: {
                    select: { data: [childWithEmptyMetadata], error: null },
                },
            },
        });

        // Act & Assert
        await assertRejects(
            () => processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload),
            Error,
            'planner_metadata.recipe_step_id is missing or invalid',
        );
    });

    // Contract: a child job whose payload has planner_metadata: { recipe_step_id: "" }
    // (empty string) — the child tracking loop throws.
    // Arrange: same as above but child payload is { planner_metadata: { recipe_step_id: "" } }.
    // Act & Assert: processComplexJob throws an error whose message includes
    // 'planner_metadata.recipe_step_id is missing or invalid'.
    it('should throw an error when a completed child job has planner_metadata: { recipe_step_id: "" } (empty string)', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const ctx = buildIPlanJobContext();
        const payload = buildProcessComplexJobPayload();
        const childWithEmptyStepId = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: '' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: {
                    select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null },
                },
                dialectic_stage_recipe_instances: {
                    select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null },
                },
                dialectic_stage_recipe_steps: {
                    select: { data: [validStep], error: null },
                },
                dialectic_stage_recipe_edges: {
                    select: { data: [], error: null },
                },
                dialectic_generation_jobs: {
                    select: { data: [childWithEmptyStepId], error: null },
                },
            },
        });

        // Act & Assert
        await assertRejects(
            () => processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload),
            Error,
            'planner_metadata.recipe_step_id is missing or invalid',
        );
    });

    // Contract: a step with a child job in 'retrying' status is excluded from
    // readySteps — planComplexStage is NOT called, and the function returns
    // { planned: true } without enqueuing new work.
    // Arrange: one valid step (inputs_required: []); one child job with status
    // 'retrying' and valid planner_metadata.recipe_step_id matching the step.
    // Act: processComplexJob(ctx, { dbClient }, payload)
    // Assert: planComplexStage spy called 0 times; result is { planned: true }.
    it('should not re-plan a step that has a child EXECUTE job with status retrying', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const retryingChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'retrying',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [retryingChild], error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        assert('planned' in result);
    });

    // Contract: a step with a child job in 'processing' status is excluded from
    // readySteps — planComplexStage is NOT called.
    it('should not re-plan a step that has a child EXECUTE job with status processing', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const processingChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'processing',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [processingChild], error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        assert('planned' in result);
    });

    // Contract: a step with a child job in 'pending' status is excluded from
    // readySteps — planComplexStage is NOT called.
    it('should not re-plan a step that has a child EXECUTE job with status pending', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const pendingChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'pending',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [pendingChild], error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        assert('planned' in result);
    });

    // Contract: two steps, one with a completed child and one with a retrying child —
    // both are excluded from readySteps, planComplexStage is NOT called.
    it('should not re-plan steps that have either completed or in-progress child jobs', async () => {
        // Arrange
        const stepOne = buildDialecticStageRecipeStep({ id: 'step-1', step_slug: 'step-one', inputs_required: [] });
        const stepTwo = buildDialecticStageRecipeStep({ id: 'step-2', step_slug: 'step-two', inputs_required: [] });
        if (stepOne === null || stepTwo === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
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
        const retryingChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'retrying',
            payload: { planner_metadata: { recipe_step_id: 'step-2' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [stepOne, stepTwo], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild, retryingChild], error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        assert('planned' in result);
    });

    // Contract: a step with both completed and retrying child jobs — the retrying
    // (in-progress) job excludes the step from readySteps.
    it('should not re-plan a step that has both completed and retrying child jobs', async () => {
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
        const retryingChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'retrying',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild, retryingChild], error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        assert('planned' in result);
    });

    // Contract: a step with multiple in-progress child jobs (pending + processing) —
    // the step is excluded from readySteps.
    it('should not re-plan a step that has multiple child jobs with mixed in-progress statuses', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const pendingChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'pending',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const processingChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'processing',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [pendingChild, processingChild], error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 0);
        assert('planned' in result);
    });

    // Contract: a step with a 'failed' child job — failed is terminal, so the step
    // IS included in readySteps and planComplexStage IS called.
    it('should allow re-planning a step that has a child job with status failed', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const newChild = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [newChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const failedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'failed',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [failedChild], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        assert('planned' in result);
    });

    // Contract: a step with a 'retry_loop_failed' child job — retry_loop_failed is
    // terminal, so the step IS included in readySteps and planComplexStage IS called.
    it('should allow re-planning a step that has a child job with status retry_loop_failed', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const newChild = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [newChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const retryLoopFailedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'retry_loop_failed',
            payload: { planner_metadata: { recipe_step_id: validStep.id } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [retryLoopFailedChild], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        assert('planned' in result);
    });

    // Contract: a step with no child jobs at all — the step IS included in readySteps
    // and planComplexStage IS called (first-time planning).
    it('should include steps with no child jobs in readySteps', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const newChild = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [newChild];
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
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        assert('planned' in result);
    });

    // Contract: a step with mixed completed and failed child jobs — the step IS
    // included in readySteps (can be re-planned), and planComplexStage is called
    // with a Set of completed source document IDs (the 6th argument) excluding
    // the failed source documents.
    it('should re-plan a step with mixed completed and failed jobs but only for failed source documents', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const newChild = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [newChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedChild1 = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: validStep.id }, document_relationships: { source_group: 'doc-1' } },
        });
        const failedChild = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'failed',
            payload: { planner_metadata: { recipe_step_id: validStep.id }, document_relationships: { source_group: 'doc-2' } },
        });
        const completedChild3 = buildDialecticJobRow({
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: validStep.id }, document_relationships: { source_group: 'doc-3' } },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild1, failedChild, completedChild3], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        assert('planned' in result);
        const completedSourceDocIds = planComplexStageSpy.calls[0].args[5];
        assert(completedSourceDocIds instanceof Set);
        if (completedSourceDocIds instanceof Set) {
            assert(completedSourceDocIds.has('doc-1'));
            assert(completedSourceDocIds.has('doc-3'));
            assertEquals(completedSourceDocIds.has('doc-2'), false);
        }
    });

    // Contract: a step with mixed completed and failed jobs can be re-planned, and
    // the completed contributions remain available — the function does not delete
    // or overwrite the completed child jobs; it only enqueues new ones for the
    // failed source documents.
    it('should preserve completed contributions when re-planning steps with mixed completed and failed jobs', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const newChild = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [newChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const completedChild = buildDialecticJobRow({
            id: 'existing-completed-child',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { planner_metadata: { recipe_step_id: validStep.id }, document_relationships: { source_group: 'doc-1' } },
        });
        const failedChild = buildDialecticJobRow({
            id: 'existing-failed-child',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'failed',
            payload: { planner_metadata: { recipe_step_id: validStep.id }, document_relationships: { source_group: 'doc-2' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [completedChild, failedChild], error: null }, insert: { data: null, error: null }, update: { data: null, error: null }, delete: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, payload);

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        assert('planned' in result);
        // No delete calls on dialectic_generation_jobs — completed contributions are preserved
        const deleteCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'delete');
        assertExists(deleteCalls);
        assertEquals(deleteCalls.callCount, 0);
    });
});
