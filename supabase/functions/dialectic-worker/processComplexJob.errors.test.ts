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
    IDialecticJobDeps, 
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
    let mockDeps: IDialecticJobDeps;
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
            job_type: 'PLAN',
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

        const mockUnifiedAIResponse: UnifiedAIResponse = { content: 'mock', finish_reason: 'stop' };
        mockDeps = {
            logger,
            planComplexStage: mockProcessorSpies.planComplexStage,
            downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({
                data: await new Blob(['Mock content']).arrayBuffer(),
                error: null
            })),
            getGranularityPlanner: spy((_strategyId: string): GranularityPlannerFn | undefined => undefined),
            ragService: new MockRagService(),
            fileManager: new MockFileManagerService(),
            countTokens: spy(() => 0),
            getAiProviderConfig: spy(async () => Promise.resolve({
                api_identifier: 'mock-api',
                input_token_cost_rate: 0,
                output_token_cost_rate: 0,
                provider_max_input_tokens: 8192,
                tokenization_strategy: {
                    type: 'tiktoken',
                    tiktoken_encoding_name: 'cl100k_base',
                    tiktoken_model_name_for_rules_fallback: 'gpt-4o',
                    is_chatml_model: false,
                    api_identifier_for_tokenization: 'mock-api'
                },
            })),
            callUnifiedAIModel: spy(async () => mockUnifiedAIResponse),
            getSeedPromptForStage: spy(async () => ({
                content: 'mock',
                fullPath: 'mock',
                bucket: 'mock',
                path: 'mock',
                fileName: 'mock'
            })),
            continueJob: spy(async () => ({ enqueued: true })),
            retryJob: spy(async () => ({})),
            notificationService: mockNotificationService,
            executeModelCallAndSave: spy(async () => {}),
            getExtensionFromMimeType: spy(() => '.txt'),
            randomUUID: spy(() => 'mock-uuid'),
            deleteFromStorage: spy(async () => ({ data: [], error: null })),
            documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.RenderedDocument, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
        };
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
                await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, malformedJob as any, 'user-id-complex', mockDeps, 'user-jwt-123');
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
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps, 'user-jwt-123');
        
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
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps, 'user-jwt-123');
        
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
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps, 'user-jwt-123');

        // Assert: planner was called with the first step from the recipe (no step_info required)
        const firstStep = mockTemplateRecipeSteps[0];
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1);
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], firstStep);
    });

    it('should fail the job if the "planComplexStage" dependency throws a generic error', async () => {
        // This tests the general error handling for the downstream planner.
        // Arrange:
        // - Configure the deps.planComplexStage spy to throw a new Error('Planner failed!').
        mockDeps.planComplexStage = async () => Promise.reject(new Error('Planner failed!'));
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps, 'user-jwt-123');
        
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
        mockDeps.notificationService = mockNotificationService;
        mockDeps.planComplexStage = async () => Promise.reject(new Error('Planner failed!'));

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps, 'user-jwt-123');

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
        mockDeps.notificationService = mockNotificationService;
        mockDeps.planComplexStage = async () => Promise.reject(new ContextWindowError('Context too large!'));

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps, 'user-jwt-123');

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
        mockDeps.planComplexStage = async () => Promise.reject(new ContextWindowError('Context too large!'));
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps, 'user-jwt-123');
        
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
        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps, 'user-jwt-123');

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
        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps, 'user-jwt-123');

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
});
