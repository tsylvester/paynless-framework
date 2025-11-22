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
    IDialecticJobDeps, 
    UnifiedAIResponse, 
    DialecticRecipeTemplateStep,
    DialecticExecuteJobPayload,
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
import {
    isDialecticStageRecipeStep,
} from '../_shared/utils/type-guards/type_guards.dialectic.recipe.ts';
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

const mockInstanceRow_Cloned = {
    id: 'instance-uuid-cloned',
    stage_id: 'stage-id-antithesis',
    template_id: 'template-uuid-1',
    is_cloned: true,
    cloned_at: new Date().toISOString(),
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

    it('plans and enqueues child jobs', async () => {
        const mockChildJob1: DialecticJobRow = {
            id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };
        const mockChildJob2: DialecticJobRow = {
            id: 'child-2', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: { message: 'Child 2' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };

        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            return [mockChildJob1, mockChildJob2];
        };

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps, 'user-jwt-123');

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1, 'Should have inserted the child jobs');
        assertEquals(insertSpy.callsArgs[0][0], [mockChildJob1, mockChildJob2]);

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should have updated the parent job status');

        const updateArgs = updateSpy.callsArgs[0][0];
        if (isRecord(updateArgs) && 'status' in updateArgs) {
            assertEquals(updateArgs.status, 'waiting_for_children');
        } else {
            throw new Error('Update call did not have the expected shape.');
        }
    });

    it('handles planner failure gracefully', async () => {
        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            throw new Error('Planner failed!');
        };

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps, 'user-jwt-123');

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should have updated the parent job status to failed');

        const updateArgs = updateSpy.callsArgs[0][0];
        if (isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs) {
            assertEquals(updateArgs.status, 'failed');
            assert(JSON.stringify(updateArgs.error_details).includes('Planner failed!'));
        } else {
            throw new Error('Update call did not have the expected shape for a failure.');
        }
    });

    it('completes parent job if planner returns no children', async () => {
        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            return [];
        };
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-no-children', mockDeps, 'user-jwt-123');

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assert(!insertSpy || insertSpy.callCount === 0, 'Should not attempt to insert any child jobs');

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should update the parent job status to completed');

        const updateArgs = updateSpy.callsArgs[0][0];
        if (isRecord(updateArgs) && 'status' in updateArgs) {
            assertEquals(updateArgs.status, 'completed');
        } else {
            throw new Error('Update call did not have the expected shape for completion.');
        }
    });

    it('fails parent job if child job insert fails', async () => {
        const mockChildJob: DialecticJobRow = {
            id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };
        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            return [mockChildJob];
        };

        const failingSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    insert: () => Promise.resolve({ data: null, error: new Error('Insert failed!') })
                }
            }
        });

        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-insert-fail', mockDeps, 'user-jwt-123');

        const updateSpy = failingSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should only update the parent job to failed');

        const updateArgs = updateSpy.callsArgs[0][0];
        if (isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs) {
            assertEquals(updateArgs.status, 'failed');
            assert(JSON.stringify(updateArgs.error_details).includes('Failed to insert child jobs: Insert failed!'));
        } else {
            throw new Error('Update call did not have the expected shape for a failure.');
        }
    });

    it('fails parent job if status update fails', async () => {
        const mockChildJob: DialecticJobRow = {
            id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null, is_test_job: false, job_type: 'PLAN',
        };
        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            return [mockChildJob];
        };

        const failingSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                'dialectic_generation_jobs': {
                    insert: () => Promise.resolve({ data: [mockChildJob], error: null }),
                    update: () => Promise.resolve({ data: null, error: new Error('Update failed!') })
                }
            }
        });

        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-update-fail', mockDeps, 'user-jwt-123');

        const updateSpy = failingSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 2, 'Should attempt to update twice (once to wait, once to fail)');

        const firstUpdateArgs = updateSpy.callsArgs[0][0];
        if (isRecord(firstUpdateArgs) && 'status' in firstUpdateArgs) {
            assertEquals(firstUpdateArgs.status, 'waiting_for_children');
        } else {
            throw new Error('First update call was not for waiting_for_children.');
        }

        const secondUpdateArgs = updateSpy.callsArgs[1][0];
        if (isRecord(secondUpdateArgs) && 'status' in secondUpdateArgs && 'error_details' in secondUpdateArgs) {
            assertEquals(secondUpdateArgs.status, 'failed');
            assert(JSON.stringify(secondUpdateArgs.error_details).includes('Failed to update parent job status: Update failed!'));
        } else {
            throw new Error('Second update call was not for failure.');
        }
    });

    it('handles ContextWindowError gracefully', async () => {
        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            throw new ContextWindowError('Planning failed due to context window size.');
        };

        // This test requires a valid recipe to get past the initial checks
        const customSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
            },
        });


        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps, 'user-jwt-123');

        const updateSpy = customSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should have updated the parent job status to failed');

        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs, 'Update call did not have the expected shape for a failure.');
        assertEquals(updateArgs.status, 'failed');
        assert(isRecord(updateArgs.error_details) && typeof updateArgs.error_details.message === 'string' && updateArgs.error_details.message.includes('Context window limit exceeded'));
    });

    // Group 1: Happy Path & Core Orchestration Logic
    it('should fetch the modern recipe, identify the first step, and enqueue child jobs', async () => {
        // This is the primary happy-path test.
        // Arrange:
        // - Configure deps.planComplexStage to return a mock array of child jobs.
        // - Set up spies on the database client for 'insert' and 'update'.
        const mockChildJob: DialecticJobRow = {
            id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE', // Child jobs are for execution
        };
        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            return [mockChildJob];
        };

        // Act:
        // - Call processComplexJob with a new job.
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps, 'user-jwt-123');
        
        // Assert:
        // - planComplexStage was called with the *first* step from the recipe steps.
        const firstStep = mockTemplateRecipeSteps[0];
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1);
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], firstStep);

        // - The database 'insert' spy was called with the correct child jobs.
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
        assertEquals(insertSpy.callsArgs[0][0], [mockChildJob]);

        // - The database 'update' spy was called to set the parent job status to 'waiting_for_children'.
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        const finalUpdateArgs = updateSpy.callsArgs[updateSpy.callCount - 1]; // Get the last update call
        assert(isRecord(finalUpdateArgs[0]));
        assertEquals(finalUpdateArgs[0].status, 'waiting_for_children');
    });

    it('emits planner_started when planner work begins with document and model context', async () => {
        // Arrange
        resetMockNotificationService();
        // Re-bind deps to the reset mock instance
        mockDeps.notificationService = mockNotificationService;

        // Ensure a simple child is produced to pass happy path
        const firstStep = mockTemplateRecipeSteps[0];
        const mockChildJob: DialecticJobRow = {
            id: 'child-1', user_id: 'user-1', session_id: mockParentJob.session_id, stage_slug: mockParentJob.stage_slug,
            payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        mockDeps.planComplexStage = async (...args) => {
            mockProcessorSpies.planComplexStage(...args);
            return [mockChildJob];
        };

        // Act
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, mockDeps, 'user-jwt-123');

        // Assert
        const calls = mockNotificationService.sendDocumentCentricNotification.calls;
        assert(calls.length >= 1, 'Expected at least one document-centric notification');
        const [payloadArg, targetUserId] = calls[0].args;
        assertEquals(payloadArg.type, 'planner_started');
        assertEquals(payloadArg.sessionId, mockParentJob.session_id);
        assertEquals(payloadArg.stageSlug, mockParentJob.stage_slug);
        assertEquals(payloadArg.job_id, mockParentJob.id);
        assertEquals(payloadArg.document_key, String(firstStep.output_type));
        assertEquals(payloadArg.modelId, mockParentJob.payload.model_id);
        assertEquals(payloadArg.iterationNumber, mockParentJob.iteration_number);
        assertEquals(targetUserId, mockParentJob.user_id);
    });

    it('should correctly advance to the next step when waking up from a "pending_next_step" status', async () => {
        // This test proves the state transition logic for multi-step recipes.
        // It will fail because the current logic uses `step_info`, whereas the refactored logic
        // will determine the next step by looking at completed child jobs.
        
        // Arrange:
        // - Set mockParentJob.status to 'pending_next_step'.
        const wakingJob = { ...mockParentJob, status: 'pending_next_step' };
        
        // - Add context to the job payload to indicate that step 1 is complete.
        //   The NEW logic will determine this by seeing a completed child job for the first step.
        const firstStep = mockTemplateRecipeSteps[0];
        const completedChildJobForStep1Payload: DialecticExecuteJobPayload = {
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
                recipe_step_id: firstStep.id, // New logic uses planner_metadata.recipe_step_id
                recipe_template_id: 'template-uuid-1',
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
            completed_at: new Date().toISOString(), results: null, error_details: null, parent_job_id: wakingJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'EXECUTE',
        };
        
        const customSupabase = createMockSupabaseClient(wakingJob.user_id, {
            ...mockSupabase,
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                 // Mock the query that finds completed child jobs
                 'dialectic_generation_jobs': { 
                    select: { data: [completedChildJobForStep1], error: null },
                    update: { data: [{}], error: null }, // for status updates
                },
            }
        });

        // - Set up a spy on deps.planComplexStage.
        // No need to set up a new spy; the one from beforeEach is used. We just check it was called.
        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act:
        // - Call processComplexJob.
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, mockDeps, 'user-jwt-123');

        // Assert:
        // - planComplexStage was called with the *second* step from the recipe.
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1);
        const secondStep = mockTemplateRecipeSteps[1];
        assertEquals(mockProcessorSpies.planComplexStage.calls[0].args[3], secondStep);
    });

    it('should mark the parent job as "completed" after the final step is processed', async () => {
        // This test ensures the job sequence terminates correctly.
        // It will fail because the current logic uses `step_info` to know when it's done.
        // The new logic will see all steps have completed child jobs and terminate.
        
        // Arrange:
        // - Set up the job context to be on the final step of the recipe.
        const completedChildJobsForAllSteps = mockTemplateRecipeSteps.map((step, i) => {
            const completedPayload: DialecticExecuteJobPayload = {
                job_type: 'execute',
                prompt_template_id: step.prompt_template_id!,
                inputs: {},
                output_type: step.output_type,
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
                    recipe_step_id: step.id, // New logic uses planner_metadata.recipe_step_id
                    recipe_template_id: 'template-uuid-1',
                },
            };
            if (!isJson(completedPayload)) {
                throw new Error(`Test setup failed: completedPayload for step ${i} is not valid JSON`);
            }
            return {
                id: `child-step-${i}-complete`, user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
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
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: mockTemplateRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: mockTemplateRecipeEdges, error: null } },
                 'dialectic_generation_jobs': { 
                    select: { data: completedChildJobsForAllSteps, error: null },
                    update: { data: [{}], error: null },
                },
            }
        });
        
        // Act:
        // - Call processComplexJob.
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockParentJob.user_id, mockDeps, 'user-jwt-123');

        // Assert:
        // - The final 'update' call on the parent job sets the status to 'completed'.
        const updateSpy = customSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        const finalUpdateCallArgs = updateSpy.callsArgs[updateSpy.callCount - 1];
        assert(isRecord(finalUpdateCallArgs[0]));
        assertEquals(finalUpdateCallArgs[0].status, 'completed');
    });

    it('should track completed steps using planner_metadata.recipe_step_id instead of step_slug', async () => {
        // This test proves the target state: processComplexJob correctly tracks completed steps
        // by looking up planner_metadata.recipe_step_id and mapping it to step_slug via stepSlugById.
        // This prevents infinite loops where completed steps are re-planned.
        
        // Arrange:
        // - Create a recipe with header_context step (build-stage-header) and a dependent step (business_case)
        const headerContextStep: DialecticRecipeTemplateStep = {
            step_key: 'build-stage-header-key',
            step_name: 'Build Stage Header',
            id: 'header-context-step-id',
            template_id: 'template-uuid-1',
            step_slug: 'build-stage-header',
            job_type: 'PLAN',
            prompt_type: 'Turn',
            prompt_template_id: 'prompt-template-header',
            output_type: FileType.HeaderContext,
            granularity_strategy: 'all_to_one',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {},
            step_number: 1,
            parallel_group: null,
            branch_key: null,
            step_description: 'Generate header context',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const businessCaseStep: DialecticRecipeTemplateStep = {
            step_key: 'business-case-key',
            step_name: 'Business Case',
            id: 'business-case-step-id',
            template_id: 'template-uuid-1',
            step_slug: 'business_case',
            job_type: 'PLAN',
            prompt_type: 'Turn',
            prompt_template_id: 'prompt-template-business',
            output_type: FileType.business_case,
            granularity_strategy: 'per_source_document',
            inputs_required: [
                { type: 'header_context', required: true, slug: 'build-stage-header' }
            ],
            inputs_relevance: [],
            outputs_required: {},
            step_number: 2,
            parallel_group: null,
            branch_key: null,
            step_description: 'Generate business case',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const testRecipeSteps = [headerContextStep, businessCaseStep];
        const testRecipeEdges = [
            {
                id: 'edge-header-to-business',
                template_id: 'template-uuid-1',
                from_step_id: 'header-context-step-id',
                to_step_id: 'business-case-step-id',
                created_at: new Date().toISOString(),
            },
        ];

        // - Create a completed child job for header_context with planner_metadata.recipe_step_id (NOT step_slug)
        const completedHeaderContextPayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            prompt_template_id: 'prompt-template-header',
            inputs: {},
            output_type: FileType.HeaderContext,
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
                recipe_step_id: 'header-context-step-id', // This is what processComplexJob should use
                recipe_template_id: 'template-uuid-1',
            },
        };

        if (!isJson(completedHeaderContextPayload)) {
            throw new Error('completedHeaderContextPayload is not a valid JSON object');
        }
        const completedHeaderContextJob: DialecticJobRow = {
            id: 'child-header-context-complete',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
            stage_slug: 'antithesis',
            payload: completedHeaderContextPayload,
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

        const wakingJob = { ...mockParentJob, status: 'waiting_for_children' };

        const customSupabase = createMockSupabaseClient(wakingJob.user_id, {
            ...mockSupabase,
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStageRow], error: null } },
                'dialectic_stage_recipe_instances': { select: { data: [mockInstanceRow_NotCloned], error: null } },
                'dialectic_recipe_template_steps': { select: { data: testRecipeSteps, error: null } },
                'dialectic_recipe_template_edges': { select: { data: testRecipeEdges, error: null } },
                'dialectic_generation_jobs': { 
                    select: { data: [completedHeaderContextJob], error: null },
                    update: { data: [{}], error: null },
                },
            }
        });

        // - Set up planComplexStage to return empty array (we just want to verify which step it was called with)
        mockJobProcessors.planComplexStage = async () => Promise.resolve([]);

        // Act:
        // - Call processComplexJob
        await processComplexJob(customSupabase.client as unknown as SupabaseClient<Database>, wakingJob, wakingJob.user_id, mockDeps, 'user-jwt-123');

        // Assert:
        // - planComplexStage was called ONCE with the SECOND step (business_case), NOT the first step (header_context)
        //   This proves that processComplexJob correctly identified header_context as complete using planner_metadata.recipe_step_id
        assertEquals(mockProcessorSpies.planComplexStage.calls.length, 1, 'planComplexStage should be called exactly once');
        const calledStep = mockProcessorSpies.planComplexStage.calls[0].args[3];
        assertEquals(calledStep.step_slug, 'business_case', 'planComplexStage should be called with business_case step, not header_context');
        assertEquals(calledStep.id, 'business-case-step-id', 'planComplexStage should be called with business_case step ID');
        
        // - Verify header_context step is NOT called (preventing infinite loop)
        const headerContextWasCalled = mockProcessorSpies.planComplexStage.calls.some(
            call => call.args[3].step_slug === 'build-stage-header'
        );
        assert(!headerContextWasCalled, 'planComplexStage should NOT be called with header_context step, proving it was recognized as complete');
    });
});