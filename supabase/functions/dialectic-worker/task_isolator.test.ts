// supabase/functions/dialectic-worker/task_isolator.test.ts
import {
    describe,
    it,
    beforeEach,
} from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import { stub, spy } from 'https://deno.land/std@0.190.0/testing/mock.ts';
import type { Spy } from 'https://deno.land/std@0.190.0/testing/mock.ts';
import {
    assert,
    assertEquals,
    assertRejects,
    assertExists,
} from 'jsr:@std/assert@0.225.3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Tables } from '../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    GranularityPlannerFn,
    IDialecticJobDeps,
    ContributionType,
} from '../dialectic-service/dialectic.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { planComplexStage } from './task_isolator.ts';
import {
    isDialecticPlanJobPayload,
    isDialecticExecuteJobPayload,
} from '../_shared/utils/type_guards.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import { createMockSupabaseClient, MockQueryBuilderState } from '../_shared/supabase.mock.ts';
import { AiModelExtendedConfig } from '../_shared/types.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { IRagContextResult, IRagServiceDependencies } from '../_shared/services/rag_service.interface.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';

type SourceDocument = DialecticContributionRow & { content: string };

describe('planComplexStage', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let mockLogger: ILogger;
    let mockDeps: IDialecticJobDeps;
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
            document_relationships: null,
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
            document_relationships: null,
        },
    ];

    beforeEach(() => {
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const stageSlugFilter = state.filters.find(f => f.column === 'stage_slug');
                        if (stageSlugFilter) {
                            const filteredData = mockContributions.filter(c => c.stage === stageSlugFilter.value);
                            return Promise.resolve({ data: filteredData, error: null, count: filteredData.length, status: 200, statusText: 'OK' });
                        }

                        const typeFilter = state.filters.find(f => f.column === 'contribution_type');
                        if (typeFilter) {
                            const filteredData = mockContributions.filter(c => c.contribution_type === typeFilter.value);
                            return Promise.resolve({ data: filteredData, error: null, count: filteredData.length, status: 200, statusText: 'OK' });
                        }
                        
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
            output_type: 'thesis',
        };

        const mockRagDeps: IRagServiceDependencies = {
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
            logger: mockLogger,
            indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
            embeddingClient: { createEmbedding: () => Promise.resolve([]) },
        };
        const mockPromptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>, mockRagDeps, undefined);

        mockDeps = {
            logger: mockLogger,
            planComplexStage: () => Promise.resolve([]),
            downloadFromStorage: (bucket, path) => {
                const doc = mockContributions.find(c => `${c.storage_path}/${c.file_name}` === path);
                const contentBuffer = doc ? new TextEncoder().encode(`content for ${doc.id}`).buffer : new ArrayBuffer(0);
                // Ensure it's a concrete ArrayBuffer
                const data = contentBuffer instanceof ArrayBuffer ? contentBuffer : new ArrayBuffer(0);
                return Promise.resolve({ data, error: null });
            },
            getGranularityPlanner: () => undefined, // Default to undefined
            ragService: new MockRagService(),
            fileManager: new MockFileManagerService(),
            countTokens: () => 0,
            getAiProviderConfig: () => Promise.resolve({
                api_identifier: 'mock-api-identifier',
                input_token_cost_rate: 0,
                output_token_cost_rate: 0,
                provider_max_input_tokens: 8192,
                tokenization_strategy: {
                    type: 'tiktoken',
                    tiktoken_encoding_name: 'cl100k_base',
                    tiktoken_model_name_for_rules_fallback: 'gpt-4o',
                    is_chatml_model: false,
                    api_identifier_for_tokenization: 'mock-api-identifier',
                },
            }),
            getSeedPromptForStage: () => Promise.resolve({ content: '', fullPath: '', bucket: '', path: '', fileName: '' }),
            continueJob: () => Promise.resolve({ enqueued: false }),
            retryJob: () => Promise.resolve({ error: undefined }),
            notificationService: mockNotificationService,
            executeModelCallAndSave: () => Promise.resolve(),
            callUnifiedAIModel: () => Promise.resolve({ content: '', finish_reason: 'stop' }),
            getExtensionFromMimeType: () => '.txt',
            randomUUID: () => 'random-uuid',
            deleteFromStorage: () => Promise.resolve({ data: null, error: null }),
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

    it('should correctly create child jobs for an "execute" planner creating an intermediate artifact', async () => {
        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            step_info: { current_step: 1, total_steps: 2 },
            prompt_template_name: 'test-prompt',
            output_type: 'pairwise_synthesis_chunk',
            inputs: { documentId: 'doc-1-thesis' },
            isIntermediate: true,
            model_id: 'model-1',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'wallet-1',
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: {
                contributionType: 'pairwise_synthesis_chunk',
                sourceModelSlugs: ['Test Model'],
                sourceAnchorType: 'thesis',
                sourceAnchorModelSlug: 'Test Model',
            },
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
        
        assert(isDialecticExecuteJobPayload(childJob.payload));
        const payload = childJob.payload;

        assertEquals(payload.job_type, 'execute');
        assertEquals(payload.output_type, 'pairwise_synthesis_chunk');
        assertEquals(payload.isIntermediate, true);
        
        // Assert the full canonical path params are passed through correctly
        assertExists(payload.canonicalPathParams);
        const params = payload.canonicalPathParams;
        assertEquals(params.contributionType, 'pairwise_synthesis_chunk');
        assertEquals(params.sourceModelSlugs, ['Test Model']);
        assertEquals(params.sourceAnchorType, 'thesis');
        assertEquals(params.sourceAnchorModelSlug, 'Test Model');
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
            output_type: 'thesis',
            inputs: { documentId: 'doc-1-thesis' },
            isIntermediate: true, // ADDED FOR TEST
            model_id: 'model-1',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'wallet-1',
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'thesis' },
        };
        const malformedPayload = { an_invalid: 'payload' };

        // We are explicitly violating the type here for testing purposes
        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload, malformedPayload as any];
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(childJobs.length, 1);
        assert(isDialecticExecuteJobPayload(childJobs[0].payload));
    });

    it('should query by stage_slug when present in the rule', async () => {
        mockRecipeStep.inputs_required = [{ type: 'some_generic_type', stage_slug: 'thesis' }];
        
        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(receivedDocs.length, 1);
        assertEquals(receivedDocs[0].contribution_type, 'thesis');
        assertEquals(receivedDocs[0].id, 'doc-1-thesis');
    });

    it('should query by type when stage_slug is not present in the rule', async () => {
        mockRecipeStep.inputs_required = [{ type: 'antithesis' }];
        
        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep);

        assertEquals(receivedDocs.length, 1);
        assertEquals(receivedDocs[0].contribution_type, 'antithesis');
        assertEquals(receivedDocs[0].id, 'doc-2-antithesis');
    });

    it('should invoke RAG service when token count exceeds the limit', async () => {
        const mockRagService = new MockRagService({ mockContextResult: 'Mocked RAG context' });
        const getContextForModelSpy = spy(mockRagService, 'getContextForModel');
        mockDeps.ragService = mockRagService;
        mockDeps.countTokens = () => 9000; // Exceeds the mock limit of 8192

        const mockFileRecord: Tables<'dialectic_project_resources'> = {
            id: 'mock-file-record-id',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            project_id: 'proj-1',
            file_name: 'rag_summary_for_job_parent-job-123.txt',
            mime_type: 'text/plain',
            size_bytes: 123,
            storage_bucket: 'test-bucket',
            storage_path: '/path/to',
            user_id: 'user-123',
            resource_description: { description: 'RAG summary' }
        };
        mockDeps.fileManager.uploadAndRegisterFile = () => Promise.resolve({ record: mockFileRecord, error: null });
        
        const uploadSpy = spy(mockDeps.fileManager, 'uploadAndRegisterFile');

        // Act
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep
        );

        // Assert
        // 1. RAG service was called
        assertEquals(getContextForModelSpy.calls.length, 1);
        
        // 2. File manager was called to save the RAG context
        assertEquals(uploadSpy.calls.length, 1);
        const uploadContext = uploadSpy.calls[0].args[0];

        assertExists(uploadContext);
        assertEquals(uploadContext.resourceTypeForDb, 'rag_context_summary');
        assertEquals(uploadContext.fileContent, 'Mocked RAG context');
        assertEquals(uploadContext.pathContext.fileType, 'rag_context_summary');

        // 3. A single child job was created
        assertEquals(childJobs.length, 1);
        const childJob = childJobs[0];
        assert(isDialecticExecuteJobPayload(childJob.payload));
        
        // 4. The child job has the correct inputs pointing to the RAG artifact
        assertEquals(childJob.payload.inputs.rag_summary_id, 'mock-file-record-id');
        assertEquals(childJob.payload.job_type, 'execute');

        // 5. Assert the canonical path params are correct for a RAG-generated job
        assertExists(childJob.payload.canonicalPathParams);
        const params = childJob.payload.canonicalPathParams;
        assertEquals(params.contributionType, mockRecipeStep.output_type);
        assertEquals(params.sourceModelSlugs, undefined);
        assertEquals(params.sourceAnchorType, undefined);
        assertEquals(params.sourceAnchorModelSlug, undefined);
    });
}); 