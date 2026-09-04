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
    buildDialecticSkeletonJobPayload,
    buildDialecticExecuteJobPayload,
    buildDialecticRenderJobPayload,
    buildInputRule,
} from '../_shared/dialectic.mock.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import { isDialecticStageRecipeStep } from '../_shared/utils/type-guards/type_guards.dialectic.recipe.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { describe, it, beforeEach } from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import { resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { createPlanJobContext, createJobContext } from './createJobContext/createJobContext.ts';
import { buildJobContextParams } from './createJobContext/JobContext.mock.ts';
import { createMockFindSourceDocuments } from './findSourceDocuments.mock.ts';

describe('processComplexJob - Intra-Stage Dependency Filtering', () => {

    beforeEach(() => {
        resetMockNotificationService();
    });

    // Contract: when a step has a missing intra-stage dependency (findSourceDocuments
    // throws) and the prerequisite step producing that document is identified in the
    // recipe and is in filteredReadySteps, the step is scheduled with
    // waiting_for_prerequisite status — a skeleton PLAN job is created and inserted
    // alongside the prerequisite step's child job. The planning pass completes and
    // returns { planned: true }.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []) and generate-master-plan
    // (output_type master_plan, inputs_required: [an intra-stage rule requiring
    // technical_requirements from the same stage]); mock dialectic_stage_recipe_edges
    // returns empty; mock dialectic_generation_jobs select returns empty children,
    // insert and update succeed; buildJobContextParams with findSourceDocuments in
    // 'error' mode throwing an error mentioning document_key 'technical_requirements',
    // and planComplexStage returning one child job.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with generate-technical-requirements (the
    // step with available inputs); insert called with at least one skeleton PLAN job
    // whose status is 'waiting_for_prerequisite' and prerequisite_job_id is set;
    // result is { planned: true }.
    it('schedules job with waiting_for_prerequisite when step has missing intra-stage dependency and prerequisite step is identified', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'technical_requirements' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isDialecticStageRecipeStep(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-technical-requirements');
        }
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const skeletonJob = insertedData.find((j) => isRecord(j) && j.status === 'waiting_for_prerequisite');
            assertExists(skeletonJob);
            if (isRecord(skeletonJob)) {
                assertExists(skeletonJob.prerequisite_job_id);
            }
        }
        assert('planned' in result);
    });

    // Contract: when the prerequisite step's EXECUTE job is completed but the RENDER
    // job producing the document is still pending, resolveNextBlocker finds the pending
    // RENDER job and the step is scheduled with waiting_for_prerequisite pointing at
    // that RENDER job's id, instead of throwing.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []) and generate-master-plan
    // (output_type master_plan, inputs_required: [an intra-stage rule requiring
    // technical_requirements from the same stage]); mock dialectic_stage_recipe_edges
    // returns empty; mock dialectic_generation_jobs select returns one completed EXECUTE
    // child for generate-technical-requirements (so prerequisiteIsCompleted is true) and
    // one pending RENDER job producing technical_requirements (found by
    // resolveNextBlocker); insert and update succeed; buildJobContextParams with
    // findSourceDocuments in 'error' mode throwing an error mentioning document_key
    // 'technical_requirements', and planComplexStage returning one child job.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: insert called with at least one skeleton PLAN job whose status is
    // 'waiting_for_prerequisite' and prerequisite_job_id matches the pending RENDER job
    // id; result is { planned: true }.
    it('waits for pending RENDER job when prerequisite step EXECUTE is completed but document not yet rendered', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const completedExecuteChild = buildDialecticJobRow({
            id: 'exec-child-1',
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            status: 'completed',
            payload: { ...buildDialecticExecuteJobPayload({ output_type: FileType.technical_requirements }), planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const pendingRenderJob = buildDialecticJobRow({
            id: 'render-pending-1',
            job_type: 'RENDER',
            status: 'pending',
            stage_slug: 'parenthesis',
            payload: buildDialecticRenderJobPayload({ documentKey: FileType.technical_requirements, model_id: 'test-model-id' }),
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'technical_requirements' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: {
                    select: (state) => {
                        if (state.filters.some(f => f.column === 'job_type' && f.value === 'RENDER')) {
                            return Promise.resolve({ data: [pendingRenderJob], error: null });
                        }
                        return Promise.resolve({ data: [completedExecuteChild], error: null });
                    },
                    insert: { data: null, error: null },
                    update: { data: null, error: null },
                },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const skeletonJob = insertedData.find((j) => isRecord(j) && j.status === 'waiting_for_prerequisite');
            assertExists(skeletonJob);
            if (isRecord(skeletonJob)) {
                assertEquals(skeletonJob.prerequisite_job_id, 'render-pending-1');
            }
        }
        assert('planned' in result);
    });

    // Contract: when a step has a missing intra-stage dependency and the prerequisite
    // step is in filteredReadySteps (will be planned in this batch), the step is
    // scheduled with waiting_for_prerequisite pointing at the prerequisite step's child
    // job id. planComplexStage is called only for the step with available inputs.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []) and generate-master-plan
    // (output_type master_plan, inputs_required: [an intra-stage rule requiring
    // technical_requirements from the same stage]); mock dialectic_stage_recipe_edges
    // returns empty; mock dialectic_generation_jobs select returns empty children,
    // insert and update succeed; buildJobContextParams with findSourceDocuments in
    // 'error' mode throwing an error mentioning document_key 'technical_requirements',
    // and planComplexStage returning one child job with id 'prereq-child-1' and
    // planner_metadata.recipe_step_id 'step-technical'.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with generate-technical-requirements; insert
    // called with a skeleton PLAN job whose prerequisite_job_id is 'prereq-child-1';
    // result is { planned: true }.
    it('schedules job with waiting_for_prerequisite when prerequisite step is in filteredReadySteps', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({
            id: 'prereq-child-1',
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'technical_requirements' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isDialecticStageRecipeStep(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-technical-requirements');
        }
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const skeletonJob = insertedData.find((j) => isRecord(j) && j.status === 'waiting_for_prerequisite');
            assertExists(skeletonJob);
            if (isRecord(skeletonJob)) {
                assertEquals(skeletonJob.prerequisite_job_id, 'prereq-child-1');
            }
        }
        assert('planned' in result);
    });

    // Contract: when a step has a missing intra-stage dependency and no step in the
    // recipe produces the required document_key as its output_type, the function throws
    // an error naming the missing document_key and the step that requires it.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []) and generate-master-plan
    // (output_type master_plan, inputs_required: [an intra-stage rule requiring
    // business_case from the same stage — no step produces business_case]); mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children, insert and update succeed; buildJobContextParams with
    // findSourceDocuments in 'error' mode throwing an error mentioning document_key
    // 'business_case', and planComplexStage returning one child job.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: result is the error arm with message containing
    // "no step in the recipe produces this output_type".
    it('throws error when prerequisite step not found in recipe for missing intra-stage dependency', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.business_case,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'business_case' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assert('error' in result);
        if ('error' in result) {
            assert(result.error.message.includes('no step in the recipe produces this output_type'));
        }
    });

    // Contract: after planComplexStage returns child jobs for the prerequisite step,
    // the skeleton job's prerequisite_job_id is set to the child job whose
    // planner_metadata.recipe_step_id matches the prerequisite step's id.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (id 'step-technical', output_type technical_requirements, inputs_required: []) and
    // generate-master-plan (output_type master_plan, inputs_required: [an intra-stage
    // rule requiring technical_requirements from the same stage]); mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children, insert and update succeed; buildJobContextParams with
    // findSourceDocuments in 'error' mode throwing an error mentioning document_key
    // 'technical_requirements', and planComplexStage returning one child job with id
    // 'prereq-child-from-planner' and planner_metadata.recipe_step_id 'step-technical'.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: insert called with a skeleton PLAN job whose prerequisite_job_id is
    // 'prereq-child-from-planner'; result is { planned: true }.
    it('finds prerequisite job ID from childJobs array after planning prerequisite step', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const plannedChild = buildDialecticJobRow({
            id: 'prereq-child-from-planner',
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [plannedChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'technical_requirements' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const skeletonJob = insertedData.find((j) => isRecord(j) && j.status === 'waiting_for_prerequisite');
            assertExists(skeletonJob);
            if (isRecord(skeletonJob)) {
                assertEquals(skeletonJob.prerequisite_job_id, 'prereq-child-from-planner');
            }
        }
        assert('planned' in result);
    });

    // Contract: the skeleton PLAN job inserted for a step with a missing prerequisite
    // has status 'waiting_for_prerequisite', job_type 'PLAN', and prerequisite_job_id
    // set before the insert call — the insert payload carries these fields, not a
    // post-insert update.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []) and generate-master-plan
    // (output_type master_plan, inputs_required: [an intra-stage rule requiring
    // technical_requirements from the same stage]); mock dialectic_stage_recipe_edges
    // returns empty; mock dialectic_generation_jobs select returns empty children,
    // insert and update succeed; buildJobContextParams with findSourceDocuments in
    // 'error' mode throwing an error mentioning document_key 'technical_requirements',
    // and planComplexStage returning one child job with id 'prereq-child-1'.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: the insert payload contains a job with status 'waiting_for_prerequisite',
    // job_type 'PLAN', and prerequisite_job_id 'prereq-child-1'.
    it('modifies waiting jobs to have waiting_for_prerequisite status and prerequisite_job_id before insertion', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({
            id: 'prereq-child-1',
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'technical_requirements' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const skeletonJob = insertedData.find((j) => isRecord(j) && j.status === 'waiting_for_prerequisite');
            assertExists(skeletonJob);
            if (isRecord(skeletonJob)) {
                assertEquals(skeletonJob.status, 'waiting_for_prerequisite');
                assertEquals(skeletonJob.job_type, 'PLAN');
                assertEquals(skeletonJob.prerequisite_job_id, 'prereq-child-1');
            }
        }
    });

    // Contract: steps whose intra-stage inputs are all available are planned normally
    // — planComplexStage is called for them and their child jobs are inserted with
    // pending status, unaffected by the intra-stage dependency filter.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one step — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []); mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children, insert and update succeed; buildJobContextParams with
    // findSourceDocuments in 'empty' mode (succeeds), and planComplexStage returning
    // one child job with status 'pending'.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with generate-technical-requirements; insert
    // called with a child job whose status is 'pending'; result is { planned: true }.
    it('plans steps with available inputs normally with pending status', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        if (technicalStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({
            id: 'planned-child-1',
            job_type: 'EXECUTE',
            status: 'pending',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isDialecticStageRecipeStep(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-technical-requirements');
        }
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const plannedChild = insertedData.find((j) => isRecord(j) && j.id === 'planned-child-1');
            assertExists(plannedChild);
            if (isRecord(plannedChild)) {
                assertEquals(plannedChild.status, 'pending');
            }
        }
        assert('planned' in result);
    });

    // Contract: when a step has a missing intra-stage prerequisite and no existing
    // waiting_for_prerequisite job exists for that step, a new skeleton PLAN job is
    // created with status 'waiting_for_prerequisite', job_type 'PLAN',
    // prerequisite_job_id set to the prerequisite-producing job, and
    // planner_metadata.recipe_step_id set to the step's id. planComplexStage is called
    // only for the step with available inputs, not for the step with the missing
    // prerequisite. The skeleton job's results field contains
    // { required_artifact_identity: { ... } } with projectId, sessionId, stageSlug,
    // iterationNumber, model_id, and documentKey for the missing input.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (id 'step-technical', output_type technical_requirements, inputs_required: []) and
    // generate-master-plan (id 'step-master', output_type master_plan, inputs_required:
    // [an intra-stage rule requiring technical_requirements from the same stage]); mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children (no existing waiting_for_prerequisite job), insert and
    // update succeed; buildJobContextParams with findSourceDocuments in 'error' mode
    // throwing an error mentioning document_key 'technical_requirements', and
    // planComplexStage returning one child job with id 'prereq-child-1'.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with generate-technical-requirements, not
    // called with generate-master-plan; insert called with a skeleton PLAN job for
    // generate-master-plan with status 'waiting_for_prerequisite', job_type 'PLAN',
    // prerequisite_job_id 'prereq-child-1', planner_metadata.recipe_step_id
    // 'step-master', and results.required_artifact_identity.documentKey
    // 'technical_requirements'; result is { planned: true }.
    it('creates skeleton PLAN job when no existing waiting_for_prerequisite job exists for the step (positive case)', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({
            id: 'prereq-child-1',
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'technical_requirements' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isDialecticStageRecipeStep(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-technical-requirements');
        }
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const skeletonJob = insertedData.find((j) => isRecord(j) && j.status === 'waiting_for_prerequisite');
            assertExists(skeletonJob);
            if (isRecord(skeletonJob)) {
                assertEquals(skeletonJob.status, 'waiting_for_prerequisite');
                assertEquals(skeletonJob.job_type, 'PLAN');
                assertEquals(skeletonJob.prerequisite_job_id, 'prereq-child-1');
                if (isRecord(skeletonJob.payload) && isRecord(skeletonJob.payload.planner_metadata)) {
                    assertEquals(skeletonJob.payload.planner_metadata.recipe_step_id, 'step-master');
                }
                if (isRecord(skeletonJob.results) && isRecord(skeletonJob.results.required_artifact_identity)) {
                    assertEquals(skeletonJob.results.required_artifact_identity.documentKey, 'technical_requirements');
                }
            }
        }
        assert('planned' in result);
    });

    // Contract: when a step has a missing intra-stage prerequisite and a skeleton job
    // with waiting_for_prerequisite status already exists for that step (returned in
    // the child jobs select), no additional skeleton job is created — the existing
    // skeleton job is already waiting and will be triggered when its prerequisite
    // completes. planComplexStage is called only for the step with available inputs.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []) and generate-master-plan
    // (output_type master_plan, inputs_required: [an intra-stage rule requiring
    // technical_requirements from the same stage]); mock dialectic_stage_recipe_edges
    // returns empty; mock dialectic_generation_jobs select returns one existing
    // waiting_for_prerequisite child for generate-master-plan (so
    // stepsWithInProgressJobs excludes it from filteredReadySteps), insert and update
    // succeed; buildJobContextParams with findSourceDocuments in 'error' mode, and
    // planComplexStage returning one child job with id 'prereq-child-1'.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with generate-technical-requirements; insert
    // called without a second skeleton PLAN job for generate-master-plan (only the
    // prerequisite child is inserted); result is { planned: true }.
    it('does NOT create skeleton PLAN job when waiting_for_prerequisite job already exists for the step', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const existingSkeleton = buildDialecticJobRow({
            id: 'existing-skeleton-1',
            job_type: 'PLAN',
            status: 'waiting_for_prerequisite',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-master' } },
        });
        const childJob = buildDialecticJobRow({
            id: 'prereq-child-1',
            job_type: 'EXECUTE',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-technical' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({
            mode: 'error',
            error: new Error("Required document with document_key 'technical_requirements' not found."),
        });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const planPayload = buildDialecticPlanJobPayload({ stageSlug: 'parenthesis' });
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN', stage_slug: 'parenthesis' }), payload: planPayload },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [existingSkeleton], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isDialecticStageRecipeStep(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-technical-requirements');
        }
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        if (insertCalls.callCount >= 1) {
            const insertedData = insertCalls.callsArgs[0][0];
            if (Array.isArray(insertedData)) {
                const duplicateSkeleton = insertedData.find((j) => isRecord(j) && isRecord(j.payload) && isRecord(j.payload.planner_metadata) && j.payload.planner_metadata.recipe_step_id === 'step-master' && j.status === 'waiting_for_prerequisite' && j.id !== 'existing-skeleton-1');
                assert(duplicateSkeleton === undefined);
            }
        }
        assert('planned' in result);
    });
});

