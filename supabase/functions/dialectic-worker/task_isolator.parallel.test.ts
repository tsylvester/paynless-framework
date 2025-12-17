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
    DialecticStageRecipeStep,
} from '../dialectic-service/dialectic.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { planComplexStage } from './task_isolator.ts';
import {
    isDialecticPlanJobPayload,
    isDialecticExecuteJobPayload,
} from '../_shared/utils/type_guards.ts';
import { isDialecticStageRecipeStep } from '../_shared/utils/type-guards/type_guards.dialectic.recipe.ts';
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
    let mockRecipeStep: DialecticStageRecipeStep;
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
                file_name: 'sess-1_thesis_business_case_v1.md',
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
                file_name: 'sess-1_antithesis_business_case_critique_v1.md',
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
                file_name: 'sess-1_test-stage_header_context.json',
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
            file_name: 'sess-1_thesis_business_case_branchA.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 456,
            resource_description: { "description": "A test resource file", "type": "document", "document_key": FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'thesis',
        }, {
            id: 'resource-business-case-any',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_any_business_case.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 456,
            resource_description: { "description": "Business case document for any stage", "type": "document", "document_key": FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
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
            file_name: 'sess-1_thesis_business_case_feedback.txt',
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
            inputs_required: [{ type: 'document', document_key: FileType.business_case, slug: 'any' }],
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
    
    describe('Group 1: Handling of Step Properties', () => {
        it('should throw an error if called with a step that is marked as is_skipped', async () => {
            // Purpose: Proves that the function rejects work that the orchestrator (processComplexJob)
            // should have filtered out. This enforces the separation of concerns, as skipping steps
            // is an orchestration decision, not a planning decision.
    
            // Arrange:
            // 1. Create a mock recipe step based on mockRecipeStep.
            // 2. Set the 'is_skipped' property to true.
            const skippedStep: DialecticRecipeStep = {
                ...mockRecipeStep,
                is_skipped: true,
            };
    
            // Act & Assert:
            // 1. Use assertRejects to call planComplexStage with the skipped step.
            // 2. Assert that it throws an error. The current implementation lacks this check,
            //    so this test is expected to fail, highlighting the missing validation.
            await assertRejects(
                () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, skippedStep, 'user-jwt-123'),
                Error,
                'planComplexStage cannot process this type of recipe step. This indicates an orchestration logic error.'
            );
        });
    
        it('should correctly process a step that includes a parallel_group identifier', async () => {
            // Purpose: A sanity check to ensure that the presence of parallel-flow metadata on a step
            // object does not cause errors. The function should process the step's inputs and planner normally.
    
            // Arrange:
            // 1. Create a mock recipe step and set 'parallel_group' to an integer.
            const parallelStep: DialecticRecipeStep = { ...mockRecipeStep, parallel_group: 1 };
            // 2. Set up a spy on a mock granularity planner function.
            const plannerFn = spy((_docs: SourceDocument[], _job: DialecticJobRow, _step: DialecticRecipeStep, _token: string) => []);
            // 3. Ensure getGranularityPlanner returns the mock planner.
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act:
            // 1. Call planComplexStage with the parallel step.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, parallelStep, 'user-jwt-123');
    
            // Assert:
            // 1. Verify the planner spy was called, confirming the function proceeded normally.
            assertEquals(plannerFn.calls.length, 1);
        });
    
        it('should correctly process a step that includes a branch_key', async () => {
            // Purpose: Verifies that a step with a branch key (e.g., 'business_case_branch') is
            // handled correctly. The branch_key itself is primarily for the planner's use, so this
            // test ensures the step object is passed through without issues.
    
            // Arrange:
            // 1. Create a mock recipe step and set 'branch_key' to a string.
            const branchedStep: DialecticRecipeStep = { ...mockRecipeStep, branch_key: 'feature_spec_branch' };
            // 2. Set up a spy on a mock granularity planner function.
            const plannerFn = spy((_docs: SourceDocument[], _job: DialecticJobRow, _step: DialecticRecipeStep, _token: string) => []);
            // 3. Ensure getGranularityPlanner returns the mock planner.
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act:
            // 1. Call planComplexStage with the step containing the branch_key.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, branchedStep, 'user-jwt-123');
    
            // Assert:
            // 1. Verify the planner spy was called.
            assertEquals(plannerFn.calls.length, 1);
            // 2. Assert that the 'recipeStep' argument passed to the planner contains the correct 'branch_key'.
            const receivedStep = plannerFn.calls[0].args[2];
            assertExists(receivedStep);
            assertEquals(receivedStep.branch_key, 'feature_spec_branch');
        });
    
        it('should pass the config_override from a cloned step to the granularity planner', async () => {
            // Purpose: This is a critical test. It must spy on the getGranularityPlanner's returned function
            // and assert that the recipeStep object it receives contains the exact config_override JSON. This
            // proves that user-defined modifications from a cloned recipe are correctly passed down to the
            // logic that generates the final EXECUTE jobs.
    
            // Arrange:
            // 1. Define a mock 'config_override' JSON object.
            const override = { "model": "gpt-4-turbo", "temperature": 0.8 };
            // 2. Create a mock recipe step and set its 'config_override' property.
            const overriddenStep: DialecticRecipeStep = { ...mockRecipeStep, config_override: override };
            // 3. Create a spy for the planner function.
            const plannerFn = spy((_docs: SourceDocument[], _job: DialecticJobRow, _step: DialecticRecipeStep, _token: string) => []);
            // 4. Mock getGranularityPlanner to return the spy.
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act:
            // 1. Call planComplexStage with the overridden step.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, overriddenStep, 'user-jwt-123');
    
            // Assert:
            // 1. Verify the planner spy was called exactly once.
            assertEquals(plannerFn.calls.length, 1);
            // 2. Inspect the recipeStep argument passed to the planner and assert it contains the override.
            const receivedStep = plannerFn.calls[0].args[2];
            assert(isDialecticStageRecipeStep(receivedStep), 'Step passed to planner should be a DialecticStageRecipeStep');
            assertExists(receivedStep);
            assertEquals(receivedStep.config_override, override);
        });
    });
    
    describe('Group 2: Source Document Fetching Logic', () => {
        it('should fetch only the specific document required by a parallel branch using a document_key rule', async () => {
            // Purpose: Simulates a fork in the recipe graph. This test ensures that when planning for a step
            // in one branch, it correctly fetches only the input designated for that branch
            // via a specific document_key in its inputs_required rule.
    
            // Arrange:
            // 1. Seed project resources with two rendered documents that both match the column predicates.
            const branchAResource: DialecticProjectResourceRow = {
                ...mockProjectResources[0],
                id: 'resource-A',
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                stage_slug: 'thesis',
                file_name: 'sess-1_thesis_business_case_branchA.md',
                resource_description: {
                    description: 'Branch A resource',
                    type: 'rendered_document',
                    document_key: FileType.business_case,
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const targetResource: DialecticProjectResourceRow = {
                ...branchAResource,
                id: 'resource-B',
                file_name: 'sess-1_thesis_business_case_branchB.md',
                resource_description: {
                    description: 'Branch B resource',
                    type: 'rendered_document',
                    document_key: FileType.business_case,
                },
                created_at: new Date(Date.now() + 10).toISOString(),
                updated_at: new Date(Date.now() + 10).toISOString(),
            };
            mockProjectResources = [branchAResource, targetResource];
            // 2. The recipe will explicitly ask for only this new resource.
            mockRecipeStep.inputs_required = [{ type: 'document', document_key: FileType.business_case, slug: 'any' }];
            // 3. Set up a planner spy to capture the source documents it receives.
            let receivedDocs: SourceDocument[] = [];
            const plannerFn: GranularityPlannerFn = (sourceDocs) => {
                receivedDocs = sourceDocs;
                return [];
            };
            mockDeps.getGranularityPlanner = () => plannerFn;
            
            // Act:
            // 1. Call planComplexStage.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');
    
            // Assert:
            // 1. The planner should have received exactly one document.
            assertEquals(receivedDocs.length, 1);
            // 2. The received document must be the one specified in the rule.
            assertEquals(receivedDocs[0].id, 'resource-B');
        });
    
        it('should fetch only the documents from a specific contribution_type', async () => {
            // Purpose: Validates filtering where a step requires all outputs of a certain type,
            // regardless of which stage they came from (e.g., all 'thesis' documents).
    
            // Arrange:
            // 1. Add a resource for 'thesis' stage with business_case document_key.
            const thesisResource: DialecticProjectResourceRow = {
                id: 'resource-thesis-business-case',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'sess-1_thesis_business_case.md',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 456,
                resource_description: { "description": "Thesis business case document", "type": "document", "document_key": FileType.business_case },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'thesis',
            };
            mockProjectResources = [thesisResource];
            // 2. The recipe will ask for only 'thesis' documents.
            mockRecipeStep.inputs_required = [{ type: 'document', slug: 'thesis', document_key: FileType.business_case }];
            // 3. Set up a planner spy to capture the source documents.
            let receivedDocs: SourceDocument[] = [];
            const plannerFn: GranularityPlannerFn = (sourceDocs) => {
                receivedDocs = sourceDocs;
                return [];
            };
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act:
            // 1. Call planComplexStage.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');
    
            // Assert:
            // 1. The planner should receive only the single 'thesis' document from resources.
            assertEquals(receivedDocs.length, 1);
            assertEquals(receivedDocs[0].contribution_type, 'rendered_document');
            assertEquals(receivedDocs[0].id, 'resource-thesis-business-case');
        });
    
        it('should fetch multiple, distinct documents for a join step', async () => {
            // Purpose: Simulates the convergence of parallel branches. The test proves the function
            // executes all rules in `inputs_required` and returns the complete, combined list of documents.
    
            // Arrange:
            // 1. Create two mock outputs from parallel branches that satisfy the rendered_document column filters.
            const branchA_Output: DialecticProjectResourceRow = {
                ...mockProjectResources[0],
                id: 'doc-2a-output',
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                stage_slug: 'test-stage',
                file_name: 'test-stage_rendered_document_docA.md',
                resource_description: {
                    description: 'Rendered branch A',
                    type: 'rendered_document',
                    document_key: FileType.RenderedDocument,
                },
                created_at: new Date(Date.now() + 20).toISOString(),
                updated_at: new Date(Date.now() + 20).toISOString(),
            };
            const branchB_Output: DialecticProjectResourceRow = {
                ...mockProjectResources[0],
                id: 'doc-2b-output',
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                stage_slug: 'test-stage',
                file_name: 'test-stage_rendered_document_docB.md',
                resource_description: {
                    description: 'Rendered branch B',
                    type: 'rendered_document',
                    document_key: FileType.RenderedDocument,
                },
                created_at: new Date(Date.now() + 30).toISOString(),
                updated_at: new Date(Date.now() + 30).toISOString(),
            };
            mockProjectResources = [branchA_Output, branchB_Output];
            // 2. Create a recipe step that requires both as inputs.
            mockRecipeStep.inputs_required = [
                { type: 'document', document_key: FileType.RenderedDocument, slug: 'any' },
                { type: 'document', document_key: FileType.RenderedDocument, slug: 'any' }
            ];
            // 3. Set up a planner spy to capture the source documents.
            let receivedDocs: SourceDocument[] = [];
            const plannerFn: GranularityPlannerFn = (sourceDocs) => {
                receivedDocs = sourceDocs;
                return [];
            };
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act:
            // 1. Call planComplexStage.
            await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');
            
            // Assert:
            // 1. The planner must receive both documents required by the join step.
            assertEquals(receivedDocs.length, 2);
            assert(receivedDocs.some(d => d.id === 'doc-2a-output'), 'Missing document from branch A');
            assert(receivedDocs.some(d => d.id === 'doc-2b-output'), 'Missing document from branch B');
        });
    
        it('should throw if a required input for a join step is missing', async () => {
            // Purpose: Proves the function correctly enforces the data contract for a join step. If a preceding
            // parallel branch has not yet produced its output, the function must fail loudly.
    
            // Arrange:
            // 1. Seed the database with a single rendered document for the first requirement.
            const existingRenderedDoc: DialecticProjectResourceRow = {
                ...mockProjectResources[0],
                id: 'doc-join-existing',
                file_name: 'test-stage_rendered_document_join.md',
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                stage_slug: null,
                resource_description: { "description": "Existing join document", "type": "document", "document_key": FileType.RenderedDocument },
                created_at: new Date(Date.now() + 40).toISOString(),
                updated_at: new Date(Date.now() + 40).toISOString(),
            };
            mockProjectResources = [existingRenderedDoc];
            // 2. The recipe requires two documents, but only the first exists.
            mockRecipeStep.inputs_required = [
                { type: 'document', document_key: FileType.RenderedDocument, slug: 'any' }, // This one exists
                { type: 'document', document_key: FileType.RenderedDocument, slug: 'any' } // This one does not
            ];
            
            // Act & Assert:
            // 1. The call must be rejected with an error indicating a required input was not found.
            //    Note: The error comes from planComplexStage validation after findSourceDocuments,
            //    not directly from findSourceDocuments itself.
            await assertRejects(
                () => planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123'),
                Error,
                "A required input of type 'document' was not found for the current job."
            );
        });
    });
    
    describe('Group 3: Child Job Creation and Data Integrity', () => {
        it('should create child jobs that correctly inherit core identifiers from the parent PLAN job', async () => {
            // Purpose: Confirms that projectId, sessionId, iterationNumber, and user_jwt from the parent job
            // are correctly propagated to all child EXECUTE jobs, ensuring traceability and context.
    
            // Arrange:
            // 1. The planner returns a minimal payload with the CORRECT context. 
            //    The planner is responsible for including user_jwt from the parent payload.
            const minimalPayload: DialecticExecuteJobPayload = {
                prompt_template_id: 'p1',
                output_type: FileType.business_case,
                inputs: {},
                model_id: 'model-X',
                // These MUST match the parent job to pass validation.
                projectId: mockParentJob.payload.projectId,
                sessionId: mockParentJob.payload.sessionId,
                stageSlug: mockParentJob.payload.stageSlug,
                iterationNumber: mockParentJob.payload.iterationNumber,
                walletId: mockParentJob.payload.walletId,
                user_jwt: mockParentJob.payload.user_jwt,
                canonicalPathParams: { contributionType: 'thesis', stageSlug: 'st1' },
            };
            const plannerFn = () => [minimalPayload];
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act:
            // 1. Call planComplexStage.
            const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');
    
            // Assert:
            // 1. The created job row and its payload must have the correct identifiers from the parent.
            const childJob = childJobs[0];
            assertExists(childJob);
            const childPayload = childJob.payload;
            assert(isDialecticExecuteJobPayload(childPayload));
            
            // Assert row-level properties are inherited
            assertEquals(childJob.session_id, mockParentJob.session_id);
            assertEquals(childJob.user_id, mockParentJob.user_id);
            assertEquals(childJob.iteration_number, mockParentJob.iteration_number);
            
            // Assert payload-level properties are inherited
            assertEquals(childPayload.user_jwt, mockParentJob.payload.user_jwt);
            // This test will fail if the implementation doesn't enforce payload consistency
            assertEquals(childPayload.projectId, mockParentJob.payload.projectId);
            assertEquals(childPayload.sessionId, mockParentJob.payload.sessionId);
            assertEquals(childPayload.iterationNumber, mockParentJob.payload.iterationNumber);
        });
    
        it("should create child jobs whose payloads do NOT contain orchestrator-level context like 'step_info'", async () => {
            // Purpose: A critical negative test to enforce architectural boundaries. It asserts that a
            // malformed payload from a planner (containing extra properties) is rejected entirely,
            // preventing invalid data from entering the job queue.
    
            // Arrange:
            // 1. The planner returns a payload polluted with an extra property.
            //    The context is correct, so it will be rejected for its shape.
            const pollutedPayload = {
                job_type: 'execute',
                prompt_template_id: 'p1',
                output_type: FileType.business_case,
                inputs: {},
                model_id: 'm1',
                projectId: mockParentJob.payload.projectId,
                sessionId: mockParentJob.payload.sessionId,
                stageSlug: mockParentJob.payload.stageSlug,
                iterationNumber: mockParentJob.payload.iterationNumber,
                walletId: mockParentJob.payload.walletId,
                canonicalPathParams: { contributionType: 'synthesis', stageSlug: 'st1' },
                step_info: { some_orchestrator_context: 'foo' }, // Invalid property
            };
            const plannerFn = () => [pollutedPayload as any];
            mockDeps.getGranularityPlanner = () => plannerFn;
    
            // Act:
            // 1. Call planComplexStage.
            const childJobs = await planComplexStage(mockSupabase.client as unknown as SupabaseClient<Database>, mockParentJob, mockDeps, mockRecipeStep, 'user-jwt-123');
    
            // Assert:
            // 1. The function must reject the polluted payload, resulting in zero child jobs.
            //    This proves the "reject, don't sanitize" contract is enforced.
            assertEquals(childJobs.length, 0, "The polluted payload should be rejected, resulting in zero child jobs.");
        });
    });

    describe('Group 4: Column-based lookups for parallel planner flows', () => {
        it('uses column predicates including source_contribution_id when fetching rendered documents', async () => {
            // Arrange:
            // 1. Configure the parent job with a sourceContributionId so rendered document lookups are contribution-backed.
            const contributionId = 'contrib-123';
            mockParentJob.payload.sourceContributionId =
                contributionId;

            // 2. Seed a rendered_document resource that matches the column predicates used by the implementation.
            if (!isDialecticPlanJobPayload(mockParentJob.payload)) {
                throw new Error('mockParentJob.payload must be a valid DialecticPlanJobPayload');
            }
            if (typeof mockParentJob.payload.stageSlug !== 'string') {
                throw new Error('mockParentJob.payload.stageSlug must be defined as a string. Fix the data flow upstream.');
            }
            const renderedResource: DialecticProjectResourceRow = {
                ...mockProjectResources[0],
                id: 'rendered-doc-1',
                project_id: mockParentJob.payload.projectId,
                resource_type: 'rendered_document',
                session_id: mockParentJob.payload.sessionId,
                stage_slug: mockParentJob.payload.stageSlug,
                source_contribution_id: contributionId,
                file_name: 'sess-1_test-stage_technical_approach_v1.md',
                resource_description: {
                    description: 'Rendered technical approach document',
                    type: 'rendered_document',
                    document_key: FileType.technical_approach,
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            mockProjectResources = [renderedResource];

            // 3. Require a document rule scoped to a specific stage and document key so the resource query is exercised.
            mockRecipeStep.inputs_required = [{
                type: 'document',
                slug: 'test-stage',
                document_key: FileType.technical_approach,
            }];

            // 4. Provide a trivial planner so planning completes without creating jobs.
            const plannerFn: GranularityPlannerFn = () => [];
            mockDeps.getGranularityPlanner = () => plannerFn;

            // Act:
            await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123',
            );

            // Assert:
            // Use the Supabase mock spies to verify column-based predicates.
            const eqHistory = mockSupabase.spies.getHistoricQueryBuilderSpies(
                'dialectic_project_resources',
                'eq',
            );
            assertExists(eqHistory);

            const calls = eqHistory.callsArgs;
            const hasFilter = (column: string, value: unknown): boolean =>
                calls.some((args) =>
                    Array.isArray(args) &&
                    typeof args[0] === 'string' &&
                    args[0] === column &&
                    args[1] === value
                );

            assert(
                hasFilter('resource_type', 'rendered_document'),
                'Expected resource_type filter for rendered_document',
            );
            assert(
                hasFilter('project_id', mockParentJob.payload.projectId),
                'Expected project_id filter for rendered_document',
            );
            assert(
                hasFilter('session_id', mockParentJob.payload.sessionId),
                'Expected session_id filter for rendered_document',
            );
            assert(
                hasFilter('stage_slug', 'test-stage'),
                'Expected stage_slug filter for rendered_document',
            );
            assert(
                hasFilter('source_contribution_id', contributionId),
                'Expected source_contribution_id filter for rendered_document',
            );
        });

        it('does not add a non-null source_contribution_id filter when project resources have no linkage', async () => {
            // Arrange:
            // 1. Seed a project_resource row without linkage that matches the column predicates.
            if (!isDialecticPlanJobPayload(mockParentJob.payload)) {
                throw new Error('mockParentJob.payload must be a valid DialecticPlanJobPayload');
            }
            if (typeof mockParentJob.payload.stageSlug !== 'string') {
                throw new Error('mockParentJob.payload.stageSlug must be defined as a string. Fix the data flow upstream.');
            }
            if (typeof mockParentJob.payload.iterationNumber !== 'number') {
                throw new Error('mockParentJob.payload.iterationNumber must be defined as a number. Fix the data flow upstream.');
            }
            const unlinkedResource: DialecticProjectResourceRow = {
                ...mockProjectResources[0],
                id: 'unlinked-project-resource-1',
                project_id: mockParentJob.payload.projectId,
                resource_type: 'project_resource',
                session_id: mockParentJob.payload.sessionId,
                stage_slug: mockParentJob.payload.stageSlug,
                iteration_number: mockParentJob.payload.iterationNumber,
                source_contribution_id: null,
                file_name: 'sess-1_test-stage_general_resource.md',
                resource_description: {
                    description: 'General project resource without linkage',
                    type: 'project_resource',
                    document_key: FileType.GeneralResource,
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            mockProjectResources = [unlinkedResource];

            // 2. Use a project_resource rule; these resources are not contribution-backed in this scenario.
            mockRecipeStep.inputs_required = [{
                type: 'project_resource',
                slug: 'test-stage',
                document_key: FileType.GeneralResource,
            }];

            // 3. Ensure the parent job has no sourceContributionId field at all.
            delete mockParentJob.payload.sourceContributionId;

            const plannerFn: GranularityPlannerFn = () => [];
            mockDeps.getGranularityPlanner = () => plannerFn;

            // Act:
            await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123',
            );

            // Assert:
            const eqHistory = mockSupabase.spies.getHistoricQueryBuilderSpies(
                'dialectic_project_resources',
                'eq',
            );
            assertExists(eqHistory);
            const calls = eqHistory.callsArgs;

            const hasFilter = (column: string, value: unknown): boolean =>
                calls.some((args) =>
                    Array.isArray(args) &&
                    typeof args[0] === 'string' &&
                    args[0] === column &&
                    args[1] === value
                );

            assert(
                hasFilter('resource_type', 'project_resource'),
                'Expected resource_type filter for project_resource',
            );
            assert(
                hasFilter('project_id', mockParentJob.payload.projectId),
                'Expected project_id filter for project_resource',
            );
            assert(
                hasFilter('session_id', mockParentJob.payload.sessionId),
                'Expected session_id filter for project_resource',
            );
            assert(
                hasFilter('stage_slug', 'test-stage'),
                'Expected stage_slug filter for project_resource',
            );
            assert(
                hasFilter('iteration_number', mockParentJob.payload.iterationNumber),
                'Expected iteration_number filter for project_resource',
            );

            const hasNonNullSourceContributionFilter = calls.some((args) =>
                Array.isArray(args) &&
                typeof args[0] === 'string' &&
                args[0] === 'source_contribution_id' &&
                args[1] !== null &&
                args[1] !== undefined
            );

            assert(
                hasNonNullSourceContributionFilter === false,
                'project_resource lookups without linkage must not filter by non-null source_contribution_id',
            );
        });

        it('uses column predicates when fetching seed_prompt resources', async () => {
            // Arrange:
            // 1. Seed a seed_prompt resource that matches the column predicates.
            if (!isDialecticPlanJobPayload(mockParentJob.payload)) {
                throw new Error('mockParentJob.payload must be a valid DialecticPlanJobPayload');
            }
            if (typeof mockParentJob.payload.stageSlug !== 'string') {
                throw new Error('mockParentJob.payload.stageSlug must be defined as a string. Fix the data flow upstream.');
            }
            if (typeof mockParentJob.payload.iterationNumber !== 'number') {
                throw new Error('mockParentJob.payload.iterationNumber must be defined as a number. Fix the data flow upstream.');
            }
            const seedPromptResource: DialecticProjectResourceRow = {
                ...mockProjectResources[0],
                id: 'seed-prompt-1',
                project_id: mockParentJob.payload.projectId,
                resource_type: 'seed_prompt',
                session_id: mockParentJob.payload.sessionId,
                stage_slug: mockParentJob.payload.stageSlug,
                iteration_number: mockParentJob.payload.iterationNumber,
                source_contribution_id: null,
                file_name: 'test-stage_seed_prompt.md',
                resource_description: {
                    description: 'Seed prompt for test stage',
                    type: 'seed_prompt',
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            mockProjectResources = [seedPromptResource];

            // 2. Use a seed_prompt rule so the resource query is exercised.
            mockRecipeStep.inputs_required = [{
                type: 'seed_prompt',
                slug: 'test-stage',
            }];

            // 3. Provide a trivial planner so planning completes without creating jobs.
            const plannerFn: GranularityPlannerFn = () => [];
            mockDeps.getGranularityPlanner = () => plannerFn;

            // Act:
            await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123',
            );

            // Assert:
            // Use the Supabase mock spies to verify column-based predicates.
            const eqHistory = mockSupabase.spies.getHistoricQueryBuilderSpies(
                'dialectic_project_resources',
                'eq',
            );
            assertExists(eqHistory);

            const calls = eqHistory.callsArgs;
            const hasFilter = (column: string, value: unknown): boolean =>
                calls.some((args) =>
                    Array.isArray(args) &&
                    typeof args[0] === 'string' &&
                    args[0] === column &&
                    args[1] === value
                );

            assert(
                hasFilter('resource_type', 'seed_prompt'),
                'Expected resource_type filter for seed_prompt',
            );
            assert(
                hasFilter('project_id', mockParentJob.payload.projectId),
                'Expected project_id filter for seed_prompt',
            );
            assert(
                hasFilter('session_id', mockParentJob.payload.sessionId),
                'Expected session_id filter for seed_prompt',
            );
            assert(
                hasFilter('stage_slug', 'test-stage'),
                'Expected stage_slug filter for seed_prompt',
            );
            assert(
                hasFilter('iteration_number', mockParentJob.payload.iterationNumber),
                'Expected iteration_number filter for seed_prompt',
            );
        });

        it('uses column predicates when fetching header_context contributions', async () => {
            // Arrange:
            // 1. Seed a header_context contribution that matches the column predicates.
            if (!isDialecticPlanJobPayload(mockParentJob.payload)) {
                throw new Error('mockParentJob.payload must be a valid DialecticPlanJobPayload');
            }
            if (typeof mockParentJob.payload.stageSlug !== 'string') {
                throw new Error('mockParentJob.payload.stageSlug must be defined as a string. Fix the data flow upstream.');
            }
            if (typeof mockParentJob.payload.iterationNumber !== 'number') {
                throw new Error('mockParentJob.payload.iterationNumber must be defined as a number. Fix the data flow upstream.');
            }
            const headerContextContribution: DialecticContributionRow = {
                id: 'header-context-1',
                session_id: mockParentJob.payload.sessionId,
                user_id: 'user-123',
                stage: mockParentJob.payload.stageSlug,
                iteration_number: mockParentJob.payload.iterationNumber,
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
                contribution_type: 'header_context',
                file_name: 'sess-1_test-stage_header_context.json',
                storage_bucket: 'test-bucket',
                storage_path: `projects/${mockParentJob.payload.projectId}/sessions/${mockParentJob.payload.sessionId}/iteration_${mockParentJob.payload.iterationNumber}/${mockParentJob.payload.stageSlug}/_work/context`,
                size_bytes: 80,
                mime_type: 'application/json',
                document_relationships: null,
                is_header: true,
                source_prompt_resource_id: null,
            };
            mockContributions = [headerContextContribution];

            // 2. Use a header_context rule so the contribution query is exercised.
            mockRecipeStep.inputs_required = [{
                type: 'header_context',
                slug: 'test-stage',
            }];

            // 3. Provide a trivial planner so planning completes without creating jobs.
            const plannerFn: GranularityPlannerFn = () => [];
            mockDeps.getGranularityPlanner = () => plannerFn;

            // Act:
            await planComplexStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123',
            );

            // Assert:
            // Use the Supabase mock spies to verify column-based predicates.
            const eqHistory = mockSupabase.spies.getHistoricQueryBuilderSpies(
                'dialectic_contributions',
                'eq',
            );
            assertExists(eqHistory);

            const calls = eqHistory.callsArgs;
            const hasFilter = (column: string, value: unknown): boolean =>
                calls.some((args) =>
                    Array.isArray(args) &&
                    typeof args[0] === 'string' &&
                    args[0] === column &&
                    args[1] === value
                );

            assert(
                hasFilter('contribution_type', 'header_context'),
                'Expected contribution_type filter for header_context',
            );
            assert(
                hasFilter('session_id', mockParentJob.payload.sessionId),
                'Expected session_id filter for header_context',
            );
            assert(
                hasFilter('iteration_number', mockParentJob.payload.iterationNumber),
                'Expected iteration_number filter for header_context',
            );
            assert(
                hasFilter('is_latest_edit', true),
                'Expected is_latest_edit filter for header_context',
            );
            assert(
                hasFilter('stage', 'test-stage'),
                'Expected stage filter for header_context',
            );
        });
    });

}); 



