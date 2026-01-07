import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processComplexJob } from './processComplexJob.ts';
import { 
    DialecticJobRow, 
    GranularityPlannerFn, 
    DialecticPlanJobPayload, 
    DialecticExecuteJobPayload,
    UnifiedAIResponse, 
    DialecticRecipeTemplateStep,
    DialecticStageRecipeEdge,
    BranchKey,
} from '../dialectic-service/dialectic.interface.ts';
import { createMockJobProcessors, MockJobProcessorsSpies } from '../_shared/dialectic.mock.ts';
import { isRecord, isJson } from '../_shared/utils/type_guards.ts';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { isModelContributionFileType } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
import { DialecticStageRecipeStep, IJobProcessors } from '../dialectic-service/dialectic.interface.ts';
import { IPlanJobContext } from './JobContext.interface.ts';
import { createPlanJobContext, createJobContext } from './createJobContext.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';

const mockClonedRecipeSteps: DialecticStageRecipeStep[] = [
    {
        step_key: 'step_one_key_cloned',
        step_name: 'First Step (Cloned)',
        id: 'cloned-step-uuid-1',
        instance_id: 'instance-uuid-cloned',
        template_step_id: 'template-step-uuid-1',
        step_slug: 'step-one-cloned',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        prompt_template_id: 'prompt-template-1-cloned',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        config_override: { "model": "super-gpt-5" },
        object_filter: {},
        output_overrides: {},
        is_skipped: false,
        execution_order: 1,
        parallel_group: null,
        branch_key: null,
        step_description: 'The first step (Cloned)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        step_key: 'step_two_key_cloned',
        step_name: 'Second Step (Cloned)',
        id: 'cloned-step-uuid-2',
        instance_id: 'instance-uuid-cloned',
        template_step_id: 'template-step-uuid-2',
        step_slug: 'step-two-cloned',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        prompt_template_id: 'prompt-template-2-cloned',
        output_type: FileType.business_case_critique,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        config_override: {},
        object_filter: {},
        output_overrides: {},
        is_skipped: false,
        execution_order: 2,
        parallel_group: null,
        branch_key: null,
        step_description: 'The second step (Cloned)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
];

const mockClonedRecipeEdges = [
    {
        id: 'cloned-edge-1-2',
        instance_id: 'instance-uuid-cloned',
        from_step_id: 'cloned-step-uuid-1',
        to_step_id: 'cloned-step-uuid-2',
        created_at: new Date().toISOString(),
    },
];

const mockParallelTemplateRecipeSteps: DialecticRecipeTemplateStep[] = [
    {
        id: 'parallel-step-1',
        template_id: 'parallel-template-1',
        step_number: 1,
        step_key: 'step_one',
        step_slug: 'step-one',
        step_name: 'Step 1 (Sequential)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        parallel_group: null,
        branch_key: null,
        step_description: 'The first sequential step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-1',
    },
    {
        id: 'parallel-step-2a',
        template_id: 'parallel-template-1',
        step_number: 2,
        step_key: 'step_two_a',
        step_slug: 'step-two-a',
        step_name: 'Step 2a (Parallel)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        parallel_group: 1,
        branch_key: BranchKey.business_case,
        step_description: 'The first parallel step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-2a',
    },
    {
        id: 'parallel-step-2b',
        template_id: 'parallel-template-1',
        step_number: 2,
        step_key: 'step_two_b',
        step_slug: 'step-two-b',
        step_name: 'Step 2b (Parallel)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        parallel_group: 1,
        branch_key: BranchKey.feature_spec,
        step_description: 'The second parallel step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-2b',
    },
    {
        id: 'parallel-step-3',
        template_id: 'parallel-template-1',
        step_number: 3,
        step_key: 'step_three',
        step_slug: 'step-three',
        step_name: 'Step 3 (Join)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        parallel_group: null,
        branch_key: null,
        step_description: 'The final join step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-3',
    },
];

const mockParallelTemplateRecipeEdges = [
    // Step 1 -> Step 2a
    {
        id: 'edge-1-2a',
        template_id: 'parallel-template-1',
        from_step_id: 'parallel-step-1',
        to_step_id: 'parallel-step-2a',
        created_at: new Date().toISOString(),
    },
    // Step 1 -> Step 2b
    {
        id: 'edge-1-2b',
        template_id: 'parallel-template-1',
        from_step_id: 'parallel-step-1',
        to_step_id: 'parallel-step-2b',
        created_at: new Date().toISOString(),
    },
    // Step 2a -> Step 3
    {
        id: 'edge-2a-3',
        template_id: 'parallel-template-1',
        from_step_id: 'parallel-step-2a',
        to_step_id: 'parallel-step-3',
        created_at: new Date().toISOString(),
    },
    // Step 2b -> Step 3
    {
        id: 'edge-2b-3',
        template_id: 'parallel-template-1',
        from_step_id: 'parallel-step-2b',
        to_step_id: 'parallel-step-3',
        created_at: new Date().toISOString(),
    },
];

const mockStageRow = {
    id: 'stage-id-antithesis',
    slug: 'antithesis',
    active_recipe_instance_id: 'instance-uuid-1',
    created_at: new Date().toISOString(),
    display_name: 'Antithesis',
    expected_output_template_ids: [],
    default_system_prompt_id: null,
    description: null,
    recipe_template_id: null,
};

const mockInstanceRow_NotCloned = {
    id: 'instance-uuid-1',
    stage_id: 'stage-id-antithesis',
    template_id: 'template-uuid-1',
    is_cloned: false,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

const mockInstanceRow_Cloned = {
    id: 'instance-uuid-cloned',
    stage_id: 'stage-id-antithesis',
    template_id: 'template-uuid-1',
    is_cloned: true,
    cloned_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

describe('processComplexJob with Cloned Recipe Instance', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let planCtx: IPlanJobContext;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockJobProcessors: IJobProcessors;
    let mockProcessorSpies: MockJobProcessorsSpies;

    beforeEach(() => {
        // Setup for a CLONED instance
        const clonedStageRow = { ...mockStageRow, active_recipe_instance_id: 'instance-uuid-cloned' };
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': {
                    select: { data: [clonedStageRow], error: null },
                },
                'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_Cloned], error: null },
                },
                'dialectic_stage_recipe_steps': { // The worker will query this table for cloned instances
                    select: { data: mockClonedRecipeSteps, error: null },
                },
                'dialectic_stage_recipe_edges': {
                    select: { data: mockClonedRecipeEdges, error: null },
                },
                'dialectic_recipe_template_steps': { // Should not be called, but provide empty to be safe
                    select: { data: [], error: null },
                },
                'dialectic_recipe_template_edges': { // Should also not be called
                    select: { data: [], error: null },
                },
            },
        });

        const { processors, spies } = createMockJobProcessors();
        mockJobProcessors = processors;
        mockProcessorSpies = spies;
        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        const mockPayload: DialecticPlanJobPayload = {
            sessionId: 'session-id-cloned',
            projectId: 'project-id-cloned',
            stageSlug: 'antithesis',
            model_id: 'model-id-cloned',
            walletId: 'wallet-id-cloned',
            user_jwt: 'user-jwt-cloned',
        };
        if (!isJson(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not valid JSON');
        }

        mockParentJob = {
            id: 'job-id-parent-cloned',
            user_id: 'user-id-cloned',
            session_id: 'session-id-cloned',
            stage_slug: 'antithesis',
            payload: mockPayload,
            iteration_number: 1,
            status: 'processing',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };

        const mockParams = {
            ...createMockJobContextParams(),
            planComplexStage: mockProcessorSpies.planComplexStage,
            notificationService: mockNotificationService,
        };
        const rootCtx = createJobContext(mockParams);
        planCtx = createPlanJobContext(rootCtx);
    });

    it('should fetch the CLONED recipe and plan the first step', async () => {
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');
        
        const firstClonedStep = mockClonedRecipeSteps[0];
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1);
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], firstClonedStep);
    });

    it('should advance to the next step in a CLONED recipe', async () => {
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };
        
        const firstClonedStep = mockClonedRecipeSteps[0];
        if (!isModelContributionFileType(firstClonedStep.output_type)) {
            throw new Error(`Test setup failed: firstClonedStep.output_type '${firstClonedStep.output_type}' is not a valid ModelContributionFileTypes`);
        }
        const completedChildJobForStep1Payload: DialecticExecuteJobPayload = {
            prompt_template_id: firstClonedStep.prompt_template_id!,
            inputs: {},
            output_type: firstClonedStep.output_type,
            projectId: 'project-id-cloned',
            sessionId: 'session-id-cloned',
            stageSlug: 'antithesis',
            model_id: 'model-id-cloned',
            iterationNumber: 1,
            continueUntilComplete: false,
            walletId: 'wallet-id-cloned',
            user_jwt: 'user-jwt-cloned',
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: 'antithesis',
            },
            planner_metadata: {
                recipe_step_id: firstClonedStep.id,
                recipe_template_id: undefined,
            },
        };
        if (!isJson(completedChildJobForStep1Payload)) {
            throw new Error('Test setup failed: completedChildJobForStep1Payload is not valid JSON');
        }
        const completedChildJobForStep1: DialecticJobRow = {
            id: 'child-step-1-cloned-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: completedChildJobForStep1Payload,
            iteration_number: 1, status: 'completed',
            attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: wakingJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        
        // This is the only query that should be different for the "advance" logic
        const customSupabase = createMockSupabaseClient(wakingJob.user_id, {
            ...mockSupabase,
            genericMockResults: {
                ...mockSupabase.genericMockResults,
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJobForStep1], error: null }
                },
                'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_Cloned], error: null },
                },
                'dialectic_stage_recipe_steps': { 
                    select: { data: mockClonedRecipeSteps, error: null },
                },
                'dialectic_stage_recipe_edges': {
                    select: { data: mockClonedRecipeEdges, error: null },
                },
            }
        });
        
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');

        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1);
        const secondClonedStep = mockClonedRecipeSteps[1];
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], secondClonedStep);
    });

    it('should complete the parent job after the final step of a CLONED recipe', async () => {
        const completedChildJobsForAllSteps = mockClonedRecipeSteps.map((step) => {
            if (!isModelContributionFileType(step.output_type)) {
                throw new Error(`Test setup failed: step.output_type '${step.output_type}' is not a valid ModelContributionFileTypes`);
            }
            const completedPayload: DialecticExecuteJobPayload = {
                prompt_template_id: step.prompt_template_id!,
                inputs: {},
                output_type: step.output_type,
                projectId: 'project-id-cloned',
                sessionId: 'session-id-cloned',
                stageSlug: 'antithesis',
                model_id: 'model-id-cloned',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-cloned',
                user_jwt: 'user-jwt-cloned',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: step.id,
                    recipe_template_id: undefined,
                },
            };
            if (!isJson(completedPayload)) {
                throw new Error(`Test setup failed: completedPayload for step ${step.id} is not valid JSON`);
            }
            return {
                id: `child-${step.id}-complete`, user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: completedPayload,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null,
                is_test_job: false,
                job_type: 'EXECUTE',
            };
        });

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            ...mockSupabase,
            genericMockResults: {
                ...mockSupabase.genericMockResults,
                'dialectic_generation_jobs': {
                    select: { data: completedChildJobsForAllSteps, error: null }
                },
                 'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_Cloned], error: null },
                },
                'dialectic_stage_recipe_steps': { 
                    select: { data: mockClonedRecipeSteps, error: null },
                },
                'dialectic_stage_recipe_edges': {
                    select: { data: mockClonedRecipeEdges, error: null },
                },
            }
        });

        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        const updateSpy = customSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        const finalUpdateCallArgs = updateSpy.callsArgs[updateSpy.callCount - 1];
        assert(isRecord(finalUpdateCallArgs[0]));
        assertEquals(finalUpdateCallArgs[0].status, 'completed');
    });

    it('should pass step overrides to the planner function', async () => {
        // Arrange: The first step of the cloned recipe has a config_override.
        const override = { "model": "super-gpt-5-turbo", "temperature": 0.9 };
        const recipeWithOverrides = [
            { ...mockClonedRecipeSteps[0], config_override: override },
            mockClonedRecipeSteps[1],
        ];
    
        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            ...mockSupabase,
            genericMockResults: {
                ...mockSupabase.genericMockResults,
                'dialectic_stage_recipe_steps': { 
                    select: { data: recipeWithOverrides, error: null },
                },
            }
        });
    
        // Act
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');
        
        // Assert: The step passed to the planner contains the override.
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, "Planner was not called");
        const plannedStep = mockProcessorSpies.planComplexStage.calls[0].args[3];
        assertEquals(plannedStep.config_override, override, "Config override was not passed to the planner");
    });

    it('should skip a step marked as is_skipped and plan the subsequent step', async () => {
        // Arrange: A 3-step recipe where the second step is skipped.
        const step1 = mockClonedRecipeSteps[0];
        const step3: DialecticStageRecipeStep = {
            step_key: 'step_three_key_cloned',
            step_name: 'Third Step (Cloned)',
            id: 'cloned-step-uuid-3',
            instance_id: 'instance-uuid-cloned',
            template_step_id: 'template-step-uuid-3',
            step_slug: 'step-three-cloned',
            job_type: 'PLAN',
            prompt_type: 'Turn',
            prompt_template_id: 'prompt-template-3-cloned',
            output_type: FileType.business_case,
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {},
            config_override: {},
            object_filter: {},
            output_overrides: {},
            is_skipped: false,
            execution_order: 3,
            parallel_group: null,
            branch_key: null,
            step_description: 'The third step (Cloned)',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        const recipeWithSkippedStep: DialecticStageRecipeStep[] = [
            step1,
            { ...mockClonedRecipeSteps[1], is_skipped: true, execution_order: 2, id: 'cloned-step-uuid-2' },
            step3,
        ];
        
        const skippedRecipeEdges = [
            {
                id: 'cloned-edge-1-2-skip',
                instance_id: 'instance-uuid-cloned',
                from_step_id: step1.id,
                to_step_id: 'cloned-step-uuid-2',
                created_at: new Date().toISOString(),
            },
            {
                id: 'cloned-edge-2-3-skip',
                instance_id: 'instance-uuid-cloned',
                from_step_id: 'cloned-step-uuid-2',
                to_step_id: step3.id,
                created_at: new Date().toISOString(),
            },
        ];
    
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };
        
        if (!isModelContributionFileType(step1.output_type)) {
            throw new Error(`Test setup failed: step1.output_type '${step1.output_type}' is not a valid ModelContributionFileTypes`);
        }
        const completedChildJobForStep1Payload: DialecticExecuteJobPayload = {
            prompt_template_id: step1.prompt_template_id!,
            inputs: {},
            output_type: step1.output_type,
            projectId: 'project-id-cloned',
            sessionId: 'session-id-cloned',
            stageSlug: 'antithesis',
            model_id: 'model-id-cloned',
            iterationNumber: 1,
            continueUntilComplete: false,
            walletId: 'wallet-id-cloned',
            user_jwt: 'user-jwt-cloned',
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: 'antithesis',
            },
            planner_metadata: {
                recipe_step_id: step1.id,
                recipe_template_id: undefined,
            },
        };
        if (!isJson(completedChildJobForStep1Payload)) {
            throw new Error('Test setup failed: completedChildJobForStep1Payload is not valid JSON');
        }
        const completedChildJobForStep1: DialecticJobRow = {
            id: 'child-step-1-cloned-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: completedChildJobForStep1Payload,
            iteration_number: 1, status: 'completed',
            attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: wakingJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        
        const customSupabase = createMockSupabaseClient(wakingJob.user_id, {
            ...mockSupabase,
            genericMockResults: {
                ...mockSupabase.genericMockResults,
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJobForStep1], error: null }
                },
                'dialectic_stage_recipe_steps': { 
                    select: { data: recipeWithSkippedStep, error: null },
                },
                'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_Cloned], error: null },
                },
                'dialectic_stage_recipe_edges': {
                    select: { data: skippedRecipeEdges, error: null },
                },
            }
        });
        
        // Act
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');
    
        // Assert: The orchestrator should have skipped step 2 and planned step 3.
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1);
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], step3);
    });
});