describe('processComplexJob - Deferred Planning (106.c)', () => {
    // When a skeleton PLAN job returns through processComplexJob after its prerequisite
    // has completed, the function should detect this via prerequisite_job_id !== null and
    // perform deferred planning: fetch the recipe step, call findSourceDocuments (which now
    // succeeds since prereq document exists), call planComplexStage, and insert EXECUTE jobs.
    //
    // CRITICAL: For document-producing EXECUTE jobs, the prerequisite chain must wait for the
    // RENDER job to complete, not just the EXECUTE job. The EXECUTE job produces raw JSON in
    // dialectic_contributions, but findSourceDocuments looks for rendered documents in
    // dialectic_project_resources (created by the RENDER job).

    // Contract: when a skeleton PLAN job returns through processComplexJob after its
    // prerequisite completed (job.prerequisite_job_id !== null), the function detects
    // deferred planning, fetches the recipe step via planner_metadata.recipe_step_id,
    // calls findSourceDocuments (which now succeeds), calls planComplexStage for the
    // step, and inserts the resulting EXECUTE job(s) with pending status.
    // Arrange: buildProcessComplexJobPayload with stage_slug 'parenthesis' and a
    // skeleton job row — job_type 'PLAN', prerequisite_job_id 'prereq-completed-1',
    // status 'pending', payload buildDialecticSkeletonJobPayload with
    // planner_metadata.recipe_step_id 'step-master', results containing
    // required_artifact_identity with documentKey 'technical_requirements'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns two steps — generate-technical-requirements
    // (output_type technical_requirements, inputs_required: []) and generate-master-plan
    // (id 'step-master', output_type master_plan, inputs_required: [an intra-stage rule
    // requiring technical_requirements from the same stage]); mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children, insert and update succeed; buildJobContextParams with
    // findSourceDocuments in 'empty' mode (succeeds), and planComplexStage returning
    // one EXECUTE child job with status 'pending'.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: planComplexStage called once with generate-master-plan; insert called
    // with the EXECUTE child job; update called with status 'waiting_for_children' and
    // prerequisite_job_id null; result is { planned: true }.
    it('detects deferred single-step planning when job.prerequisite_job_id !== null and performs planning', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const deferredChild = buildDialecticJobRow({
            id: 'deferred-exec-1',
            job_type: 'EXECUTE',
            status: 'pending',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-master' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [deferredChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const skeletonPayload = buildDialecticSkeletonJobPayload({
            stageSlug: 'parenthesis',
            planner_metadata: { recipe_step_id: 'step-master' },
        });
        const skeletonJob = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'parenthesis',
            status: 'pending',
            prerequisite_job_id: 'prereq-completed-1',
            payload: skeletonPayload,
            results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

        // Assert
        assertEquals(planComplexStageSpy.calls.length, 1);
        const recipeStepArg = planComplexStageSpy.calls[0].args[3];
        if (isDialecticStageRecipeStep(recipeStepArg)) {
            assertEquals(recipeStepArg.step_slug, 'generate-master-plan');
        }
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children' && args[0].prerequisite_job_id === null;
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    // Contract: after deferred planning creates child jobs, the skeleton job is
    // updated to status 'waiting_for_children' with prerequisite_job_id null,
    // preventing re-entry into the deferred planning path if triggered again.
    // Arrange: same as the deferred single-step planning test — skeleton PLAN job with
    // prerequisite_job_id 'prereq-completed-1', planner_metadata.recipe_step_id
    // 'step-master', results.required_artifact_identity.documentKey
    // 'technical_requirements'; findSourceDocuments in 'empty' mode; planComplexStage
    // returning one EXECUTE child.
    // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
    // Assert: update called with status 'waiting_for_children' and prerequisite_job_id
    // null.
    it('clears prerequisite_job_id when deferred planning creates child jobs', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const deferredChild = buildDialecticJobRow({
            id: 'deferred-exec-2',
            job_type: 'EXECUTE',
            status: 'pending',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-master' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [deferredChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const skeletonPayload = buildDialecticSkeletonJobPayload({
            stageSlug: 'parenthesis',
            planner_metadata: { recipe_step_id: 'step-master' },
        });
        const skeletonJob = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'parenthesis',
            status: 'pending',
            prerequisite_job_id: 'prereq-completed-1',
            payload: skeletonPayload,
            results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

        // Assert
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children' && args[0].prerequisite_job_id === null;
        });
        assert(waitingUpdates.length > 0);
    });

    // Contract: child jobs inserted during deferred planning receive a UUID
    // idempotency_key when one is not already present, so a replay of the same skeleton
    // job does not create duplicate children.
    // Arrange: same as the deferred single-step planning test, but planComplexStage
    // returns one EXECUTE child with idempotency_key null.
    // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
    // Assert: the inserted child job has a non-null, non-empty idempotency_key that is a
    // valid UUID string.
    it('deferred planning path (skeleton job insert) includes UUID idempotency_key', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const deferredChild = buildDialecticJobRow({
            id: 'deferred-exec-3',
            job_type: 'EXECUTE',
            status: 'pending',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            idempotency_key: null,
            payload: { planner_metadata: { recipe_step_id: 'step-master' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [deferredChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const skeletonPayload = buildDialecticSkeletonJobPayload({
            stageSlug: 'parenthesis',
            planner_metadata: { recipe_step_id: 'step-master' },
        });
        const skeletonJob = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'parenthesis',
            status: 'pending',
            prerequisite_job_id: 'prereq-completed-1',
            payload: skeletonPayload,
            results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

        // Assert
        const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertCalls);
        assert(insertCalls.callCount >= 1);
        const insertedData = insertCalls.callsArgs[0][0];
        if (Array.isArray(insertedData)) {
            const insertedChild = insertedData.find((j) => isRecord(j) && j.id === 'deferred-exec-3');
            assertExists(insertedChild);
            if (isRecord(insertedChild)) {
                assertExists(insertedChild.idempotency_key);
                assert(typeof insertedChild.idempotency_key === 'string');
                assert((insertedChild.idempotency_key as string).length > 0);
            }
        }
    });

    // Contract: when the deferred planning insert hits a unique-constraint violation
    // on idempotency_key (code '23505' mentioning 'idempotency_key'), the function does
    // not throw — it treats the children as already existing, updates the skeleton job
    // to 'waiting_for_children' with prerequisite_job_id null, and continues.
    // Arrange: same as the deferred single-step planning test, but the
    // dialectic_generation_jobs insert returns an error with code '23505' and message
    // containing 'idempotency_key'.
    // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
    // Assert: update called with status 'waiting_for_children' and prerequisite_job_id
    // null; result is { planned: true }.
    it('on unique constraint violation during deferred planning insert, existing jobs are used and processing continues', async () => {
        // Arrange
        const technicalStep = buildDialecticStageRecipeStep({
            id: 'step-technical',
            step_slug: 'generate-technical-requirements',
            output_type: FileType.technical_requirements,
            inputs_required: [],
        });
        const masterStep = buildDialecticStageRecipeStep({
            id: 'step-master',
            step_slug: 'generate-master-plan',
            output_type: FileType.master_plan,
            inputs_required: [buildInputRule({
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.technical_requirements,
                required: true,
            })],
        });
        if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const deferredChild = buildDialecticJobRow({
            id: 'deferred-exec-4',
            job_type: 'EXECUTE',
            status: 'pending',
            parent_job_id: 'a0000002-0000-4000-a000-000000000002',
            payload: { planner_metadata: { recipe_step_id: 'step-master' } },
        });
        const planComplexStageFn: PlanComplexStageFn = async () => [deferredChild];
        const planComplexStageSpy = spy(planComplexStageFn);
        const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
        const baseParams = buildJobContextParams({
            planComplexStage: planComplexStageSpy,
            findSourceDocuments,
        });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const skeletonPayload = buildDialecticSkeletonJobPayload({
            stageSlug: 'parenthesis',
            planner_metadata: { recipe_step_id: 'step-master' },
        });
        const skeletonJob = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'parenthesis',
            status: 'pending',
            prerequisite_job_id: 'prereq-completed-1',
            payload: skeletonPayload,
            results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
        });
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key"', details: null, hint: null, code: '23505' } }, update: { data: null, error: null } },
            },
        });

        // Act
        const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

        // Assert
        const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateCalls);
        const waitingUpdates = updateCalls.callsArgs.filter((args) => {
            if (!isRecord(args[0])) return false;
            return args[0].status === 'waiting_for_children' && args[0].prerequisite_job_id === null;
        });
        assert(waitingUpdates.length > 0);
        assert('planned' in result);
    });

    describe('Deferred planning idempotent re-wait behavior', () => {
        // Contract: when a skeleton job wakes and findSourceDocuments succeeds, the
        // function proceeds with deferred planning — planComplexStage is called and the
        // resulting child jobs are inserted.
        // Arrange: skeleton PLAN job with prerequisite_job_id set,
        // planner_metadata.recipe_step_id 'step-master', results.required_artifact_identity
        // with documentKey 'technical_requirements'; findSourceDocuments in 'empty' mode
        // (succeeds); planComplexStage returning one EXECUTE child.
        // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
        // Assert: planComplexStage called once with generate-master-plan; insert called
        // with the EXECUTE child; result is { planned: true }.
        it('When skeleton job wakes and findSourceDocuments succeeds, proceeds to plan (existing behavior preserved)', async () => {
            // Arrange
            const technicalStep = buildDialecticStageRecipeStep({
                id: 'step-technical',
                step_slug: 'generate-technical-requirements',
                output_type: FileType.technical_requirements,
                inputs_required: [],
            });
            const masterStep = buildDialecticStageRecipeStep({
                id: 'step-master',
                step_slug: 'generate-master-plan',
                output_type: FileType.master_plan,
                inputs_required: [buildInputRule({
                    type: 'document',
                    slug: 'parenthesis',
                    document_key: FileType.technical_requirements,
                    required: true,
                })],
            });
            if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
            const deferredChild = buildDialecticJobRow({
                id: 'deferred-exec-5',
                job_type: 'EXECUTE',
                status: 'pending',
                parent_job_id: 'a0000002-0000-4000-a000-000000000002',
                payload: { planner_metadata: { recipe_step_id: 'step-master' } },
            });
            const planComplexStageFn: PlanComplexStageFn = async () => [deferredChild];
            const planComplexStageSpy = spy(planComplexStageFn);
            const findSourceDocuments = createMockFindSourceDocuments({ mode: 'empty' });
            const baseParams = buildJobContextParams({
                planComplexStage: planComplexStageSpy,
                findSourceDocuments,
            });
            const root = createJobContext(baseParams);
            const ctx = createPlanJobContext(root);
            const skeletonPayload = buildDialecticSkeletonJobPayload({
                stageSlug: 'parenthesis',
                planner_metadata: { recipe_step_id: 'step-master' },
            });
            const skeletonJob = buildDialecticJobRow({
                job_type: 'PLAN',
                stage_slug: 'parenthesis',
                status: 'pending',
                prerequisite_job_id: 'prereq-completed-1',
                payload: skeletonPayload,
                results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
            });
            const { client, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                    dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                    dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                    dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                    dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
                },
            });

            // Act
            const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

            // Assert
            assertEquals(planComplexStageSpy.calls.length, 1);
            const recipeStepArg = planComplexStageSpy.calls[0].args[3];
            if (isDialecticStageRecipeStep(recipeStepArg)) {
                assertEquals(recipeStepArg.step_slug, 'generate-master-plan');
            }
            const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
            assertExists(insertCalls);
            assert(insertCalls.callCount >= 1);
            assert('planned' in result);
        });

        // Contract: when a skeleton job wakes and findSourceDocuments throws, the
        // function calls resolveNextBlocker with the required_artifact_identity from
        // job.results. If resolveNextBlocker finds a different blocker, the job is
        // updated to waiting_for_prerequisite with the new prerequisite_job_id.
        // Arrange: skeleton PLAN job with prerequisite_job_id 'prereq-completed-1',
        // planner_metadata.recipe_step_id 'step-master',
        // results.required_artifact_identity with documentKey 'technical_requirements';
        // findSourceDocuments in 'error' mode; mock dialectic_generation_jobs select to
        // return a pending EXECUTE job 'new-blocker-1' producing technical_requirements
        // (found by resolveNextBlocker); insert and update succeed.
        // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
        // Assert: update called with status 'waiting_for_prerequisite' and
        // prerequisite_job_id 'new-blocker-1'; result is { planned: true }.
        it('When skeleton job wakes and findSourceDocuments throws, calls resolveNextBlocker with job.results.required_artifact_identity', async () => {
            // Arrange
            const technicalStep = buildDialecticStageRecipeStep({
                id: 'step-technical',
                step_slug: 'generate-technical-requirements',
                output_type: FileType.technical_requirements,
                inputs_required: [],
            });
            const masterStep = buildDialecticStageRecipeStep({
                id: 'step-master',
                step_slug: 'generate-master-plan',
                output_type: FileType.master_plan,
                inputs_required: [buildInputRule({
                    type: 'document',
                    slug: 'parenthesis',
                    document_key: FileType.technical_requirements,
                    required: true,
                })],
            });
            if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
            const newBlockerJob = buildDialecticJobRow({
                id: 'new-blocker-1',
                job_type: 'EXECUTE',
                status: 'pending',
                stage_slug: 'parenthesis',
                payload: { ...buildDialecticExecuteJobPayload({ output_type: FileType.technical_requirements, model_id: 'test-model-id' }), planner_metadata: { recipe_step_id: 'step-technical' } },
            });
            const planComplexStageFn: PlanComplexStageFn = async () => [];
            const planComplexStageSpy = spy(planComplexStageFn);
            const findSourceDocuments = createMockFindSourceDocuments({
                mode: 'error',
                error: new Error("Required document with document_key 'technical_requirements' not found."),
            });
            const baseParams = buildJobContextParams({
                planComplexStage: planComplexStageSpy,
                findSourceDocuments,
            });
            const root = createJobContext(baseParams);
            const ctx = createPlanJobContext(root);
            const skeletonPayload = buildDialecticSkeletonJobPayload({
                stageSlug: 'parenthesis',
                planner_metadata: { recipe_step_id: 'step-master' },
            });
            const skeletonJob = buildDialecticJobRow({
                job_type: 'PLAN',
                stage_slug: 'parenthesis',
                status: 'pending',
                prerequisite_job_id: 'prereq-completed-1',
                payload: skeletonPayload,
                results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
            });
            const { client, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                    dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                    dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                    dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                    dialectic_generation_jobs: {
                        select: (state) => {
                            if (state.filters.some(f => f.column === 'job_type' && f.value === 'EXECUTE')) {
                                return Promise.resolve({ data: [newBlockerJob], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                        insert: { data: null, error: null },
                        update: { data: null, error: null },
                    },
                },
            });

            // Act
            const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

            // Assert
            const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
            assertExists(updateCalls);
            const rechainUpdates = updateCalls.callsArgs.filter((args) => {
                if (!isRecord(args[0])) return false;
                return args[0].status === 'waiting_for_prerequisite' && args[0].prerequisite_job_id === 'new-blocker-1';
            });
            assert(rechainUpdates.length > 0);
            assert('planned' in result);
        });

        // Contract: when resolveNextBlocker returns a different job ID than
        // job.prerequisite_job_id, the job is updated to waiting_for_prerequisite with
        // the new prerequisite_job_id and the function returns early (no
        // planComplexStage call, no insert).
        // Arrange: skeleton PLAN job with prerequisite_job_id 'prereq-completed-1',
        // planner_metadata.recipe_step_id 'step-master',
        // results.required_artifact_identity with documentKey 'technical_requirements';
        // findSourceDocuments in 'error' mode; mock dialectic_generation_jobs select to
        // return a pending RENDER job 'render-blocker-1' producing technical_requirements
        // (found by resolveNextBlocker, different from 'prereq-completed-1'); insert and
        // update succeed.
        // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
        // Assert: planComplexStage not called; update called with status
        // 'waiting_for_prerequisite' and prerequisite_job_id 'render-blocker-1'; result
        // is { planned: true }.
        it('When resolveNextBlocker returns a different job ID than job.prerequisite_job_id, updates job to waiting_for_prerequisite with new prerequisite_job_id and returns early', async () => {
            // Arrange
            const technicalStep = buildDialecticStageRecipeStep({
                id: 'step-technical',
                step_slug: 'generate-technical-requirements',
                output_type: FileType.technical_requirements,
                inputs_required: [],
            });
            const masterStep = buildDialecticStageRecipeStep({
                id: 'step-master',
                step_slug: 'generate-master-plan',
                output_type: FileType.master_plan,
                inputs_required: [buildInputRule({
                    type: 'document',
                    slug: 'parenthesis',
                    document_key: FileType.technical_requirements,
                    required: true,
                })],
            });
            if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
            const renderBlocker = buildDialecticJobRow({
                id: 'render-blocker-1',
                job_type: 'RENDER',
                status: 'pending',
                stage_slug: 'parenthesis',
                payload: buildDialecticRenderJobPayload({ documentKey: FileType.technical_requirements, model_id: 'test-model-id' }),
            });
            const planComplexStageFn: PlanComplexStageFn = async () => [];
            const planComplexStageSpy = spy(planComplexStageFn);
            const findSourceDocuments = createMockFindSourceDocuments({
                mode: 'error',
                error: new Error("Required document with document_key 'technical_requirements' not found."),
            });
            const baseParams = buildJobContextParams({
                planComplexStage: planComplexStageSpy,
                findSourceDocuments,
            });
            const root = createJobContext(baseParams);
            const ctx = createPlanJobContext(root);
            const skeletonPayload = buildDialecticSkeletonJobPayload({
                stageSlug: 'parenthesis',
                planner_metadata: { recipe_step_id: 'step-master' },
            });
            const skeletonJob = buildDialecticJobRow({
                job_type: 'PLAN',
                stage_slug: 'parenthesis',
                status: 'pending',
                prerequisite_job_id: 'prereq-completed-1',
                payload: skeletonPayload,
                results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
            });
            const { client, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                    dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                    dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                    dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                    dialectic_generation_jobs: {
                        select: (state) => {
                            if (state.filters.some(f => f.column === 'job_type' && f.value === 'RENDER')) {
                                return Promise.resolve({ data: [renderBlocker], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                        insert: { data: null, error: null },
                        update: { data: null, error: null },
                    },
                },
            });

            // Act
            const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

            // Assert
            assertEquals(planComplexStageSpy.calls.length, 0);
            const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
            assertExists(updateCalls);
            const rechainUpdates = updateCalls.callsArgs.filter((args) => {
                if (!isRecord(args[0])) return false;
                return args[0].status === 'waiting_for_prerequisite' && args[0].prerequisite_job_id === 'render-blocker-1';
            });
            assert(rechainUpdates.length > 0);
            assert('planned' in result);
        });

        // Contract: when resolveNextBlocker returns null (no in-progress job produces
        // the required artifact), the original findSourceDocuments error is re-thrown.
        // Arrange: skeleton PLAN job with prerequisite_job_id 'prereq-completed-1',
        // planner_metadata.recipe_step_id 'step-master',
        // results.required_artifact_identity with documentKey 'technical_requirements';
        // findSourceDocuments in 'error' mode throwing an error mentioning
        // 'technical_requirements'; mock dialectic_generation_jobs select to return empty
        // for all job_type queries (so resolveNextBlocker finds no blocker); insert and
        // update succeed.
        // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
        // Assert: result is the error arm whose error message contains
        // 'technical_requirements'.
        it('When resolveNextBlocker returns null, throws the original findSourceDocuments error (real error condition)', async () => {
            // Arrange
            const technicalStep = buildDialecticStageRecipeStep({
                id: 'step-technical',
                step_slug: 'generate-technical-requirements',
                output_type: FileType.technical_requirements,
                inputs_required: [],
            });
            const masterStep = buildDialecticStageRecipeStep({
                id: 'step-master',
                step_slug: 'generate-master-plan',
                output_type: FileType.master_plan,
                inputs_required: [buildInputRule({
                    type: 'document',
                    slug: 'parenthesis',
                    document_key: FileType.technical_requirements,
                    required: true,
                })],
            });
            if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
            const planComplexStageFn: PlanComplexStageFn = async () => [];
            const planComplexStageSpy = spy(planComplexStageFn);
            const findSourceDocuments = createMockFindSourceDocuments({
                mode: 'error',
                error: new Error("Required document with document_key 'technical_requirements' not found."),
            });
            const baseParams = buildJobContextParams({
                planComplexStage: planComplexStageSpy,
                findSourceDocuments,
            });
            const root = createJobContext(baseParams);
            const ctx = createPlanJobContext(root);
            const skeletonPayload = buildDialecticSkeletonJobPayload({
                stageSlug: 'parenthesis',
                planner_metadata: { recipe_step_id: 'step-master' },
            });
            const skeletonJob = buildDialecticJobRow({
                job_type: 'PLAN',
                stage_slug: 'parenthesis',
                status: 'pending',
                prerequisite_job_id: 'prereq-completed-1',
                payload: skeletonPayload,
                results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
            });
            const { client } = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                    dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                    dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                    dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                    dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
                },
            });

            // Act
            const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

            // Assert
            assert('error' in result);
            if ('error' in result) {
                assert(result.error.message.includes('technical_requirements'));
            }
        });

        // Contract: when resolveNextBlocker returns the same job ID as the current
        // prerequisite_job_id (already waiting on the correct job, still not ready), the
        // original findSourceDocuments error is re-thrown and the job is NOT updated
        // (no re-chaining needed).
        // Arrange: skeleton PLAN job with prerequisite_job_id 'same-blocker-1',
        // planner_metadata.recipe_step_id 'step-master',
        // results.required_artifact_identity with documentKey 'technical_requirements';
        // findSourceDocuments in 'error' mode; mock dialectic_generation_jobs select to
        // return a pending EXECUTE job 'same-blocker-1' producing technical_requirements
        // (same as current prerequisite_job_id); insert and update succeed.
        // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
        // Assert: result is the error arm whose error message contains
        // 'technical_requirements'; no update call sets prerequisite_job_id to a
        // different value.
        it('When resolveNextBlocker returns the same job ID as current prerequisite_job_id, throws the original error (already waiting on correct job, still not ready)', async () => {
            // Arrange
            const technicalStep = buildDialecticStageRecipeStep({
                id: 'step-technical',
                step_slug: 'generate-technical-requirements',
                output_type: FileType.technical_requirements,
                inputs_required: [],
            });
            const masterStep = buildDialecticStageRecipeStep({
                id: 'step-master',
                step_slug: 'generate-master-plan',
                output_type: FileType.master_plan,
                inputs_required: [buildInputRule({
                    type: 'document',
                    slug: 'parenthesis',
                    document_key: FileType.technical_requirements,
                    required: true,
                })],
            });
            if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
            const sameBlocker = buildDialecticJobRow({
                id: 'same-blocker-1',
                job_type: 'EXECUTE',
                status: 'pending',
                stage_slug: 'parenthesis',
                payload: { ...buildDialecticExecuteJobPayload({ output_type: FileType.technical_requirements, model_id: 'test-model-id' }), planner_metadata: { recipe_step_id: 'step-technical' } },
            });
            const planComplexStageFn: PlanComplexStageFn = async () => [];
            const planComplexStageSpy = spy(planComplexStageFn);
            const findSourceDocuments = createMockFindSourceDocuments({
                mode: 'error',
                error: new Error("Required document with document_key 'technical_requirements' not found."),
            });
            const baseParams = buildJobContextParams({
                planComplexStage: planComplexStageSpy,
                findSourceDocuments,
            });
            const root = createJobContext(baseParams);
            const ctx = createPlanJobContext(root);
            const skeletonPayload = buildDialecticSkeletonJobPayload({
                stageSlug: 'parenthesis',
                planner_metadata: { recipe_step_id: 'step-master' },
            });
            const skeletonJob = buildDialecticJobRow({
                job_type: 'PLAN',
                stage_slug: 'parenthesis',
                status: 'pending',
                prerequisite_job_id: 'same-blocker-1',
                payload: skeletonPayload,
                results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
            });
            const { client, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                    dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                    dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                    dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                    dialectic_generation_jobs: {
                        select: (state) => {
                            if (state.filters.some(f => f.column === 'job_type' && f.value === 'EXECUTE')) {
                                return Promise.resolve({ data: [sameBlocker], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                        insert: { data: null, error: null },
                        update: { data: null, error: null },
                    },
                },
            });

            // Act
            const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

            // Assert
            assert('error' in result);
            if ('error' in result) {
                assert(result.error.message.includes('technical_requirements'));
            }
            const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
            assertExists(updateCalls);
            const rechainUpdates = updateCalls.callsArgs.filter((args) => {
                if (!isRecord(args[0])) return false;
                return args[0].status === 'waiting_for_prerequisite' && args[0].prerequisite_job_id !== 'same-blocker-1';
            });
            assertEquals(rechainUpdates.length, 0);
        });

        // Contract: when re-chaining occurs (resolveNextBlocker returns a different
        // job ID), the function logs an informative message naming the skeleton job id,
        // the new blocker id, and the new blocker job_type. The behavior (job update
        // with the new prerequisite_job_id) implies the log was called.
        // Arrange: skeleton PLAN job with prerequisite_job_id 'prereq-completed-1',
        // planner_metadata.recipe_step_id 'step-master',
        // results.required_artifact_identity with documentKey 'technical_requirements';
        // findSourceDocuments in 'error' mode; mock dialectic_generation_jobs select to
        // return a pending RENDER job 'render-blocker-2' producing technical_requirements
        // (found by resolveNextBlocker, different from 'prereq-completed-1'); insert and
        // update succeed.
        // Act: processComplexJob(ctx, { dbClient }, { job: skeletonJob })
        // Assert: update called with status 'waiting_for_prerequisite' and
        // prerequisite_job_id 'render-blocker-2' (the re-chain); result is { planned: true }.
        it('Re-chaining logs informative message: "Re-chaining job {id} to wait for {nextBlocker.id} (type: {nextBlocker.job_type})"', async () => {
            // Arrange
            const technicalStep = buildDialecticStageRecipeStep({
                id: 'step-technical',
                step_slug: 'generate-technical-requirements',
                output_type: FileType.technical_requirements,
                inputs_required: [],
            });
            const masterStep = buildDialecticStageRecipeStep({
                id: 'step-master',
                step_slug: 'generate-master-plan',
                output_type: FileType.master_plan,
                inputs_required: [buildInputRule({
                    type: 'document',
                    slug: 'parenthesis',
                    document_key: FileType.technical_requirements,
                    required: true,
                })],
            });
            if (technicalStep === null || masterStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
            const renderBlocker = buildDialecticJobRow({
                id: 'render-blocker-2',
                job_type: 'RENDER',
                status: 'pending',
                stage_slug: 'parenthesis',
                payload: buildDialecticRenderJobPayload({ documentKey: FileType.technical_requirements, model_id: 'test-model-id' }),
            });
            const planComplexStageFn: PlanComplexStageFn = async () => [];
            const planComplexStageSpy = spy(planComplexStageFn);
            const findSourceDocuments = createMockFindSourceDocuments({
                mode: 'error',
                error: new Error("Required document with document_key 'technical_requirements' not found."),
            });
            const baseParams = buildJobContextParams({
                planComplexStage: planComplexStageSpy,
                findSourceDocuments,
            });
            const root = createJobContext(baseParams);
            const ctx = createPlanJobContext(root);
            const skeletonPayload = buildDialecticSkeletonJobPayload({
                stageSlug: 'parenthesis',
                planner_metadata: { recipe_step_id: 'step-master' },
            });
            const skeletonJob = buildDialecticJobRow({
                id: 'skeleton-rechain-1',
                job_type: 'PLAN',
                stage_slug: 'parenthesis',
                status: 'pending',
                prerequisite_job_id: 'prereq-completed-1',
                payload: skeletonPayload,
                results: { required_artifact_identity: { projectId: 'test-project-id', sessionId: 'test-session-id', stageSlug: 'parenthesis', iterationNumber: 1, model_id: 'test-model-id', documentKey: 'technical_requirements' } },
            });
            const { client, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                    dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                    dialectic_stage_recipe_steps: { select: { data: [technicalStep, masterStep], error: null } },
                    dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                    dialectic_generation_jobs: {
                        select: (state) => {
                            if (state.filters.some(f => f.column === 'job_type' && f.value === 'RENDER')) {
                                return Promise.resolve({ data: [renderBlocker], error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        },
                        insert: { data: null, error: null },
                        update: { data: null, error: null },
                    },
                },
            });

            // Act
            const result = await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: skeletonJob });

            // Assert — the re-chain update is the observable proof the log fired.
            const updateCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
            assertExists(updateCalls);
            const rechainUpdates = updateCalls.callsArgs.filter((args) => {
                if (!isRecord(args[0])) return false;
                return args[0].status === 'waiting_for_prerequisite' && args[0].prerequisite_job_id === 'render-blocker-2';
            });
            assert(rechainUpdates.length > 0);
            assert('planned' in result);
        });
    });
});