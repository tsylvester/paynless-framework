// supabase/functions/dialectic-worker/task_isolator.test.ts
import {
    describe,
    it,
    beforeEach,
} from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import {
    assert,
    assertEquals,
    assertRejects,
} from 'jsr:@std/assert@0.225.3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    DialecticCombinationJobPayload,
    GranularityPlannerFn,
} from '../dialectic-service/dialectic.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { IPlanComplexJobDeps } from './processComplexJob.ts';
import { planComplexStage } from './task_isolator.ts';
import {
    isDialecticCombinationJobPayload,
    isDialecticExecuteJobPayload,
} from '../_shared/utils/type_guards.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import { createMockSupabaseClient, MockQueryBuilderState } from '../_shared/supabase.mock.ts';

type SourceDocument = DialecticContributionRow & { content: string };

describe('planComplexStage', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let mockLogger: ILogger;
    let mockDeps: IPlanComplexJobDeps;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockRecipeStep: DialecticRecipeStep;

    const mockContributions: DialecticContributionRow[] = [
        {
            id: 'doc-1-thesis',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'test-stage',
            iteration_number: 1,
            model_id: 'model-1',
            model_name: 'Test Model',
            prompt_template_id_used: 'prompt-1',
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            processing_time_ms: 100,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'thesis',
            file_name: 'doc1.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage',
            size_bytes: 123,
            mime_type: 'text/plain',
        },
        {
            id: 'doc-2-antithesis',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'test-stage',
            iteration_number: 1,
            model_id: 'model-1',
            model_name: 'Test Model',
            prompt_template_id_used: 'prompt-1',
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            processing_time_ms: 100,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'antithesis',
            file_name: 'doc2.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage',
            size_bytes: 123,
            mime_type: 'text/plain',
        },
    ];

    beforeEach(() => {
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const typeFilter = state.filters.find(f => f.column === 'contribution_type');
                        if (typeFilter) {
                            const filteredData = mockContributions.filter(c => c.contribution_type === typeFilter.value);
                            return Promise.resolve({ data: filteredData, error: null, count: filteredData.length, status: 200, statusText: 'OK' });
                        }
                        // Default if no type filter is applied, though our code under test always applies one.
                        return Promise.resolve({ data: mockContributions, error: null, count: mockContributions.length, status: 200, statusText: 'OK' });
                    },
                },
            },
        });

        mockLogger = {
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
        };

        mockParentJob = {
            id: 'parent-job-123',
            status: 'pending',
            payload: {
                job_type: 'plan',
                step_info: { current_step: 1, total_steps: 2 },
                model_id: 'model-1',
                projectId: 'proj-1',
                sessionId: 'sess-1',
                stageSlug: 'test-stage',
                iterationNumber: 1,
                walletId: 'wallet-1',
                continueUntilComplete: false,
                maxRetries: 3,
                continuation_count: 0,
            },
            created_at: new Date().toISOString(),
            user_id: 'user-123',
            attempt_count: 0,
            max_retries: 3,
            completed_at: null,
            error_details: null,
            iteration_number: 1,
            parent_job_id: null,
            prerequisite_job_id: null,
            results: null,
            session_id: 'sess-1',
            started_at: null,
            stage_slug: 'test-stage',
            target_contribution_id: null
        };

        mockRecipeStep = {
            step: 1,
            name: 'Test Step',
            prompt_template_name: 'test-prompt',
            inputs_required: [{ type: 'thesis' }],
            granularity_strategy: 'per_source_document',
            output_type: 'test_artifact',
        };

        const mockPromptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

        mockDeps = {
            logger: mockLogger,
            planComplexStage: () => Promise.resolve([]),
            promptAssembler: mockPromptAssembler,
            downloadFromStorage: (bucket, path) => {
                const doc = mockContributions.find(c => `${c.storage_path}/${c.file_name}` === path);
                const contentBuffer = doc ? new TextEncoder().encode(`content for ${doc.id}`).buffer : new ArrayBuffer(0);
                // Ensure it's a concrete ArrayBuffer
                const data = contentBuffer instanceof ArrayBuffer ? contentBuffer : new ArrayBuffer(0);
                return Promise.resolve({ data, error: null });
            },
            getGranularityPlanner: () => undefined, // Default to undefined
        };
    });
    
    it('should throw an error if no planner is found for the strategy', async () => {
        // This test relies on the default mock for getGranularityPlanner returning undefined.
        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep),
            Error,
            `No planner found for granularity strategy: ${mockRecipeStep.granularity_strategy}`,
        );
    });

    it('should correctly create child jobs for an "execute" planner', async () => {
        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            step_info: { current_step: 1, total_steps: 2 },
            prompt_template_name: 'test-prompt',
            output_type: 'test_artifact',
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'wallet-1',
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
        };
        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload];
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
        );

        assertEquals(childJobs.length, 1);
        const childJob = childJobs[0];
        assertEquals(childJob.parent_job_id, mockParentJob.id);
        assertEquals(childJob.status, 'pending');
        
        assert(childJob.payload);
        if (isDialecticExecuteJobPayload(childJob.payload)) {
            assertEquals(childJob.payload.job_type, 'execute');
            assertEquals(childJob.payload.inputs.documentId, 'doc-1-thesis');
            assertEquals(childJob.payload.output_type, 'test_artifact');
        } else {
            assert(false, 'Payload is not of type DialecticExecuteJobPayload');
        }
    });

    it('should correctly create child jobs for a "combine" planner', async () => {
        const mockCombinePayload: DialecticCombinationJobPayload = {
            job_type: 'combine',
            inputs: { document_ids: ['doc-1-thesis'] },
            model_id: 'model-1',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'wallet-1',
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
        };

        const plannerFn: GranularityPlannerFn = () => [mockCombinePayload];
        mockDeps.getGranularityPlanner = () => plannerFn;
        
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
        );

        assertEquals(childJobs.length, 1);
        const childJob = childJobs[0];
        assertEquals(childJob.parent_job_id, mockParentJob.id);

        assert(childJob.payload);
        assert(isDialecticCombinationJobPayload(childJob.payload));
        assertEquals(childJob.payload.job_type, 'combine');
        assertEquals(childJob.payload.inputs?.document_ids, ['doc-1-thesis']);
    });

    it('should throw an error if fetching source contributions fails', async () => {
        mockRecipeStep.inputs_required = [{ type: 'thesis' }];
        
        if (mockSupabase.genericMockResults?.dialectic_contributions) {
            mockSupabase.genericMockResults.dialectic_contributions.select = () => {
                return Promise.resolve({ data: null, error: new Error('DB Read Error'), count: 0, status: 500, statusText: 'Internal Server Error' });
            };
        }

        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep),
            Error,
            "Failed to fetch source contributions for type 'thesis': DB Read Error",
        );
    });

    it('should throw an error if downloading a document fails', async () => {
        mockDeps.downloadFromStorage = () => Promise.resolve({
            data: null,
            error: new Error('Storage Download Error'),
        });
        
        const plannerFn: GranularityPlannerFn = () => [];
        mockDeps.getGranularityPlanner = () => plannerFn;

        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep),
            Error,
            'Failed to download content for contribution doc-1-thesis from projects/proj-1/sessions/sess-1/iteration_1/test-stage/doc1.txt: Storage Download Error',
        );
    });
    
    it('should skip contributions that are missing a file_name', async () => {
        const localMockContributions = [
            ...mockContributions,
            { ...mockContributions[0], id: 'doc-3', file_name: null }
        ];

        if (mockSupabase.genericMockResults?.dialectic_contributions) {
            mockSupabase.genericMockResults.dialectic_contributions.select = (state: MockQueryBuilderState) => {
                const typeFilter = state.filters.find(f => f.column === 'contribution_type');
                if (typeFilter?.value === 'thesis') {
                    const data = localMockContributions.filter(c => c.contribution_type === 'thesis');
                    return Promise.resolve({ data, error: null, count: data.length, status: 200, statusText: 'OK' });
                }
                return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
            };
        }
        
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            assertEquals(sourceDocs.length, 1);
            assert(!sourceDocs.some(doc => doc.id === 'doc-3'));
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;
        
        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);
    });

    it('should not call the planner if no source documents are found', async () => {
        mockRecipeStep.inputs_required = [{ type: 'non_existent_type' }];
        
        let plannerCalled = false;
        const plannerFn: GranularityPlannerFn = () => {
            plannerCalled = true;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(childJobs.length, 0);
        assertEquals(plannerCalled, false);
    });

    it('should return an empty array if the planner returns no payloads', async () => {
        const plannerFn: GranularityPlannerFn = () => [];
        mockDeps.getGranularityPlanner = () => plannerFn;
        
        const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(childJobs.length, 0);
    });

    it('should correctly create a mix of execute and combine jobs', async () => {
        mockRecipeStep.inputs_required = [{ type: 'thesis' }];
        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            step_info: { current_step: 1, total_steps: 2 },
            prompt_template_name: 'test-prompt',
            output_type: 'test_artifact',
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'wallet-1',
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
        };
        const mockCombinePayload: DialecticCombinationJobPayload = {
            job_type: 'combine',
            inputs: { document_ids: ['doc-1-thesis'] },
            model_id: 'model-1',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'wallet-1',
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
        };

        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload, mockCombinePayload];
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(childJobs.length, 2);
        
        const executeJob = childJobs.find(job => isDialecticExecuteJobPayload(job.payload));
        const combineJob = childJobs.find(job => isDialecticCombinationJobPayload(job.payload));

        assert(executeJob, 'Execute job should be created');
        assert(combineJob, 'Combine job should be created');
    });

    it('should skip contributions that are missing storage_bucket or storage_path', async () => {
        const localMockContributions = [
            ...mockContributions,
            { ...mockContributions[0], id: 'doc-3', storage_bucket: null },
            { ...mockContributions[0], id: 'doc-4', storage_path: null },
        ];

        if (mockSupabase.genericMockResults?.dialectic_contributions) {
            mockSupabase.genericMockResults.dialectic_contributions.select = (state: MockQueryBuilderState) => {
                const typeFilter = state.filters.find(f => f.column === 'contribution_type');
                 if (typeFilter?.value === 'thesis') {
                    const data = localMockContributions.filter(c => c.contribution_type === 'thesis');
                    return Promise.resolve({ data, error: null, count: data.length, status: 200, statusText: 'OK' });
                }
                return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
            };
        }
        
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            assertEquals(sourceDocs.length, 1);
            assert(!sourceDocs.some(doc => doc.id === 'doc-3' || doc.id === 'doc-4'));
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;
        
        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);
    });

    it('should handle downloaded files that are empty', async () => {
        mockDeps.downloadFromStorage = () => Promise.resolve({ data: new ArrayBuffer(0), error: null });

        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(receivedDocs.length, 1);
        assertEquals(receivedDocs[0].content, '');
    });

    it('should gracefully skip malformed payloads from the planner', async () => {
        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            step_info: { current_step: 1, total_steps: 2 },
            prompt_template_name: 'test-prompt',
            output_type: 'test_artifact',
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'wallet-1',
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
        };
        const malformedPayload = { an_invalid: 'payload' };

        // We are explicitly violating the type here for testing purposes
        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload, malformedPayload as any];
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(childJobs.length, 1);
        assert(isDialecticExecuteJobPayload(childJobs[0].payload));
    });
}); 