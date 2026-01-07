import {
    assertEquals,
    assertExists,
    assert,
    assertRejects,
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
} from '../dialectic-service/dialectic.interface.ts';
import { createMockJobProcessors, MockJobProcessorsSpies } from '../_shared/dialectic.mock.ts';
import { isRecord, isJson } from '../_shared/utils/type_guards.ts';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { IJobProcessors } from '../dialectic-service/dialectic.interface.ts';
import { IPlanJobContext } from './JobContext.interface.ts';
import { createPlanJobContext, createJobContext } from './createJobContext.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';

const mockTemplateRecipeSteps: DialecticRecipeTemplateStep[] = [
    {
        step_key: 'step_one_key',
        step_name: 'First Step',
        id: 'template-step-uuid-1',
        template_id: 'template-uuid-1',
        step_slug: 'step-one',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        prompt_template_id: 'prompt-template-1',
        output_type: FileType.business_case,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        step_number: 1,
        parallel_group: null,
        branch_key: null,
        step_description: 'The first step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        step_key: 'step_two_key',
        step_name: 'Second Step',
        id: 'template-step-uuid-2',
        template_id: 'template-uuid-1',
        step_slug: 'step-two',
        job_type: 'PLAN',
        prompt_type: 'Turn',
        prompt_template_id: 'prompt-template-2',
        output_type: FileType.business_case_critique,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {},
        step_number: 2,
        parallel_group: null,
        branch_key: null,
        step_description: 'The second step',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
];

const mockTemplateRecipeEdges = [
    {
        id: 'edge-1-2',
        template_id: 'template-uuid-1',
        from_step_id: 'template-step-uuid-1',
        to_step_id: 'template-step-uuid-2',
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

describe('processComplexJob', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let planCtx: IPlanJobContext;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockJobProcessors: IJobProcessors;
    let mockProcessorSpies: MockJobProcessorsSpies;


    beforeEach(() => {
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': {
                    select: { data: [mockStageRow], error: null },
                },
                'dialectic_stage_recipe_instances': {
                    select: { data: [mockInstanceRow_NotCloned], error: null },
                },
                'dialectic_recipe_template_steps': {
                    select: { data: mockTemplateRecipeSteps, error: null },
                },
                'dialectic_recipe_template_edges': {
                    select: { data: mockTemplateRecipeEdges, error: null },
                },
                // Provide an empty default for cloned steps for tests that don't need it
                'dialectic_stage_recipe_steps': {
                    select: { data: [], error: null },
                },
            },
        });

        const { processors, spies } = createMockJobProcessors();
        mockJobProcessors = processors;
        mockProcessorSpies = spies;

        const mockPayload: DialecticPlanJobPayload = {
            sessionId: 'session-id-complex',
            projectId: 'project-id-complex',
            stageSlug: 'antithesis',
            model_id: 'model-id-complex',
            walletId: 'wallet-id-complex',
            user_jwt: 'user-jwt-complex',
        };

        if (!isJson(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not valid JSON');
        }

        mockParentJob = {
            id: 'job-id-parent',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: mockPayload, // No cast needed now
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

    // Group 2: Error Handling & Input Validation
    it('should fail the job if the job payload is not a valid DialecticPlanJobPayload', async () => {
        // This test validates the initial type guard.
        // Arrange:
        // - Create a mock job with a malformed payload (e.g., missing job_type).
        const originalPayload = mockParentJob.payload as DialecticPlanJobPayload;
        const malformedPayload = { 
            sessionId: originalPayload.sessionId,
            projectId: originalPayload.projectId,
            stageSlug: originalPayload.stageSlug,
            model_id: originalPayload.model_id,
            walletId: originalPayload.walletId,
            // job_type is deliberately omitted
        };

        const malformedJob = {
            ...mockParentJob,
            payload: malformedPayload,
        };
        
        // Act & Assert:
        // - Use assertRejects to prove that processComplexJob throws an error.
        // Per project standards, type casting is permitted when testing invalid objects.
        await assertRejects(
            async () => {
                await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, malformedJob as any, 'user-id-complex', planCtx, 'user-jwt-123');
            },
            Error,
            'invalid payload for complex processing'
        );
    });

    it('should fail the job if the stage recipe cannot be found in the database', async () => {
        // This tests resilience against missing configuration.
        // It will fail because the current logic looks in `dialectic_stages` and will succeed,
        // while the test expects a failure from querying the (empty) `dialectic_stage_recipes`.
        
        // Arrange:
        // - Configure the mockSupabase client to return null or an empty array for the recipe query.
        const customSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                // Return nothing from the initial, required lookup.
                'dialectic_stages': { select: { data: [], error: null } },
            }
        });
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', planCtx, 'user-jwt-123');
        
        // Assert:
        // - The 'update' spy was called with a status of 'failed' and a descriptive error message.
        const updateSpy = customSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs);
        assertEquals(updateArgs.status, 'failed');
        assert(JSON.stringify(updateArgs.error_details).includes("Stage 'antithesis' not found"));
    });

    it('should fail the job if the fetched recipe is malformed or fails type validation', async () => {
        // This test ensures the recipe type guard is effective.
        // With the new relational model, the most likely failure is finding no steps for a valid instance.
        // Arrange:
        // - Configure mockSupabase to return valid stage and instance, but no steps.
        const customSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: [], error: null } }, // NO STEPS
            }
        });
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', planCtx, 'user-jwt-123');
        
        // Assert:
        // - The 'update' spy was called with a status of 'failed' and a descriptive error message.
        const updateSpy = customSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs);
        assertEquals(updateArgs.status, 'failed');
        assert(JSON.stringify(updateArgs.error_details).includes('has no recipe steps'));
    });

    it('should not depend on deprecated step_info and plan the first ready step from the DAG', async () => {
        // Arrange: provide a valid modern recipe with no completed children
        const customSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': { select: { data: [], error: null }, update: { data: [{}], error: null } },
            },
        });

        // Return no child jobs to keep assertions focused on planner invocation
        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', planCtx, 'user-jwt-123');

        // Assert: planner was called with the first step from the recipe (no step_info required)
        const firstStep = mockTemplateRecipeSteps[0];
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1);
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], firstStep);
    });

    it('should fail the job if the "planComplexStage" dependency throws a generic error', async () => {
        // This tests the general error handling for the downstream planner.
        // Arrange:
        // - Configure the deps.planComplexStage spy to throw a new Error('Planner failed!').
        const errorMockParams = {
            ...createMockJobContextParams(),
            planComplexStage: async () => Promise.reject(new Error('Planner failed!')),
            notificationService: mockNotificationService,
        };
        const errorRootCtx = createJobContext(errorMockParams);
        const errorPlanCtx = createPlanJobContext(errorRootCtx);
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', errorPlanCtx, 'user-jwt-123');
        
        // Assert:
        // - The 'update' spy was called with a status of 'failed' and the correct error message.
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs);
        assertEquals(updateArgs.status, 'failed');
        assert(JSON.stringify(updateArgs.error_details).includes('Planner failed!'));
    });

    it('emits job_failed notification when planner throws a generic error', async () => {
        // Arrange
        resetMockNotificationService();
        const errorMockParams = {
            ...createMockJobContextParams(),
            planComplexStage: async () => Promise.reject(new Error('Planner failed!')),
            notificationService: mockNotificationService,
        };
        const errorRootCtx = createJobContext(errorMockParams);
        const errorPlanCtx = createPlanJobContext(errorRootCtx);

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', errorPlanCtx, 'user-jwt-123');

        // Assert
        const calls = mockNotificationService.sendDocumentCentricNotification.calls;
        const jobFailedCalls = calls.filter((c) => {
            const a = c.args?.[0];
            return a && typeof a === 'object' && (a).type === 'job_failed';
        });
        assertEquals(jobFailedCalls.length, 1, 'Expected one job_failed notification');
        const [payloadArg, targetUserId] = jobFailedCalls[0].args;
        assertEquals(payloadArg.type, 'job_failed');
        assertEquals(payloadArg.sessionId, mockParentJob.session_id);
        assertEquals(payloadArg.stageSlug, mockParentJob.stage_slug);
        assertEquals(payloadArg.job_id, mockParentJob.id);
        assert(typeof payloadArg.document_key === 'string');
        assertEquals(payloadArg.modelId, mockParentJob.payload.model_id);
        assertEquals(payloadArg.iterationNumber, mockParentJob.iteration_number);
        assertEquals(targetUserId, 'user-id-fail');
    });

    it('emits job_failed notification when planner throws a ContextWindowError', async () => {
        // Arrange
        resetMockNotificationService();
        const errorMockParams = {
            ...createMockJobContextParams(),
            planComplexStage: async () => Promise.reject(new ContextWindowError('Context too large!')),
            notificationService: mockNotificationService,
        };
        const errorRootCtx = createJobContext(errorMockParams);
        const errorPlanCtx = createPlanJobContext(errorRootCtx);

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', errorPlanCtx, 'user-jwt-123');

        // Assert
        const calls = mockNotificationService.sendDocumentCentricNotification.calls;
        const jobFailedCalls = calls.filter((c) => {
            const a = c.args?.[0];
            return a && typeof a === 'object' && (a).type === 'job_failed';
        });
        assertEquals(jobFailedCalls.length, 1, 'Expected one job_failed notification');
        const [payloadArg, targetUserId] = jobFailedCalls[0].args;
        assertEquals(payloadArg.type, 'job_failed');
        assertEquals(payloadArg.sessionId, mockParentJob.session_id);
        assertEquals(payloadArg.stageSlug, mockParentJob.stage_slug);
        assertEquals(payloadArg.job_id, mockParentJob.id);
        assert(typeof payloadArg.document_key === 'string');
        assertEquals(payloadArg.modelId, mockParentJob.payload.model_id);
        assertEquals(payloadArg.iterationNumber, mockParentJob.iteration_number);
        assertEquals(targetUserId, 'user-id-fail');
    });

    it('should fail the job with a specific message if "planComplexStage" throws a ContextWindowError', async () => {
        // This tests specialized error handling.
        // Arrange:
        // - Configure deps.planComplexStage to throw a new ContextWindowError('Context too large!').
        const contextWindowMockParams = {
            ...createMockJobContextParams(),
            planComplexStage: async () => Promise.reject(new ContextWindowError('Context too large!')),
            notificationService: mockNotificationService,
        };
        const contextWindowRootCtx = createJobContext(contextWindowMockParams);
        const contextWindowPlanCtx = createPlanJobContext(contextWindowRootCtx);
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', contextWindowPlanCtx, 'user-jwt-123');
        
        // Assert:
        // - The 'update' spy was called with a status of 'failed' and an error message that specifically mentions the context window.
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs);
        assertEquals(updateArgs.status, 'failed');
        assert(JSON.stringify(updateArgs.error_details).includes('Context window limit exceeded'));
    });

    it('should fail the job if it fails to insert the new child jobs into the database', async () => {
        // This tests the transactional integrity of enqueuing new work.
        // Arrange:
        // - Configure deps.planComplexStage to return valid child jobs.
        const mockChildJob: DialecticJobRow = {
            id: 'child-1',
            user_id: 'user-1',
            session_id: 'session-1',
            stage_slug: 'antithesis',
            payload: { message: 'Child 1' },
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        mockJobProcessors.planComplexStage = async () => Promise.resolve([mockChildJob]);

        // - Configure the mockSupabase 'insert' method to throw an error.
        const failingSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    insert: () => Promise.resolve({ data: null, error: new Error('DB insert failed!') })
                }
            }
        });
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', planCtx, 'user-jwt-123');

        // Assert:
        // - The 'update' spy was called to set the parent job's status to 'failed'.
        const updateSpy = failingSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs);
        assertEquals(updateArgs.status, 'failed');
        assert(JSON.stringify(updateArgs.error_details).includes('Failed to insert child jobs: DB insert failed!'));
    });

    it('should fail the job if it fails to update its own status to "waiting_for_children"', async () => {
        // This tests the final, critical step of the transaction.
        // Arrange:
        // - Configure deps.planComplexStage to return valid child jobs.
        const mockChildJob: DialecticJobRow = {
            id: 'child-1',
            user_id: 'user-1',
            session_id: 'session-1',
            stage_slug: 'antithesis',
            payload: { message: 'Child 1' },
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        mockJobProcessors.planComplexStage = async () => Promise.resolve([mockChildJob]);
        // - Configure 'insert' to succeed but 'update' to fail.
        const failingSupabase = createMockSupabaseClient(undefined, {
             genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    insert: () => Promise.resolve({ data: [mockChildJob], error: null }),
                    update: () => Promise.resolve({ data: null, error: new Error('DB update failed!') })
                }
            }
        });

        // Act:
        // - Call processComplexJob.
        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', planCtx, 'user-jwt-123');

        // Assert:
        // - The function should catch the update error and make a second update call to set the job status to 'failed'.
        const updateSpy = failingSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 2); // First to 'waiting_for_children', second to 'failed'.
        
        const secondUpdateArgs = updateSpy.callsArgs[1][0];
        assert(isRecord(secondUpdateArgs) && 'status' in secondUpdateArgs && 'error_details' in secondUpdateArgs);
        assertEquals(secondUpdateArgs.status, 'failed');
        assert(JSON.stringify(secondUpdateArgs.error_details).includes('Failed to update parent job status: DB update failed!'));
    });

    // Step 42.b.iv: Test that throws error when planner_metadata is undefined
    it('should throw an error when a completed child job has planner_metadata: undefined', async () => {
        // Arrange:
        // - Create a PLAN job with a completed child job that has planner_metadata: undefined
        const completedChildJobWithoutMetadata: DialecticJobRow = {
            id: 'child-without-metadata',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                // planner_metadata is deliberately omitted (undefined)
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJobWithoutMetadata], error: null },
                },
            },
        });

        // Act & Assert:
        // - processComplexJob should throw an error indicating planner_metadata is required
        await assertRejects(
            async () => {
                await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');
            },
            Error,
            'planner_metadata.recipe_step_id is missing or invalid'
        );
    });

    // Step 42.b.v: Test that throws error when planner_metadata is empty object (missing recipe_step_id)
    it('should throw an error when a completed child job has planner_metadata: {} (missing recipe_step_id)', async () => {
        // Arrange:
        // - Create a PLAN job with a completed child job that has planner_metadata: {} (empty object)
        const completedChildJobWithEmptyMetadata: DialecticJobRow = {
            id: 'child-with-empty-metadata',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {}, // Empty object, missing recipe_step_id
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJobWithEmptyMetadata], error: null },
                },
            },
        });

        // Act & Assert:
        // - processComplexJob should throw an error indicating planner_metadata.recipe_step_id is required
        await assertRejects(
            async () => {
                await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');
            },
            Error,
            'planner_metadata.recipe_step_id is missing or invalid'
        );
    });

    // Step 42.b.vi: Test that throws error when planner_metadata.recipe_step_id is empty string
    it('should throw an error when a completed child job has planner_metadata: { recipe_step_id: "" } (empty string)', async () => {
        // Arrange:
        // - Create a PLAN job with a completed child job that has planner_metadata.recipe_step_id: '' (empty string)
        const completedChildJobWithEmptyRecipeStepId: DialecticJobRow = {
            id: 'child-with-empty-recipe-step-id',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: '', // Empty string
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJobWithEmptyRecipeStepId], error: null },
                },
            },
        });

        // Act & Assert:
        // - processComplexJob should throw an error indicating planner_metadata.recipe_step_id must be non-empty
        await assertRejects(
            async () => {
                await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');
            },
            Error,
            'planner_metadata.recipe_step_id is missing or invalid'
        );
    });

    // Step 45.b: Tests for in-progress job tracking to prevent re-planning loops
    it('should not re-plan a step that has a child EXECUTE job with status retrying', async () => {
        // Arrange:
        // - Create a PLAN job with a recipe step that has a child EXECUTE job with status `retrying`
        const retryingChildJob: DialecticJobRow = {
            id: 'child-retrying',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'retrying',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [retryingChildJob], error: null },
                },
            },
        });

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // - planComplexStage should NOT be called because the step has an in-progress job
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 0, 'planComplexStage should not be called when step has a retrying job');
    });

    it('should not re-plan a step that has a child EXECUTE job with status processing', async () => {
        // Arrange:
        const processingChildJob: DialecticJobRow = {
            id: 'child-processing',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'processing',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [processingChildJob], error: null },
                },
            },
        });

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 0, 'planComplexStage should not be called when step has a processing job');
    });

    it('should not re-plan a step that has a child EXECUTE job with status pending', async () => {
        // Arrange:
        const pendingChildJob: DialecticJobRow = {
            id: 'child-pending',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [pendingChildJob], error: null },
                },
            },
        });

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 0, 'planComplexStage should not be called when step has a pending job');
    });

    it('should not re-plan steps that have either completed or in-progress child jobs', async () => {
        // Arrange:
        const completedChildJob: DialecticJobRow = {
            id: 'child-completed',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const retryingChildJob: DialecticJobRow = {
            id: 'child-retrying-2',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-2',
                inputs: {},
                output_type: FileType.business_case_critique,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-2',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'retrying',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJob, retryingChildJob], error: null },
                },
            },
        });

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // Both steps should be excluded: step-one (completed) and step-two (retrying)
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 0, 'planComplexStage should not be called when steps have completed or in-progress jobs');
    });

    it('should not re-plan a step that has both completed and retrying child jobs', async () => {
        // Arrange:
        const completedChildJob: DialecticJobRow = {
            id: 'child-completed-mixed',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const retryingChildJob: DialecticJobRow = {
            id: 'child-retrying-mixed',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'retrying',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJob, retryingChildJob], error: null },
                },
            },
        });

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // The step should NOT be re-planned because it has a retrying job (in-progress)
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 0, 'planComplexStage should not be called when step has both completed and retrying jobs');
    });

    it('should not re-plan a step that has multiple child jobs with mixed in-progress statuses', async () => {
        // Arrange:
        const completedChildJob: DialecticJobRow = {
            id: 'child-completed-mixed-2',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const retryingChildJob: DialecticJobRow = {
            id: 'child-retrying-mixed-2',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'retrying',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const processingChildJob: DialecticJobRow = {
            id: 'child-processing-mixed',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'processing',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJob, retryingChildJob, processingChildJob], error: null },
                },
            },
        });

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // The step should NOT be re-planned because it has in-progress jobs
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 0, 'planComplexStage should not be called when step has in-progress jobs');
    });

    it('should allow re-planning a step that has a child job with status failed', async () => {
        // Arrange:
        const failedChildJob: DialecticJobRow = {
            id: 'child-failed',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'failed',
            attempt_count: 3,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: { message: 'Job failed' },
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [failedChildJob], error: null },
                },
            },
        });

        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // The step CAN be re-planned because failed is a terminal state
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, 'planComplexStage should be called when step has only failed jobs');
    });

    it('should allow re-planning a step that has a child job with status retry_loop_failed', async () => {
        // Arrange:
        const retryLoopFailedChildJob: DialecticJobRow = {
            id: 'child-retry-loop-failed',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'retry_loop_failed',
            attempt_count: 3,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: { message: 'Retry loop exhausted' },
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [retryLoopFailedChildJob], error: null },
                },
            },
        });

        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // The step CAN be re-planned because retry_loop_failed is a terminal state
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, 'planComplexStage should be called when step has only retry_loop_failed jobs');
    });

    it('should include steps with no child jobs in readySteps', async () => {
        // Arrange:
        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [], error: null },
                },
            },
        });

        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // The step IS included in readySteps (can be planned for the first time)
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, 'planComplexStage should be called when step has no child jobs');
        const firstStep = mockTemplateRecipeSteps[0];
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], firstStep, 'planComplexStage should be called with the first step');
    });

    it('should re-plan a step with mixed completed and failed jobs but only for failed source documents', async () => {
        // Arrange:
        // - Create 3 source documents: doc1 (completed), doc2 (failed), doc3 (completed)
        const completedChildJob1: DialecticJobRow = {
            id: 'child-completed-doc1',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                    sourceAttemptCount: 1,
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const failedChildJob: DialecticJobRow = {
            id: 'child-failed-doc2',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                    sourceAttemptCount: 2,
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'failed',
            attempt_count: 3,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: { message: 'Job failed' },
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const completedChildJob3: DialecticJobRow = {
            id: 'child-completed-doc3',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                    sourceAttemptCount: 3,
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJob1, failedChildJob, completedChildJob3], error: null },
                },
            },
        });

        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // planComplexStage should be called (step can be re-planned)
        // planComplexStage should be called with source documents excluding those with sourceAttemptCount 1 and 3 (completed jobs)
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, 'planComplexStage should be called when step has mixed completed and failed jobs');
        
        // Verify that planComplexStage is called with the 6th argument containing completed source document IDs
        // The source document identifiers are constructed from canonicalPathParams as: contributionType_stageSlug_sourceAttemptCount
        const expectedCompletedSourceDocIds = new Set<string>(['thesis_antithesis_1', 'thesis_antithesis_3']);
        const callArgs = mockProcessorSpies.planComplexStage.calls[0].args;
        assert(callArgs.length >= 6, 'planComplexStage should be called with 6 arguments (including completedSourceDocumentIds)');
        const completedSourceDocIdsArg = callArgs[5];
        assert(completedSourceDocIdsArg instanceof Set, 'The 6th argument should be a Set<string>');
        assertEquals(completedSourceDocIdsArg.size, expectedCompletedSourceDocIds.size, 'The Set should contain 2 completed source document IDs');
        // Verify all expected IDs are in the actual Set passed to the function
        for (const expectedId of expectedCompletedSourceDocIds) {
            assert(completedSourceDocIdsArg.has(expectedId), `The Set should contain ${expectedId}`);
        }
    });

    it('should preserve completed contributions when re-planning steps with mixed completed and failed jobs', async () => {
        // Arrange:
        const completedChildJob: DialecticJobRow = {
            id: 'child-completed-preserve',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                    sourceAttemptCount: 1,
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'completed',
            attempt_count: 1,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: null,
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const failedChildJob: DialecticJobRow = {
            id: 'child-failed-preserve',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: {
                job_type: 'execute',
                prompt_template_id: 'prompt-template-1',
                inputs: {},
                output_type: FileType.business_case,
                projectId: 'project-id-complex',
                sessionId: 'session-id-complex',
                stageSlug: 'antithesis',
                model_id: 'model-id-complex',
                iterationNumber: 1,
                continueUntilComplete: false,
                walletId: 'wallet-id-complex',
                user_jwt: 'user-jwt-123',
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'antithesis',
                    sourceAttemptCount: 2,
                },
                planner_metadata: {
                    recipe_step_id: 'template-step-uuid-1',
                    recipe_template_id: 'template-uuid-1',
                },
            },
            iteration_number: 1,
            status: 'failed',
            attempt_count: 3,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            results: null,
            error_details: { message: 'Job failed' },
            parent_job_id: mockParentJob.id,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };

        const customSupabase = createMockSupabaseClient(mockParentJob.user_id, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    select: { data: [completedChildJob, failedChildJob], error: null },
                },
            },
        });

        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act:
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, planCtx, 'user-jwt-123');

        // Assert:
        // The step can be re-planned, but completed contributions should remain available
        // Completed contributions are preserved in the database and available for future steps
        // Newly-completed (previously failed) contributions are also available alongside existing ones
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, 'planComplexStage should be called when step has mixed completed and failed jobs');
    });
});