describe('processComplexJob with Parallel Recipe Graph', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let planCtx: IPlanJobContext;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockJobProcessors: IJobProcessors;
    let mockProcessorSpies: MockJobProcessorsSpies;
    let mockFileManager: MockFileManagerService;

    beforeEach(() => {
        // Most setup can be reused, but we need to inject the parallel recipe
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': {
                    select: { data: [mockStageRow], error: null },
                },
                'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_NotCloned], error: null },
                },
                'dialectic_recipe_template_steps': {
                    select: { data: mockParallelTemplateRecipeSteps, error: null },
                },
                'dialectic_recipe_template_edges': { // Mock the edges table
                    select: { data: mockParallelTemplateRecipeEdges, error: null },
                },
                'dialectic_generation_jobs': { // Default for finding completed jobs
                    select: { data: [], error: null },
                    update: { data: [{}], error: null },
                },
            },
        });

        const { processors, spies } = createMockJobProcessors();
        mockJobProcessors = processors;
        mockProcessorSpies = spies;
        mockJobProcessors.planComplexStage = async () => Promise.resolve([]); // Default to no children
        mockFileManager = new MockFileManagerService();

        const mockPayload: DialecticPlanJobPayload = {
            sessionId: 'session-id-parallel',
            projectId: 'project-id-parallel',
            stageSlug: 'antithesis',
            model_id: 'model-id-parallel',
            walletId: 'wallet-id-parallel',
            user_jwt: 'user-jwt-parallel',
        };
        if (!isJson(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not valid JSON');
        }

        mockParentJob = {
            id: 'job-id-parent-parallel',
            user_id: 'user-id-parallel',
            session_id: 'session-id-parallel',
            stage_slug: 'antithesis',
            payload: mockPayload,
            iteration_number: 1,
            status: 'processing',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };

        const mockParams = {
            ...createMockJobContextParams(),
            planComplexStage: mockProcessorSpies.planComplexStage,
            notificationService: mockNotificationService,
            fileManager: mockFileManager,
        };
        const rootCtx = createJobContext(mockParams);
        planCtx = createPlanJobContext(rootCtx);
    });

    it('should enqueue all parallel steps when their single dependency is met (fork)', async () => {
        // Arrange: Step 1 is complete.
        const step1 = mockParallelTemplateRecipeSteps.find(s => s.step_slug === 'step-one')!;
        if (!isModelContributionFileType(step1.output_type)) {
            throw new Error(`Test setup failed: step1.output_type '${step1.output_type}' is not a valid ModelContributionFileTypes`);
        }
        const completedChildJobForStep1Payload: DialecticExecuteJobPayload = {
            prompt_template_id: step1.prompt_template_id!,
            inputs: {},
            output_type: step1.output_type,
            projectId: 'project-id-parallel',
            sessionId: 'session-id-parallel',
            stageSlug: 'antithesis',
            model_id: 'model-id-parallel',
            iterationNumber: 1,
            continueUntilComplete: false,
            walletId: 'wallet-id-parallel',
            user_jwt: 'user-jwt-parallel',
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: 'antithesis',
            },
            planner_metadata: {
                recipe_step_id: step1.id,
                recipe_template_id: 'parallel-template-1',
            },
        };
        if (!isJson(completedChildJobForStep1Payload)) {
            throw new Error('Test setup failed: completedChildJobForStep1Payload is not valid JSON');
        }
        const completedChildJobForStep1: DialecticJobRow = {
            id: 'child-step-1-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: completedChildJobForStep1Payload,
            iteration_number: 1, status: 'completed',
            attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false, job_type: 'EXECUTE',
        };

        mockSupabase.genericMockResults!['dialectic_generation_jobs'] = {
            select: { data: [completedChildJobForStep1], error: null },
            update: { data: [{}], error: null },
        };
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');

        // Assert: planner called for both parallel successors (2a, 2b). Do not assert docs; only step identity.
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 2, "Expected planning for two parallel steps");
        const plannedStepSlugs = mockProcessorSpies.planComplexStage.calls.map(call => call.args[3].step_slug);
        assert(plannedStepSlugs.includes('step-two-a'));
        assert(plannedStepSlugs.includes('step-two-b'));
    });

    it('should NOT enqueue the join step when only one of two parallel dependencies is met', async () => {
        // Arrange: Step 2a is complete, but 2b is not.
        const step1 = mockParallelTemplateRecipeSteps.find(s => s.step_slug === 'step-one')!;
        const step2a = mockParallelTemplateRecipeSteps.find(s => s.step_slug === 'step-two-a')!;
        
        const createPayload = (step: DialecticRecipeTemplateStep): DialecticExecuteJobPayload => {
            if (!isModelContributionFileType(step.output_type)) {
                throw new Error(`Test setup failed: step.output_type '${step.output_type}' is not a valid ModelContributionFileTypes`);
            }
            return {
                prompt_template_id: step.prompt_template_id!,
                inputs: {},
                output_type: step.output_type,
                projectId: 'project-id-parallel',
                sessionId: 'session-id-parallel',
                stageSlug: 'antithesis',
                model_id: 'model-id-parallel',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-parallel',
                user_jwt: 'user-jwt-parallel',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: step.id,
                    recipe_template_id: 'parallel-template-1',
                },
            };
        };

        const payload1 = createPayload(step1);
        const payload2a = createPayload(step2a);
        if (!isJson(payload1) || !isJson(payload2a)) {
            throw new Error('Test setup failed: payloads are not valid JSON');
        }

        const completedChildJobs: DialecticJobRow[] = [
            {
                id: 'child-step-1-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload1,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            },
            {
                id: 'child-step-2a-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload2a,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            }
        ];
        
        mockSupabase.genericMockResults!['dialectic_generation_jobs'] = {
            select: { data: completedChildJobs, error: null },
            update: { data: [{}], error: null },
        };
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');

        // Assert: The remaining parallel step (2b) should be planned, but not the join (step-three).
        const calls = mockProcessorSpies.planComplexStage.calls;
        assertEquals(calls.length, 1, "Expected planning only the remaining parallel step");
        const plannedSlugs = calls.map((call) => call.args[3].step_slug);
        assert(plannedSlugs.includes('step-two-b'), 'Expected step-two-b to be planned');
        assert(!plannedSlugs.includes('step-three'), 'Join step should not be planned');
    });

    it('should enqueue the join step when all parallel dependencies are met (join)', async () => {
        // Arrange: Both steps 2a and 2b are complete.
        const step1 = mockParallelTemplateRecipeSteps.find(s => s.step_slug === 'step-one')!;
        const step2a = mockParallelTemplateRecipeSteps.find(s => s.step_slug === 'step-two-a')!;
        const step2b = mockParallelTemplateRecipeSteps.find(s => s.step_slug === 'step-two-b')!;
        
        const createPayload = (step: DialecticRecipeTemplateStep): DialecticExecuteJobPayload => {
            if (!isModelContributionFileType(step.output_type)) {
                throw new Error(`Test setup failed: step.output_type '${step.output_type}' is not a valid ModelContributionFileTypes`);
            }
            return {
                prompt_template_id: step.prompt_template_id!,
                inputs: {},
                output_type: step.output_type,
                projectId: 'project-id-parallel',
                sessionId: 'session-id-parallel',
                stageSlug: 'antithesis',
                model_id: 'model-id-parallel',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-parallel',
                user_jwt: 'user-jwt-parallel',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: step.id,
                    recipe_template_id: 'parallel-template-1',
                },
            };
        };

        const payload1 = createPayload(step1);
        const payload2a = createPayload(step2a);
        const payload2b = createPayload(step2b);
        if (!isJson(payload1) || !isJson(payload2a) || !isJson(payload2b)) {
            throw new Error('Test setup failed: payloads are not valid JSON');
        }

        const completedChildJobs: DialecticJobRow[] = [
             {
                id: 'child-step-1-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload1,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            },
            {
                id: 'child-step-2a-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload2a,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            },
             {
                id: 'child-step-2b-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload2b,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            }
        ];
        
        mockSupabase.genericMockResults!['dialectic_generation_jobs'] = {
            select: { data: completedChildJobs, error: null },
            update: { data: [{}], error: null },
        };
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');

        // Assert: Step 3 should be planned.
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, "Expected planning for one join step");
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3].step_slug, 'step-three');
    });
});

