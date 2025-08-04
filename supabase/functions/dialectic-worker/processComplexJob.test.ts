import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json, Tables } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processComplexJob } from './processComplexJob.ts';
import type { DialecticJobRow, GranularityPlannerFn, DialecticPlanJobPayload, IDialecticJobDeps, UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { isRecord, isJson } from '../_shared/utils/type_guards.ts';
import { logger } from '../_shared/logger.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';

const mockStage: Pick<Tables<'dialectic_stages'>, 'input_artifact_rules'> = {
    input_artifact_rules: {
        processing_strategy: { type: 'task_isolation' },
        steps: [
            { step: 1, prompt_template_name: 'test-prompt', granularity_strategy: 'full_text', output_type: 'test-output', inputs_required: [] },
            { step: 2, prompt_template_name: 'test-prompt-2', granularity_strategy: 'full_text', output_type: 'test-output-2', inputs_required: [] },
        ]
    }
};

describe('processComplexJob', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let mockDeps: IDialecticJobDeps;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    
    beforeEach(() => {
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: { 'dialectic_stages': { select: { data: [mockStage], error: null } } }
        });
        const ragServiceDeps = {
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
            logger: logger,
            indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
            embeddingClient: { createEmbedding: () => Promise.resolve([]) },
        };
        const promptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

        const mockPayload: DialecticPlanJobPayload = {
            job_type: 'plan',
            step_info: { current_step: 1, total_steps: 2 },
            sessionId: 'session-id-complex',
            projectId: 'project-id-complex',
            stageSlug: 'antithesis',
            model_id: 'model-id-complex',
        };

        if (!isJson(mockPayload)) {
            throw new Error("Test setup failed: mockPayload is not a valid Json");
        }

        mockParentJob = {
            id: 'job-id-parent',
            user_id: 'user-id-complex',
            session_id: 'session-id-complex',
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
        };

            const mockUnifiedAIResponse: UnifiedAIResponse = { content: 'mock', finish_reason: 'stop' };
            mockDeps = {
                logger,
                planComplexStage: spy(async () => Promise.resolve([])),
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
                        api_identifier_for_tokenization: 'mock-api' },
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
            };
    });

    it('plans and enqueues child jobs', async () => {
        const mockChildJob1: DialecticJobRow = {
            id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
        };
        const mockChildJob2: DialecticJobRow = {
            id: 'child-2', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
            payload: { message: 'Child 2' }, iteration_number: 1, status: 'pending',
            attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
            completed_at: null, results: null, error_details: null, parent_job_id: mockParentJob.id,
            target_contribution_id: null, prerequisite_job_id: null,
        };
        
        mockDeps.planComplexStage = spy(async () => Promise.resolve([mockChildJob1, mockChildJob2]));
        
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-complex', mockDeps);

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
        mockDeps.planComplexStage = spy(async () => Promise.reject(new Error('Planner failed!')));

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps);

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
        // planComplexStage spy is already configured to return [] in beforeEach
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-no-children', mockDeps);

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
        };
        mockDeps.planComplexStage = spy(async () => Promise.resolve([mockChildJob]));
        
        const failingSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStage], error: null } },
                'dialectic_generation_jobs': {
                    insert: () => Promise.resolve({ data: null, error: new Error('Insert failed!') })
                }
            }
        });

        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-insert-fail', mockDeps);
        
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
            target_contribution_id: null, prerequisite_job_id: null,
        };
        mockDeps.planComplexStage = spy(async () => Promise.resolve([mockChildJob]));

        const failingSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockStage], error: null } },
                'dialectic_generation_jobs': {
                    insert: () => Promise.resolve({ data: [mockChildJob], error: null }),
                    update: () => Promise.resolve({ data: null, error: new Error('Update failed!') })
                }
            }
        });

        await processComplexJob(failingSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-update-fail', mockDeps);

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
        mockDeps.planComplexStage = spy(async () => Promise.reject(new ContextWindowError('Planning failed due to context window size.')));

        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, 'user-id-fail', mockDeps);

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should have updated the parent job status to failed');
        
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs, 'Update call did not have the expected shape for a failure.');
        assertEquals(updateArgs.status, 'failed');
        assert(isRecord(updateArgs.error_details) && typeof updateArgs.error_details.message === 'string' && updateArgs.error_details.message.includes('Context window limit exceeded'));
    });
});