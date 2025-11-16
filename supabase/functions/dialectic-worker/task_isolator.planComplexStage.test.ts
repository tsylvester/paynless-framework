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
    SourceDocument,
    DialecticFeedbackRow,
    DialecticProjectResourceRow,
    InputRule,
} from '../dialectic-service/dialectic.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { planComplexStage, findSourceDocuments } from './task_isolator.ts';
import {
    isDialecticPlanJobPayload,
    isDialecticExecuteJobPayload,
} from '../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
    import { PromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.ts';
import { createMockSupabaseClient, MockQueryBuilderState, MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';
import { AiModelExtendedConfig } from '../_shared/types.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { IRagContextResult, IRagServiceDependencies } from '../_shared/services/rag_service.interface.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { isJson } from '../_shared/utils/type-guards/type_guards.common.ts';

describe('planComplexStage', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let mockLogger: ILogger;
    let mockDeps: IDialecticJobDeps;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockRecipeStep: DialecticRecipeStep;
    let mockContributions: DialecticContributionRow[];
    let mockProjectResources: DialecticProjectResourceRow[];
    let mockFeedback: DialecticFeedbackRow[];


    beforeEach(() => {
        mockContributions = [
            {
                id: 'doc-1-thesis',
                session_id: 'sess-1',
                user_id: 'user-123',
                stage: 'thesis',
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
                storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
                size_bytes: 123,
                mime_type: 'text/plain',
                document_relationships: null,
                is_header: false,
                source_prompt_resource_id: null,
            },
            {
                id: 'doc-2-antithesis',
                session_id: 'sess-1',
                user_id: 'user-123',
                stage: 'antithesis',
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
                storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/antithesis',
                size_bytes: 123,
                mime_type: 'text/plain',
                document_relationships: null,
                is_header: false,
                source_prompt_resource_id: null,
            },
            {
                id: 'header-context-1',
                session_id: 'sess-1',
                user_id: 'user-123',
                stage: 'test-stage',
                iteration_number: 1,
                model_id: 'model-1',
                model_name: 'Test Model',
                prompt_template_id_used: 'prompt-planner',
                seed_prompt_url: null,
                edit_version: 1,
                is_latest_edit: true,
                original_model_contribution_id: null,
                raw_response_storage_path: null,
                target_contribution_id: null,
                tokens_used_input: 5,
                tokens_used_output: 5,
                processing_time_ms: 50,
                error: null,
                citations: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                contribution_type: 'header_context',
                file_name: 'header.json',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/context',
                size_bytes: 80,
                mime_type: 'application/json',
                document_relationships: null,
                is_header: true,
                source_prompt_resource_id: null,
            },
        ];

        mockProjectResources = [{
            id: 'resource-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_test-stage_business_case_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 456,
            resource_description: { "description": "A test resource file", type: 'document', document_key: FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: null,
        }];

        mockFeedback = [{
            id: 'feedback-1',
            session_id: 'sess-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            target_contribution_id: 'doc-1-thesis',
            stage_slug: 'thesis',
            iteration_number: 1,
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis/_feedback',
            file_name: 'feedback.txt',
            mime_type: 'text/plain',
            size_bytes: 789,
            feedback_type: 'user_feedback',
            resource_description: { note: 'This is user feedback.' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }];

        // This beforeEach block is re-initialized for every 'it' block,
        // ensuring test isolation.
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        // A robust mock that correctly applies all chained filters.
                        let data = [...mockContributions];
                        for (const filter of state.filters) {
                            if (filter.column && filter.type === 'eq') {
                                data = data.filter((c: any) => c[filter.column!] === filter.value);
                            }
                        }
                        return Promise.resolve({ data, error: null, count: data.length, status: 200, statusText: 'OK' });
                    },
                },
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const isDescriptorRecord = (value: unknown): value is Record<string, unknown> =>
                            typeof value === 'object' && value !== null;

                        const descriptorValue = (resource: DialecticProjectResourceRow, key: string): unknown => {
                            if (key.length === 0) return undefined;
                            const descriptor = resource.resource_description;
                            if (!isDescriptorRecord(descriptor)) return undefined;
                            return descriptor[key];
                        };

                        const matchesEqFilter = (
                            resource: DialecticProjectResourceRow,
                            column: string,
                            value: unknown,
                        ): boolean => {
                            if (column.startsWith('resource_description->>')) {
                                const [, descriptorKey = ''] = column.split('->>');
                                const candidate = descriptorValue(resource, descriptorKey);
                                return candidate === value;
                            }

                            switch (column) {
                                case 'project_id':
                                    return resource.project_id === value;
                                case 'stage_slug':
                                    return resource.stage_slug === value;
                                case 'resource_type':
                                    return resource.resource_type === value;
                                case 'session_id':
                                    return resource.session_id === value;
                                case 'iteration_number':
                                    return resource.iteration_number === value;
                                case 'user_id':
                                    return resource.user_id === value;
                                case 'source_contribution_id':
                                    return resource.source_contribution_id === value;
                                case 'file_name':
                                    return resource.file_name === value;
                                default:
                                    return false;
                            }
                        };

                        const matchesIlikeFilter = (
                            resource: DialecticProjectResourceRow,
                            column: string,
                            value: unknown,
                        ): boolean => {
                            if (typeof value !== 'string') {
                                return false;
                            }
                            // Remove % wildcards from pattern
                            const cleanedValue = value.replace(/%/g, '');

                            if (column.startsWith('resource_description->>')) {
                                const [, descriptorKey = ''] = column.split('->>');
                                const candidate = descriptorValue(resource, descriptorKey);
                                if (typeof candidate !== 'string') {
                                    return false;
                                }
                                return candidate.toLowerCase().includes(cleanedValue.toLowerCase());
                            }

                            switch (column) {
                                case 'file_name': {
                                    const candidate = resource.file_name;
                                    if (typeof candidate !== 'string') {
                                        return false;
                                    }
                                    return candidate.toLowerCase().includes(cleanedValue.toLowerCase());
                                }
                                default:
                                    return false;
                            }
                        };

                        const matchesOrCondition = (
                            resource: DialecticProjectResourceRow,
                            condition: string,
                        ): boolean => {
                            const trimmed = condition.trim();
                            if (trimmed.length === 0 || trimmed === 'undefined') {
                                return false;
                            }
                            const segments = trimmed.split('.');
                            if (segments.length < 3) {
                                return false;
                            }
                            const column = segments[0];
                            const operator = segments[1];
                            const rawValue = segments.slice(2).join('.');
                            let cleanedValue = rawValue;
                            if (operator === 'ilike') {
                                cleanedValue = rawValue.replace(/%/g, '');
                            }

                            if (column.startsWith('resource_description->>')) {
                                const [, descriptorKey = ''] = column.split('->>');
                                const candidate = descriptorValue(resource, descriptorKey);
                                if (typeof candidate !== 'string') {
                                    return false;
                                }
                                if (operator === 'eq') {
                                    return candidate === cleanedValue;
                                }
                                if (operator === 'ilike') {
                                    return candidate.toLowerCase().includes(cleanedValue.toLowerCase());
                                }
                                return false;
                            }

                            if (column === 'file_name') {
                                const candidate = resource.file_name;
                                if (typeof candidate !== 'string') {
                                    return false;
                                }
                                if (operator === 'eq') {
                                    return candidate === cleanedValue;
                                }
                                if (operator === 'ilike') {
                                    return candidate.toLowerCase().includes(cleanedValue.toLowerCase());
                                }
                            }

                            return false;
                        };

                        let data = [...mockProjectResources];
                        for (const filter of state.filters) {
                            if (filter.type === 'eq' && typeof filter.column === 'string') {
                                const column = filter.column;
                                data = data.filter((resource) => matchesEqFilter(resource, column, filter.value));
                            } else if (filter.type === 'ilike' && typeof filter.column === 'string') {
                                const column = filter.column;
                                data = data.filter((resource) => matchesIlikeFilter(resource, column, filter.value));
                            } else if (filter.type === 'or' && typeof filter.filters === 'string') {
                                const conditions = filter.filters.split(',');
                                data = data.filter((resource) => conditions.some((condition) => matchesOrCondition(resource, condition)));
                            }
                        }

                        if (typeof state.orClause === 'string' && state.orClause.length > 0) {
                            const additionalConditions = state.orClause.split(',').map((clause) => clause.trim()).filter(Boolean);
                            data = data.filter((resource) => additionalConditions.some((condition) => matchesOrCondition(resource, condition)));
                        }

                        return Promise.resolve({ data, error: null, count: data.length, status: 200, statusText: 'OK' });
                    },
                }
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
                job_type: 'PLAN',
                model_id: 'model-1',
                projectId: 'proj-1',
                sessionId: 'sess-1',
                stageSlug: 'test-stage',
                iterationNumber: 1,
                walletId: 'wallet-1',
                continueUntilComplete: false,
                maxRetries: 3,
                continuation_count: 0,
                user_jwt: 'parent-jwt-default',
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
            target_contribution_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };

        mockRecipeStep = {
            id: 'step-uuid-123',
            instance_id: 'instance-uuid-456',
            template_step_id: 'template-step-uuid-789',
            step_key: 'test_step_1',
            step_slug: 'test-step-1',
            step_name: 'Test Step',
            step_description: 'A test step description',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: 'test-prompt-uuid',
            output_type: FileType.business_case,
            granularity_strategy: 'per_source_document',
            inputs_required: [{ type: 'document', slug: 'any' }],
            inputs_relevance: [],
            outputs_required: { documents: [] },
            config_override: {},
            object_filter: {},
            output_overrides: {},
            is_skipped: false,
            execution_order: 1,
            parallel_group: null,
            branch_key: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const mockRagDeps: IRagServiceDependencies = {
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
            logger: mockLogger,
            indexingService: { indexDocument: () => Promise.resolve({ success: true, tokensUsed: 0 }) },
            embeddingClient: { getEmbedding: () => Promise.resolve({ embedding: [], usage: { input_tokens: 0, output_tokens: 0, prompt_tokens: 0, total_tokens: 0 } }) },
        };


        mockDeps = {
            logger: mockLogger,
            planComplexStage: () => Promise.resolve([]),
            downloadFromStorage: (bucket, path) => {
                const allDocs: (DialecticContributionRow | DialecticProjectResourceRow)[] = [...mockContributions, ...mockProjectResources];
                const doc = allDocs.find(c => `${c.storage_path}/${c.file_name}` === path);
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
            documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.RenderedDocument, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
        };
    });
    
    it('should throw an error if no planner is found for the strategy', async () => {
        // This test relies on the default mock for getGranularityPlanner returning undefined.
        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123'),
            Error,
            `No planner found for granularity strategy: ${mockRecipeStep.granularity_strategy}`,
        );
    });

    it('should throw if granularity_strategy is missing from the recipe step', async () => {
        // Arrange: This test proves that the function correctly validates the recipe step.
        const incompleteRecipeStep = { ...mockRecipeStep };
        delete incompleteRecipeStep.granularity_strategy;

        // Act & Assert
        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                incompleteRecipeStep as DialecticRecipeStep,
                'user-jwt-123'
            ),
            Error,
            'recipeStep.granularity_strategy is required'
        );
    });

    it('should throw if inputs_required is missing from the recipe step', async () => {
        const incompleteRecipeStep = { ...mockRecipeStep };
        delete incompleteRecipeStep.inputs_required;

        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                incompleteRecipeStep as DialecticRecipeStep,
                'user-jwt-123'
            ),
            Error,
            'recipeStep.inputs_required is required and cannot be empty'
        );
    });

    it('should throw if inputs_required is an empty array', async () => {
        const incompleteRecipeStep = {
            ...mockRecipeStep,
            inputs_required: [],
        };

        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                incompleteRecipeStep as DialecticRecipeStep,
                'user-jwt-123'
            ),
            Error,
            'recipeStep.inputs_required is required and cannot be empty'
        );
    });

    it('should correctly create child jobs for an "execute" planner creating an intermediate artifact', async () => {
        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.PairwiseSynthesisChunk,
            inputs: { documentId: 'doc-1-thesis' },
            isIntermediate: true,
            model_id: 'model-1',
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: mockParentJob.payload.stageSlug,
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: {
                contributionType: 'pairwise_synthesis_chunk',
                sourceModelSlugs: ['Test Model'],
                sourceAnchorType: 'thesis',
                sourceAnchorModelSlug: 'Test Model',
                stageSlug: 'test-stage',
            },
        };
        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload];
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123'
        );

        assertEquals(childJobs.length, 1);
        const childJob = childJobs[0];
        assertEquals(childJob.parent_job_id, mockParentJob.id);
        
        assert(isDialecticExecuteJobPayload(childJob.payload));
        const payload = childJob.payload;

        assertEquals(payload.job_type, 'execute');
        assertEquals(payload.output_type, 'pairwise_synthesis_chunk');
        assertEquals(payload.isIntermediate, true);
        assertEquals(Object.hasOwn(payload, 'step_info'), false);
        
        // Assert the full canonical path params are passed through correctly
        assertExists(payload.canonicalPathParams);
        const params = payload.canonicalPathParams;
        assertEquals(params.contributionType, 'pairwise_synthesis_chunk');
        assertEquals(params.sourceModelSlugs, ['Test Model']);
        assertEquals(params.sourceAnchorType, 'thesis');
        assertEquals(params.sourceAnchorModelSlug, 'Test Model');
    });

    it('should throw an error if fetching source contributions fails', async () => {
        mockRecipeStep.inputs_required = [{ type: 'document', slug: 'thesis' }];
        
        // This test now targets project_resources because the input type is 'document'
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => {
                        return Promise.resolve({ data: null, error: new Error('DB Read Error'), count: 0, status: 500, statusText: 'Internal Server Error' });
                    },
                },
            },
        });

        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123'),
            Error,
            "Failed to fetch source documents for type 'document' from project_resources: DB Read Error",
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
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123'),
            Error,
            'Failed to download content for contribution resource-1 from projects/proj-1/resources/sess-1_test-stage_business_case_v1.md: Storage Download Error',
        );
    });
    
    it('should throw when a contribution is missing a file_name', async () => {
        const localMockResources = [
            ...mockProjectResources,
            { ...mockProjectResources[0], id: 'resource-2', file_name: null },
        ];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => {
                        return Promise.resolve({ data: localMockResources, error: null, count: localMockResources.length, status: 200, statusText: 'OK' });
                    },
                },
            },
        });
        
        const plannerFn: GranularityPlannerFn = () => [];
        mockDeps.getGranularityPlanner = () => plannerFn;
        
        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123'),
            Error,
            "Contribution resource-2 is missing required storage information (file_name, storage_bucket, or storage_path)."
        );
    });

    it('should not call the planner if no source documents are found', async () => {
        mockRecipeStep.inputs_required = [{ type: 'document', slug: 'non_existent_type' }];
        
        const plannerFn: GranularityPlannerFn = () => {
            throw new Error('Planner should not have been called');
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123'),
            Error,
            "A required input of type 'document' was not found for the current job."
        );
    });

    it('should return an empty array if the planner returns no payloads', async () => {
        const plannerFn: GranularityPlannerFn = () => [];
        mockDeps.getGranularityPlanner = () => plannerFn;
        
        const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');

        assertEquals(childJobs.length, 0);
    });

    it('should throw when a contribution is missing storage_bucket or storage_path', async () => {
        const localMockResources = [
            ...mockProjectResources,
            { ...mockProjectResources[0], id: 'resource-2', storage_bucket: null },
            { ...mockProjectResources[0], id: 'resource-3', storage_path: null },
        ];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => {
                        return Promise.resolve({ data: localMockResources, error: null, count: localMockResources.length, status: 200, statusText: 'OK' });
                    },
                },
            },
        });
        
        const plannerFn: GranularityPlannerFn = () => [];
        mockDeps.getGranularityPlanner = () => plannerFn;
        
        await assertRejects(
            () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123'),
            Error,
            "Contribution resource-2 is missing required storage information (file_name, storage_bucket, or storage_path)."
        );
    });

    it('should handle downloaded files that are empty', async () => {
        mockDeps.downloadFromStorage = () => Promise.resolve({ data: new ArrayBuffer(0), error: null });
        mockRecipeStep.inputs_required = [{ type: 'document', slug: 'any', document_key: FileType.business_case }];

        const mockConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                'dialectic_project_resources': {
                    select: (state: MockQueryBuilderState) => {
                        let data = [...mockProjectResources];
                        const idFilter = state.filters.find(f => f.column === 'id');
                        if (idFilter) {
                            data = data.filter((r: any) => r.id === idFilter.value);
                        }
                        return Promise.resolve({ data, error: null, count: data.length, status: 200, statusText: 'OK' });
                    },
                },
            },
        };
        mockSupabase = createMockSupabaseClient('user-123', mockConfig);

        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');

        assertEquals(receivedDocs.length, 1);
        assertEquals(receivedDocs[0].content, '');
    });

    it('should gracefully skip malformed payloads from the planner', async () => {
        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.HeaderContext,
            inputs: { documentId: 'doc-1-thesis' },
            isIntermediate: true, // ADDED FOR TEST
            model_id: 'model-1',
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: mockParentJob.payload.stageSlug,
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
        };
        const malformedPayload = { an_invalid: 'payload' };

        // We are explicitly violating the type here for testing purposes
        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload, malformedPayload as any];
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');

        assertEquals(childJobs.length, 1);
        assert(isDialecticExecuteJobPayload(childJobs[0].payload));
    });

    it('should query by stage_slug when present in the rule', async () => {
        mockRecipeStep.inputs_required = [{ type: 'document', slug: 'test-stage-resource' }];

        const localResource = {
            ...mockProjectResources[0],
            id: 'staged-resource',
            stage_slug: 'test-stage-resource'
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const stageFilter = state.filters.find(f => f.column === 'stage_slug' && f.value === 'test-stage-resource');
                        if (stageFilter) {
                            return Promise.resolve({ data: [localResource], error: null, count: 1, status: 200, statusText: 'OK' });
                        }
                        return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                    },
                },
            },
        });
        
        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');

        assertEquals(receivedDocs.length, 1);
        assertEquals(receivedDocs[0].contribution_type, 'rendered_document');
        assertEquals(receivedDocs[0].id, 'staged-resource');
    });

    it('should query by type when stage_slug is not present in the rule', async () => {
        mockRecipeStep.inputs_required = [{ type: 'document', slug: 'any' }];
        
        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');

        assertEquals(receivedDocs.length, 1);
        assertEquals(receivedDocs[0].contribution_type, 'rendered_document');
    });

    it('should bypass RAG and pass all documents to the planner even when token count exceeds limit', async () => {
        // Arrange: Spy on the RAG service to ensure it's not called.
        const getContextForModelSpy = spy(mockDeps.ragService!, 'getContextForModel');
    
        // Arrange: Force a high token count that would have previously triggered RAG.
        mockDeps.countTokens = () => 9999; // Exceeds the mock limit of 8192
    
        // Arrange: Set up a planner that captures the documents it receives.
        let receivedDocs: SourceDocument[] | undefined;
        const plannerFn: GranularityPlannerFn = (sourceDocs, _parentJob, _recipeStep, _authToken) => {
            receivedDocs = sourceDocs;
            // Return a simple payload to confirm the workflow completes.
            return [{
                job_type: 'execute',
                prompt_template_id: 'test-prompt',
                output_type: FileType.business_case,
                inputs: { documentIds: sourceDocs.map(d => d.id) },
                model_id: 'model-1',
                projectId: mockParentJob.payload.projectId,
                sessionId: mockParentJob.payload.sessionId,
                stageSlug: mockParentJob.payload.stageSlug,
                iterationNumber: mockParentJob.payload.iterationNumber,
                walletId: mockParentJob.payload.walletId,
                continueUntilComplete: false,
                maxRetries: 3,
                continuation_count: 0,
                canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
            }];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;
    
        // Act: Run the function.
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123'
        );
    
        // Assert: The RAG service was NOT called.
        assertEquals(getContextForModelSpy.calls.length, 0, 'RAG service should not have been called.');
    
        // Assert: The planner was called and received ALL source documents.
        assertExists(receivedDocs, 'Planner function was not called.');
        assertEquals(receivedDocs.length, 1, 'Planner should have received 1 source document.');
    
        // Assert: A child job was created correctly without RAG intervention.
        assertEquals(childJobs.length, 1);
        const childPayload = childJobs[0].payload;
        assert(isDialecticExecuteJobPayload(childPayload));
        assertEquals(childPayload.inputs, { documentIds: ['resource-1'] });
        assertEquals(Object.hasOwn(childPayload, 'step_info'), false);
    });

    it('should correctly find and use a specific document when document_key is provided', async () => {
        mockRecipeStep.inputs_required = [{ type: 'document', slug: 'any', document_key: FileType.business_case }];
        
        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');

        assertEquals(receivedDocs.length, 1);
        assertEquals(receivedDocs[0].id, 'resource-1');
    });

    describe('findSourceDocuments data source routing', () => {
        it('should find a required resource from dialectic_project_resources', async () => {
            // Arrange: The recipe requires a document that only exists as a project resource.
            mockRecipeStep.inputs_required = [{ type: 'document', slug: 'any', document_key: FileType.business_case }];
            
            // Mock the DB to return the resource from the correct table, but nothing from contributions.
            mockSupabase = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_contributions: {
                        select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
                    },
                    dialectic_project_resources: {
                        select: () => Promise.resolve({ data: mockProjectResources, error: null, count: 1, status: 200, statusText: 'OK' }),
                    },
                },
            });
    
            let receivedDocs: SourceDocument[] = [];
            const plannerFn: GranularityPlannerFn = (sourceDocs) => {
                receivedDocs = sourceDocs;
                return [];
            };
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act
            await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123'
            );
    
            // Assert: The function should find the document in `dialectic_project_resources`.
            assertEquals(receivedDocs.length, 1);
            assertEquals(receivedDocs[0].id, 'resource-1');
        });
    
        it('should find feedback from dialectic_feedback', async () => {
            // Arrange: The recipe requires feedback.
            mockRecipeStep.inputs_required = [{ type: 'feedback', slug: 'any' }];
            
            // Mock the DB so feedback exists in its own table.
            mockSupabase = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    dialectic_contributions: {
                        select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
                    },
                    dialectic_feedback: {
                        select: () => Promise.resolve({ data: mockFeedback, error: null, count: 1, status: 200, statusText: 'OK' }),
                    },
                },
            });
    
            let receivedDocs: SourceDocument[] = [];
            const plannerFn: GranularityPlannerFn = (sourceDocs) => {
                receivedDocs = sourceDocs;
                return [];
            };
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act
            await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123'
            );
    
            // Assert: The function should find the feedback document.
            assertEquals(receivedDocs.length, 1);
            assertEquals(receivedDocs[0].id, 'feedback-1');
        });

        it('should only query project_resources for type "document"', async () => {
            // Arrange: The recipe asks for 'document' type.
            mockRecipeStep.inputs_required = [{ type: 'document', slug: 'any' }];
            
            mockSupabase = createMockSupabaseClient(undefined, {
                genericMockResults: {
                    // Contributions should NOT be returned for a 'document' query.
                    dialectic_contributions: {
                        select: () => Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
                    },
                    dialectic_project_resources: {
                        select: () => Promise.resolve({ data: mockProjectResources, error: null, count: 1, status: 200, statusText: 'OK' }),
                    },
                },
            });

            let receivedDocs: SourceDocument[] = [];
            const plannerFn: GranularityPlannerFn = (sourceDocs) => {
                receivedDocs = sourceDocs;
                return [];
            };
            mockDeps.getGranularityPlanner = () => plannerFn;

            // Act
            await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123'
            );

            // Assert: Only the document from project_resources should be returned.
            assertEquals(receivedDocs.length, 1);
            assertEquals(receivedDocs[0].id, 'resource-1');
            assertEquals(receivedDocs[0].contribution_type, 'rendered_document');
        });
    });

    it('should throw when recipe step uses deprecated prompt_template_name', async () => {
        // Arrange: This test ensures the function enforces the modern data contract by
        // rejecting recipe steps that use the deprecated `prompt_template_name`.
        const deprecatedRecipeStep: any = {
            ...mockRecipeStep,
            prompt_template_name: 'old-deprecated-name',
        };
        delete deprecatedRecipeStep.prompt_template_id;

        const plannerFn: GranularityPlannerFn = () => [];
        mockDeps.getGranularityPlanner = () => plannerFn;

        // Act & Assert
        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                deprecatedRecipeStep as DialecticRecipeStep, // Cast back for the function call
                'user-jwt-123'
            ),
            Error,
            'recipeStep.prompt_template_id is required'
        );
    });

    it('should throw when recipe step uses deprecated step property', async () => {
        // Arrange: This test proves that the function rejects recipe steps that
        // use the outdated `step` property, enforcing the modern contract.
        const deprecatedRecipeStep: any = {
            ...mockRecipeStep,
            step: 1, // The deprecated property
        };
        // The new properties that should be used are not present.
        delete deprecatedRecipeStep.step_name;
        delete deprecatedRecipeStep.step_key;

        // The function is expected to validate the incoming recipe step and throw a
        // specific error when it encounters the deprecated property.
        const plannerFn: GranularityPlannerFn = () => [];
        mockDeps.getGranularityPlanner = () => plannerFn;

        // Act & Assert
        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                deprecatedRecipeStep as DialecticRecipeStep,
                'user-jwt-123'
            ),
            Error,
            'recipeStep.step is a deprecated property. Please use step_key or step_name.'
        );
    });

    it('should find and pass HeaderContext when required by recipe', async () => {
        // Arrange: The test is configured to require `header_context` as an input.
        mockRecipeStep.inputs_required = [
            { type: 'document', slug: 'any' },
            { type: 'header_context', slug: 'any' },
        ];

        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        // Act: The function is called with the recipe requiring the header.
        await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123'
        );

        // Assert: The planner should receive all documents, including the header context.
        assertEquals(receivedDocs.length, 2, 'Should have received the project resource and the header');
        const headerContextDoc = receivedDocs.find(doc => doc.contribution_type === 'header_context');
        assertExists(headerContextDoc, 'HeaderContext document was not found');
        assertEquals(headerContextDoc.id, 'header-context-1');
    });

    it('should proceed without HeaderContext if not required by recipe', async () => {
        // Arrange: The test is configured to only require standard documents.
        mockRecipeStep.inputs_required = [
            { type: 'document', slug: 'any' },
        ];

        let receivedDocs: SourceDocument[] = [];
        const plannerFn: GranularityPlannerFn = (sourceDocs) => {
            receivedDocs = sourceDocs;
            return [];
        };
        mockDeps.getGranularityPlanner = () => plannerFn;

        // Act: The function is called with the recipe NOT requiring the header.
        await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123'
        );

        // Assert: The planner should only receive the documents, excluding the header context.
        assertEquals(receivedDocs.length, 1, 'Should have received only the one project resource');
        const headerContextDoc = receivedDocs.find(doc => doc.contribution_type === 'header_context');
        assertEquals(headerContextDoc, undefined, 'HeaderContext should not have been included');
    });

    it('should throw if HeaderContext is required but not found', async () => {
        // Arrange: The recipe is configured to require a `header_context`.
        mockRecipeStep.inputs_required = [
            { type: 'document', slug: 'any' },
            { type: 'header_context', slug: 'any' },
        ];

        // Arrange: The database mock is configured to find no `header_context` documents.
        if (mockSupabase.genericMockResults?.dialectic_contributions) {
            mockSupabase.genericMockResults.dialectic_contributions.select = (state: MockQueryBuilderState) => {
                const typeFilter = state.filters.find(f => f.column === 'contribution_type')?.value;
                if (typeFilter === 'header_context') {
                    // The mock will return no documents for this specific type.
                    return Promise.resolve({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
                }
                // For other types, it returns the standard set of mock documents.
                const filteredData = mockContributions.filter(c => c.contribution_type !== 'header_context');
                return Promise.resolve({ data: filteredData, error: null, count: filteredData.length, status: 200, statusText: 'OK' });
            };
        }
    
        // Act & Assert: The function must throw a specific error when a required
        // input document is missing, preventing silent failures.
        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123'
            ),
            Error,
            "A required input of type 'header_context' was not found for the current job."
        );
    });

    it('should correctly inherit user_jwt from parent payload into child job payloads', async () => {
        // 1. Arrange: Define a mock JWT for the test context.
        const MOCK_AUTH_TOKEN = 'mock-user-jwt-for-test';

        // 2. Arrange: Define a simple planner that returns a valid payload.
        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.HeaderContext,
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: mockParentJob.payload.stageSlug,
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
        };
        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload];
        mockDeps.getGranularityPlanner = () => plannerFn;

        // 3. Act: Call the function under test.
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            MOCK_AUTH_TOKEN
        );

        // 4. Assert: Verify that the created child job's payload correctly contains the JWT from the parent's payload.
        assertEquals(childJobs.length, 1);
        const childPayload = childJobs[0].payload;
        assert(isDialecticExecuteJobPayload(childPayload), 'Payload should be a valid execute job payload');
        assertEquals(childPayload.user_jwt, 'parent-jwt-default', "The user_jwt was not correctly inherited from the parent payload.");
        assertEquals(Object.hasOwn(childPayload, 'step_info'), false);
    });

    // =============================================================
    // user_jwt must be inherited from parent payload (not param)
    // =============================================================
    it('planComplexStage should construct child payload with user_jwt inherited from parent payload (ignoring authToken param)', async () => {
        // Arrange: Define two distinct JWTs to prove which one is used.
        const PARENT_JWT = 'parent-payload-jwt';
        const PARAM_JWT = 'param-auth-jwt-should-be-ignored';

        // Inject the primary JWT into the parent job's payload.
        Object.defineProperty(mockParentJob.payload, 'user_jwt', { value: PARENT_JWT, configurable: true, enumerable: true, writable: true });

        const mockExecutePayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.HeaderContext,
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: mockParentJob.payload.stageSlug,
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
        };
        const plannerFn: GranularityPlannerFn = () => [mockExecutePayload];
        mockDeps.getGranularityPlanner = () => plannerFn;

        // Act: Call the function with the secondary, ignored JWT.
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            PARAM_JWT
        );

        // Assert: The child job must inherit the JWT from the parent payload, not the one passed as a parameter.
        assertEquals(childJobs.length, 1);
        const payload = childJobs[0].payload;
        assert(isDialecticExecuteJobPayload(payload));
        assertEquals(payload.user_jwt, PARENT_JWT);
        assertEquals(Object.hasOwn(payload, 'step_info'), false);
    });

    // =============================================================
    // hard-fail when parent payload.user_jwt is missing/empty
    // =============================================================
    it('planComplexStage should throw when parent payload.user_jwt is missing', async () => {
        // Ensure parent payload has no user_jwt at all
        // If it exists from prior tests, remove it without casting
        if (Object.prototype.hasOwnProperty.call(mockParentJob.payload, 'user_jwt')) {
            // Redefine to undefined and then delete to simulate truly missing
            Object.defineProperty(mockParentJob.payload, 'user_jwt', { value: undefined, configurable: true, enumerable: true, writable: true });
            // Delete property so it is absent
            // deno-lint-ignore no-explicit-any
            delete (mockParentJob.payload as any).user_jwt; // delete is the only way; the delete needs any to satisfy TS here in test
        }

        const plannerFn: GranularityPlannerFn = () => [{
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.HeaderContext,
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: mockParentJob.payload.stageSlug,
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
        }];
        mockDeps.getGranularityPlanner = () => plannerFn;

        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'param-jwt-irrelevant'
            ),
            Error,
            'parent payload.user_jwt is required'
        );
    });

    it('planComplexStage should throw when parent payload.user_jwt is empty', async () => {
        // Inject empty user_jwt without casting
        Object.defineProperty(mockParentJob.payload, 'user_jwt', { value: '', configurable: true, enumerable: true, writable: true });

        const plannerFn: GranularityPlannerFn = () => [{
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.HeaderContext,
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: mockParentJob.payload.stageSlug,
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
        }];
        mockDeps.getGranularityPlanner = () => plannerFn;

        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'param-jwt-irrelevant'
            ),
            Error,
            'parent payload.user_jwt is required'
        );
    });

    // =============================================================
    // dynamic stage slug identification  
    // =============================================================
    it('constructs execute child rows with consistent dynamic stage markers (row.stage_slug === payload.stageSlug)', async () => {
        const plannerFn: GranularityPlannerFn = () => [{
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.HeaderContext,
            inputs: { documentId: 'doc-1-thesis' },
            model_id: mockParentJob.payload.model_id,
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: mockParentJob.payload.stageSlug,
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
        }];
        mockDeps.getGranularityPlanner = () => plannerFn;

        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123'
        );

        assertEquals(childJobs.length, 1);
        const child = childJobs[0];
        assert(isDialecticExecuteJobPayload(child.payload));

        const expectedStage = mockParentJob.payload.stageSlug;
        assertEquals(child.stage_slug, expectedStage);
        assertEquals(child.payload.stageSlug, expectedStage);
        assertEquals(Object.hasOwn(child.payload, 'step_info'), false);
    });

    it('throws when parent payload.stageSlug is missing (no healing, no defaults)', async () => {
        // Remove stageSlug from parent payload without casting
        if (Object.prototype.hasOwnProperty.call(mockParentJob.payload, 'stageSlug')) {
            // deno-lint-ignore no-explicit-any
            delete (mockParentJob.payload as any).stageSlug;
        }

        const plannerFn: GranularityPlannerFn = () => [{
            job_type: 'execute',
            prompt_template_id: 'test-prompt',
            output_type: FileType.HeaderContext,
            inputs: { documentId: 'doc-1-thesis' },
            model_id: 'model-1',
            projectId: mockParentJob.payload.projectId,
            sessionId: mockParentJob.payload.sessionId,
            stageSlug: 'should-not-be-used-when-parent-missing',
            iterationNumber: mockParentJob.payload.iterationNumber,
            walletId: mockParentJob.payload.walletId,
            continueUntilComplete: false,
            maxRetries: 3,
            continuation_count: 0,
            canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'test-stage' },
        }];
        mockDeps.getGranularityPlanner = () => plannerFn;

        await assertRejects(
            () => planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123'
            ),
            Error,
            'parent payload.stageSlug is required'
        );
    });
});