const mockParallelClonedRecipeSteps: DialecticStageRecipeStep[] = [
    {
        id: 'cloned-parallel-step-1',
        instance_id: 'instance-uuid-cloned-parallel',
        template_step_id: 'parallel-step-1',
        step_key: 'step_one',
        step_slug: 'step-one',
        step_name: 'Step 1 (Sequential)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        config_override: {},
        object_filter: {},
        output_overrides: {},
        is_skipped: false,
        execution_order: 1,
        parallel_group: null,
        branch_key: null,
        step_description: 'The first sequential step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-1',
    },
    {
        id: 'cloned-parallel-step-2a',
        instance_id: 'instance-uuid-cloned-parallel',
        template_step_id: 'parallel-step-2a',
        step_key: 'step_two_a',
        step_slug: 'step-two-a',
        step_name: 'Step 2a (Parallel)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        config_override: {},
        object_filter: {},
        output_overrides: {},
        is_skipped: false,
        execution_order: 2,
        parallel_group: 1,
        branch_key: null,
        step_description: 'The first parallel step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-2a',
    },
    {
        id: 'cloned-parallel-step-2b',
        instance_id: 'instance-uuid-cloned-parallel',
        template_step_id: 'parallel-step-2b',
        step_key: 'step_two_b',
        step_slug: 'step-two-b',
        step_name: 'Step 2b (Parallel)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        config_override: {},
        object_filter: {},
        output_overrides: {},
        is_skipped: false,
        execution_order: 2,
        parallel_group: 1,
        branch_key: null,
        step_description: 'The second parallel step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-2b',
    },
    {
        id: 'cloned-parallel-step-3',
        instance_id: 'instance-uuid-cloned-parallel',
        template_step_id: 'parallel-step-3',
        step_key: 'step_three',
        step_slug: 'step-three',
        step_name: 'Step 3 (Join)',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        config_override: {},
        object_filter: {},
        output_overrides: {},
        is_skipped: false,
        execution_order: 3,
        parallel_group: null,
        branch_key: null,
        step_description: 'The final join step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prompt_template_id: 'prompt-template-3',
    },
];

const mockParallelClonedRecipeEdges: DialecticStageRecipeEdge[] = [
    {
        id: 'cloned-edge-1-2a',
        instance_id: 'instance-uuid-cloned-parallel',
        from_step_id: 'cloned-parallel-step-1',
        to_step_id: 'cloned-parallel-step-2a',
        created_at: new Date().toISOString(),
    },
    {
        id: 'cloned-edge-1-2b',
        instance_id: 'instance-uuid-cloned-parallel',
        from_step_id: 'cloned-parallel-step-1',
        to_step_id: 'cloned-parallel-step-2b',
        created_at: new Date().toISOString(),
    },
    {
        id: 'cloned-edge-2a-3',
        instance_id: 'instance-uuid-cloned-parallel',
        from_step_id: 'cloned-parallel-step-2a',
        to_step_id: 'cloned-parallel-step-3',
        created_at: new Date().toISOString(),
    },
    {
        id: 'cloned-edge-2b-3',
        instance_id: 'instance-uuid-cloned-parallel',
        from_step_id: 'cloned-parallel-step-2b',
        to_step_id: 'cloned-parallel-step-3',
        created_at: new Date().toISOString(),
    },
];


describe('processComplexJob with Cloned Parallel Recipe Graph', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let planCtx: IPlanJobContext;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockJobProcessors: IJobProcessors;
    let mockProcessorSpies: MockJobProcessorsSpies;
    let mockFileManager: MockFileManagerService;

    beforeEach(() => {
        const mockInstanceRow_Cloned_Parallel = {
            id: 'instance-uuid-cloned-parallel',
            stage_id: 'stage-id-antithesis',
            template_id: 'parallel-template-1',
            is_cloned: true,
            cloned_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        const clonedStageRow = { ...mockStageRow, active_recipe_instance_id: 'instance-uuid-cloned-parallel' };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': {
                    select: { data: [clonedStageRow], error: null },
                },
                'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_Cloned_Parallel], error: null },
                },
                'dialectic_stage_recipe_steps': { 
                    select: { data: mockParallelClonedRecipeSteps, error: null },
                },
                'dialectic_stage_recipe_edges': { 
                    select: { data: mockParallelClonedRecipeEdges, error: null },
                },
                'dialectic_recipe_template_steps': { select: { data: [], error: null } },
                'dialectic_recipe_template_edges': { select: { data: [], error: null } },
                'dialectic_generation_jobs': { 
                    select: { data: [], error: null },
                    update: { data: [{}], error: null },
                },
            },
        });

        const { processors, spies } = createMockJobProcessors();
        mockJobProcessors = processors;
        mockProcessorSpies = spies;
        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);
        mockFileManager = new MockFileManagerService();

        const mockPayload: DialecticPlanJobPayload = {
            sessionId: 'session-id-cloned-parallel',
            projectId: 'project-id-cloned-parallel',
            stageSlug: 'antithesis',
            model_id: 'model-id-cloned-parallel',
            walletId: 'wallet-id-cloned-parallel',
            user_jwt: 'user-jwt-cloned-parallel',
        };
        if (!isJson(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not valid JSON');
        }

        mockParentJob = {
            id: 'job-id-parent-cloned-parallel',
            user_id: 'user-id-cloned-parallel',
            session_id: 'session-id-cloned-parallel',
            stage_slug: 'antithesis',
            payload: mockPayload,
            iteration_number: 1,
            status: 'processing',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };

        const mockParams = {
            ...createMockJobContextParams(),
            planComplexStage: mockProcessorSpies.planComplexStage,
            notificationService: mockNotificationService,
            fileManager: mockFileManager,
        };
        const rootCtx = createJobContext(mockParams);
        planCtx = createPlanJobContext(rootCtx);
    });

    it('should enqueue all parallel steps when their single dependency is met (fork)', async () => {
        const step1 = mockParallelClonedRecipeSteps.find(s => s.step_slug === 'step-one')!;
        if (!isModelContributionFileType(step1.output_type)) {
            throw new Error(`Test setup failed: step1.output_type '${step1.output_type}' is not a valid ModelContributionFileTypes`);
        }
        const completedChildJobForStep1Payload: DialecticExecuteJobPayload = {
            prompt_template_id: step1.prompt_template_id!,
            inputs: {},
            output_type: step1.output_type,
            projectId: 'project-id-cloned-parallel',
            sessionId: 'session-id-cloned-parallel',
            stageSlug: 'antithesis',
            model_id: 'model-id-cloned-parallel',
            iterationNumber: 1,
            continueUntilComplete: false,
            walletId: 'wallet-id-cloned-parallel',
            user_jwt: 'user-jwt-cloned-parallel',
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: 'antithesis',
            },
            planner_metadata: {
                recipe_step_id: step1.id,
                recipe_template_id: undefined,
            },
        };
        if (!isJson(completedChildJobForStep1Payload)) {
            throw new Error('Test setup failed: completedChildJobForStep1Payload is not valid JSON');
        }
        const completedChildJobForStep1: DialecticJobRow = {
            id: 'child-cloned-step-1-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: completedChildJobForStep1Payload,
            iteration_number: 1, status: 'completed',
            attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
        };

        mockSupabase.genericMockResults!['dialectic_generation_jobs'] = {
            select: { data: [completedChildJobForStep1], error: null },
            update: { data: [{}], error: null },
        };
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');

        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 2, "Expected planning for two parallel steps");
        const plannedStepSlugs = mockProcessorSpies.planComplexStage.calls.map(call => call.args[3].step_slug);
        assert(plannedStepSlugs.includes('step-two-a'));
        assert(plannedStepSlugs.includes('step-two-b'));
    });

    it('should NOT enqueue the join step when only one of two parallel dependencies is met', async () => {
        const step1 = mockParallelClonedRecipeSteps.find(s => s.step_slug === 'step-one')!;
        const step2a = mockParallelClonedRecipeSteps.find(s => s.step_slug === 'step-two-a')!;
        
        const createPayload = (step: DialecticStageRecipeStep): DialecticExecuteJobPayload => {
            if (!isModelContributionFileType(step.output_type)) {
                throw new Error(`Test setup failed: step.output_type '${step.output_type}' is not a valid ModelContributionFileTypes`);
            }
            return {
                prompt_template_id: step.prompt_template_id!,
                inputs: {},
                output_type: step.output_type,
                projectId: 'project-id-cloned-parallel',
                sessionId: 'session-id-cloned-parallel',
                stageSlug: 'antithesis',
                model_id: 'model-id-cloned-parallel',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-cloned-parallel',
                user_jwt: 'user-jwt-cloned-parallel',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: step.id,
                    recipe_template_id: undefined,
                },
            };
        };

        const payload1 = createPayload(step1);
        const payload2a = createPayload(step2a);
        if (!isJson(payload1) || !isJson(payload2a)) {
            throw new Error('Test setup failed: payloads are not valid JSON');
        }

        const completedChildJobs: DialecticJobRow[] = [
            {
                id: 'child-cloned-step-1-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload1,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            },
            {
                id: 'child-cloned-step-2a-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload2a,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            }
        ];
        
        mockSupabase.genericMockResults!['dialectic_generation_jobs'] = {
            select: { data: completedChildJobs, error: null },
            update: { data: [{}], error: null },
        };
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');

        const clonedCalls = mockProcessorSpies.planComplexStage.calls;
        assertEquals(clonedCalls.length, 1, "Expected planning only the remaining parallel step");
        const clonedPlannedSlugs = clonedCalls.map((call) => call.args[3].step_slug);
        assert(clonedPlannedSlugs.includes('step-two-b'), 'Expected step-two-b to be planned');
        assert(!clonedPlannedSlugs.includes('step-three'), 'Join step should not be planned');
    });

    it('should enqueue the join step when all parallel dependencies are met (join)', async () => {
        const step1 = mockParallelClonedRecipeSteps.find(s => s.step_slug === 'step-one')!;
        const step2a = mockParallelClonedRecipeSteps.find(s => s.step_slug === 'step-two-a')!;
        const step2b = mockParallelClonedRecipeSteps.find(s => s.step_slug === 'step-two-b')!;
        
        const createPayload = (step: DialecticStageRecipeStep): DialecticExecuteJobPayload => {
            if (!isModelContributionFileType(step.output_type)) {
                throw new Error(`Test setup failed: step.output_type '${step.output_type}' is not a valid ModelContributionFileTypes`);
            }

        const payload: DialecticExecuteJobPayload = {
            prompt_template_id: step.prompt_template_id!,
            inputs: {},
            output_type: step.output_type,
            projectId: 'project-id-cloned-parallel',
            sessionId: 'session-id-cloned-parallel',
            stageSlug: 'antithesis',
            model_id: 'model-id-cloned-parallel',
            iterationNumber: 1,
            continueUntilComplete: false,
            walletId: 'wallet-id-cloned-parallel',
            user_jwt: 'user-jwt-cloned-parallel',
            canonicalPathParams: {
                contributionType: 'thesis',
                stageSlug: 'antithesis',
            },
            planner_metadata: {
                recipe_step_id: step.id,
                recipe_template_id: undefined,
            },
        };
        if (!isJson(payload)) {
            throw new Error('Test setup failed: payload is not valid JSON');
        }
        return payload;
        };

        const payload1 = createPayload(step1);
        const payload2a = createPayload(step2a);
        const payload2b = createPayload(step2b);
        if (!isJson(payload1) || !isJson(payload2a) || !isJson(payload2b)) {
            throw new Error('Test setup failed: payloads are not valid JSON');
        }

        const completedChildJobs: DialecticJobRow[] = [
             {
                id: 'child-cloned-step-1-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload1,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            },
            {
                id: 'child-cloned-step-2a-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload2a,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            },
             {
                id: 'child-cloned-step-2b-complete', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
                payload: payload2b,
                iteration_number: 1, status: 'completed',
                attempt_count: 1, max_retries: 3, created_at: new Date().toISOString(), started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: mockParentJob.id,
                target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'EXECUTE',
            }
        ];
        
        mockSupabase.genericMockResults!['dialectic_generation_jobs'] = {
            select: { data: completedChildJobs, error: null },
            update: { data: [{}], error: null },
        };
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, planCtx, 'user-jwt-123');

        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, "Expected planning for one join step");
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3].step_slug, 'step-three');
    });
});