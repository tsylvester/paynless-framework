// supabase/functions/dialectic-worker/task_isolator.test.ts
import {
    describe,
    it,
    beforeEach,
} from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import {
    assertEquals,
    assertRejects,
} from 'jsr:@std/assert@0.225.3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticContributionRow,
    DialecticProjectResourceRow,
    DialecticFeedbackRow,
    InputRule,
} from '../dialectic-service/dialectic.interface.ts';
import { findSourceDocuments } from './findSourceDocuments.ts';
import { 
    createMockSupabaseClient, 
    MockQueryBuilderState 
} from '../_shared/supabase.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';

describe('findSourceDocuments', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockDownloadFromStorage: (bucket: string, path: string) => Promise<{ data: ArrayBuffer | null; error: Error | null; }>;

    beforeEach(() => {
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

        mockDownloadFromStorage = () => {
            return Promise.resolve({
                data: new ArrayBuffer(0),
                error: null,
            });
        };
    });

    it("successfully returns a 'seed_prompt' from dialectic_project_resources without filtering by stage_slug", async () => {
        // Rule has slug so implementation might incorrectly add stage_slug filter.
        // Target: seed_prompt is project-level (file_name always seed_prompt.md, resource_type seed_prompt);
        // query must NOT filter by stage_slug so the single project seed_prompt is always found.
        const rule: InputRule[] = [{ type: 'seed_prompt', slug: 'thesis', document_key: FileType.SeedPrompt, required: true }];
        const mockSeedPromptResource: DialecticProjectResourceRow = {
            id: 'seed-prompt-resource-id',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'seed_prompt.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 123,
            resource_description: { "description": "A test seed prompt", type: 'seed_prompt', document_key: 'seed_prompt' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'seed_prompt',
            session_id: null,
            source_contribution_id: null,
            stage_slug: null,
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('seed_prompt test must not query contributions'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const hasProjectFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'project_id' &&
                                filter.value === mockSeedPromptResource.project_id,
                        );
                        if (!hasProjectFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('seed_prompt queries must scope by project_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing project_id filter',
                            });
                        }

                        const hasResourceTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'resource_type' &&
                                filter.value === 'seed_prompt',
                        );
                        if (!hasResourceTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('seed_prompt queries must filter by resource_type'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing resource_type filter',
                            });
                        }

                        const hasStageSlugFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'stage_slug',
                        );
                        if (hasStageSlugFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('seed_prompt queries must NOT filter by stage_slug'),
                                count: 0,
                                status: 400,
                                statusText: 'stage_slug filter not allowed for seed_prompt',
                            });
                        }

                        const hasJsonPathFilter = state.filters.some((filter) => {
                            if (typeof filter.column === 'string' && filter.column.includes('resource_description->>')) {
                                return true;
                            }
                            if (typeof filter.filters === 'string' && filter.filters.includes('resource_description->>')) {
                                return true;
                            }
                            return false;
                        });

                        if (hasJsonPathFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('seed_prompt queries must not use JSON-path predicates on resource_description'),
                                count: 0,
                                status: 400,
                                statusText: 'JSON-path filter detected',
                            });
                        }

                        return Promise.resolve({
                            data: [mockSeedPromptResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'seed-prompt-resource-id');
        assertEquals(documents[0].file_name, 'seed_prompt.md');
    });

    it("successfully returns a 'header_context' from dialectic_contributions", async () => {
        const rule: InputRule[] = [{ type: 'header_context', slug: 'test-stage' }];
        const mockHeaderContextContribution: DialecticContributionRow = {
            id: 'header-context-contribution-id',
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
            contribution_type: 'header_context',
            file_name: 'model-1_0_header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/test-stage/_work/context',
            size_bytes: 80,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('header_context test must not query project_resources'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const hasSessionFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'session_id' &&
                                filter.value === mockHeaderContextContribution.session_id,
                        );
                        if (!hasSessionFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must scope by session_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing session_id filter',
                            });
                        }

                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number' &&
                                filter.value === mockHeaderContextContribution.iteration_number,
                        );
                        if (!hasIterationFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by iteration_number'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing iteration_number filter',
                            });
                        }

                        const hasLatestEditFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'is_latest_edit' &&
                                filter.value === true,
                        );
                        if (!hasLatestEditFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by is_latest_edit'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing is_latest_edit filter',
                            });
                        }

                        const hasContributionTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'contribution_type' &&
                                filter.value === 'header_context',
                        );
                        if (!hasContributionTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by contribution_type'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing contribution_type filter',
                            });
                        }

                        const expectedStageSlug = rule[0].slug;
                        const hasStageFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'stage' &&
                                filter.value === expectedStageSlug,
                        );
                        if (!hasStageFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by rule.slug'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing stage filter',
                            });
                        }

                        return Promise.resolve({
                            data: [mockHeaderContextContribution],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'header-context-contribution-id');
    });

    it("returns only the header_context matching the parent job's model_id when multiple models exist", async () => {
        // Given: 3 header_context contributions with different model_ids (A, B, C)
        // Given: Parent job has model_id = 'model-A'
        // Expect: findSourceDocuments returns only the header_context with model_id = 'model-A'

        const rule: InputRule[] = [{ type: 'header_context', slug: 'thesis' }];

        const mockHeaderContextModelA: DialecticContributionRow = {
            id: 'header-context-model-A',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'thesis',
            iteration_number: 1,
            model_id: 'model-A',
            model_name: 'Model A',
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
            file_name: 'model-A_0_header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/1_thesis/_work/context',
            size_bytes: 80,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        const mockHeaderContextModelB: DialecticContributionRow = {
            ...mockHeaderContextModelA,
            id: 'header-context-model-B',
            model_id: 'model-B',
            model_name: 'Model B',
            file_name: 'model-B_0_header_context.json',
        };

        const mockHeaderContextModelC: DialecticContributionRow = {
            ...mockHeaderContextModelA,
            id: 'header-context-model-C',
            model_id: 'model-C',
            model_name: 'Model C',
            file_name: 'model-C_0_header_context.json',
        };

        // Set parent job to model-A
        mockParentJob.payload.model_id = 'model-A';

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('header_context test must not query project_resources'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        // Verify standard filters are applied
                        const hasContributionTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'contribution_type' &&
                                filter.value === 'header_context',
                        );
                        if (!hasContributionTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('must filter by contribution_type'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing contribution_type filter',
                            });
                        }

                        // Simulate DB filtering: Filter data based on model_id if present in query
                        const allData = [mockHeaderContextModelB, mockHeaderContextModelC, mockHeaderContextModelA];
                        const modelIdFilter = state.filters.find(
                            (filter) => filter.type === 'eq' && filter.column === 'model_id'
                        );
                        
                        const filteredData = modelIdFilter
                            ? allData.filter(d => d.model_id === modelIdFilter.value)
                            : allData;

                        return Promise.resolve({
                            data: filteredData,
                            error: null,
                            count: filteredData.length,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1, 'Should return exactly 1 header_context');
        assertEquals(documents[0].model_id, 'model-A');
    });

    it("successfully returns a document from resources using the 'slug' property", async () => {
        const rule: InputRule[] = [{ type: 'document', slug: 'thesis' }];
        const mockThesisResource: DialecticProjectResourceRow = {
            id: 'doc-1-thesis',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'doc1.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 123,
            resource_description: { type: 'document', document_key: 'thesis' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'thesis',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [mockThesisResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are found'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
            },
        });
        
        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'doc-1-thesis');
    });
    it('throws error when resource document_key does not match and no matching resource exists', async () => {
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'thesis',
            document_key: FileType.technical_approach,
        }];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are missing'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
            },
        });

        await assertRejects(
            async () => {
                await findSourceDocuments(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    mockParentJob,
                    rule,
                );
            },
            Error,
            'Required rendered document',
            'should throw error when no matching resource exists',
        );
    });

    it('returns a document when document_key is provided without comparing it to a FileType wildcard', async () => {
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'thesis',
            document_key: FileType.technical_approach,
        }];

        const resourceRow: DialecticProjectResourceRow = {
            id: 'resource-technical-approach',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_thesis_technical_approach_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4096,
            resource_description: { type: 'document', document_key: FileType.technical_approach },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'thesis',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [resourceRow],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are found'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'resource-technical-approach');
    });

    // NOTE: These coverage tests reflect the temporary JSON-path filtering. See Contract_Column_Use.md for the column fix plan.
    it('returns the same resource when multiple rules require the same document_key', async () => {
        const rules: InputRule[] = [
            { type: 'document', slug: 'test-stage', document_key: FileType.success_metrics },
            { type: 'document', slug: 'test-stage', document_key: FileType.success_metrics },
        ];

        const projectResource1: DialecticProjectResourceRow = {
            id: 'resource-success-metrics-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_thesis_success_metrics_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 5120,
            resource_description: { type: 'document', document_key: FileType.success_metrics },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        const projectResource2: DialecticProjectResourceRow = {
            id: 'resource-success-metrics-2',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_thesis_success_metrics_v2.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 5121,
            resource_description: { type: 'document', document_key: FileType.success_metrics },
            created_at: new Date(Date.now() + 1000).toISOString(),
            updated_at: new Date(Date.now() + 1000).toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [projectResource1, projectResource2],
                            error: null,
                            count: 2,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are found'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 2);
        const ids = documents.map((doc) => doc.id).sort();
        assertEquals(ids, ['resource-success-metrics-1', 'resource-success-metrics-2']);
    });

    it('returns multiple header_context contributions when multiple rules require them', async () => {
        const rules: InputRule[] = [
            { type: 'header_context', slug: 'test-stage', document_key: FileType.HeaderContext },
            { type: 'header_context', slug: 'test-stage', document_key: FileType.HeaderContext },
        ];

        const contribution1: DialecticContributionRow = {
            id: 'header-context-contribution-1',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'test-stage',
            iteration_number: 1,
            model_id: 'model-3',
            model_name: 'Planner Model',
            prompt_template_id_used: 'prompt-planner',
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 100,
            tokens_used_output: 200,
            processing_time_ms: 180,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'header_context',
            file_name: 'model-3_0_header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/test-stage/_work/context',
            size_bytes: 2048,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        const contribution2: DialecticContributionRow = {
            id: 'header-context-contribution-2',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'test-stage',
            iteration_number: 1,
            model_id: 'model-3',
            model_name: 'Planner Model',
            prompt_template_id_used: 'prompt-planner',
            seed_prompt_url: null,
            edit_version: 2,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 100,
            tokens_used_output: 200,
            processing_time_ms: 180,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'header_context',
            file_name: 'model-3_1_header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/test-stage/_work/context',
            size_bytes: 2049,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('header_context test must not query project_resources'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const hasContributionTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' && filter.column === 'contribution_type' && filter.value === 'header_context',
                        );
                        if (!hasContributionTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by contribution_type'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing contribution_type filter',
                            });
                        }

                        return Promise.resolve({
                            data: [contribution1, contribution2],
                            error: null,
                            count: 2,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 2);
        const ids = documents.map((doc) => doc.id).sort();
        assertEquals(ids, ['header-context-contribution-1', 'header-context-contribution-2']);
    });

    it("does NOT filter seed_prompt resources by iteration_number (session-level constant)", async () => {
        // seed_prompt resources are created at session start and should be available
        // across all iterations. They should NOT be filtered by iteration_number.
        const rule: InputRule[] = [{ type: 'seed_prompt', slug: 'test-stage' }];

        // Seed prompt created at iteration 0 (session start)
        const seedPromptAtStart: DialecticProjectResourceRow = {
            id: 'seed-prompt-iter-0',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'seed-iter-0.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 123,
            resource_description: { "description": "Seed prompt at session start", type: 'seed_prompt' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 0,
            resource_type: 'seed_prompt',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        // Assert that NO iteration_number filter is applied for seed_prompt
                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number',
                        );
                        if (hasIterationFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('seed_prompt queries must NOT filter by iteration_number'),
                                count: 0,
                                status: 400,
                                statusText: 'Unexpected iteration_number filter',
                            });
                        }

                        return Promise.resolve({
                            data: [seedPromptAtStart],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        // Parent job is at iteration 1, but should still find seed_prompt from iteration 0
        mockParentJob.payload.iterationNumber = 1;
        mockParentJob.iteration_number = 1;

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'seed-prompt-iter-0');
    });

    it("filters header_context contributions by iteration_number", async () => {
        const rule: InputRule[] = [{ type: 'header_context', slug: 'test-stage' }];
        const iteration1HeaderContext: DialecticContributionRow = {
            id: 'header-context-iter-1',
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
            contribution_type: 'header_context',
            file_name: 'model-1_0_header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/test-stage/_work/context',
            size_bytes: 80,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        const iteration2HeaderContext: DialecticContributionRow = {
            id: 'header-context-iter-2',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'test-stage',
            iteration_number: 2,
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
            file_name: 'model-1_0_header_context_iter2.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_2/test-stage/_work/context',
            size_bytes: 81,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('header_context test must not query project_resources'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number' &&
                                filter.value === 1,
                        );
                        if (!hasIterationFilter) {
                            return Promise.resolve({
                                data: [iteration1HeaderContext, iteration2HeaderContext],
                                error: null,
                                count: 2,
                                status: 200,
                                statusText: 'OK',
                            });
                        }

                        return Promise.resolve({
                            data: [iteration1HeaderContext],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'header-context-iter-1');
        assertEquals(documents[0].iteration_number, 1);
        assertEquals(documents.some((doc) => doc.id === 'header-context-iter-2'), false);
    });

    it("does NOT filter project_resource resources by iteration_number (project-level constant)", async () => {
        // project_resource resources are user-provided inputs that exist at project level
        // and should be available across all iterations. They should NOT be filtered by iteration_number.
        const rule: InputRule[] = [{ type: 'project_resource', slug: 'test-stage', document_key: FileType.GeneralResource }];

        // Project resource created before dialectic starts (iteration null or 0)
        const projectResourceAtStart: DialecticProjectResourceRow = {
            id: 'project-resource-iter-null',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'initial_user_prompt.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 3072,
            resource_description: { type: 'project_resource', document_key: FileType.GeneralResource },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'project_resource',
            session_id: null,
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        // Assert that NO iteration_number filter is applied for project_resource
                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number',
                        );
                        if (hasIterationFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must NOT filter by iteration_number'),
                                count: 0,
                                status: 400,
                                statusText: 'Unexpected iteration_number filter',
                            });
                        }

                        return Promise.resolve({
                            data: [projectResourceAtStart],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        // Parent job is at iteration 1, but should still find project_resource with null iteration
        mockParentJob.payload.iterationNumber = 1;
        mockParentJob.iteration_number = 1;

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'project-resource-iter-null');
    });

    it("returns the expected 'project_resource' row when available", async () => {
        const rules: InputRule[] = [{ type: 'project_resource', slug: 'test-stage', document_key: FileType.GeneralResource }];

        const projectResource: DialecticProjectResourceRow = {
            id: 'general-resource-id',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'general_resource.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 3072,
            resource_description: { type: 'project_resource', document_key: FileType.GeneralResource },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'project_resource',
            session_id: null,
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const hasResourceTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'resource_type' &&
                                filter.value === 'project_resource',
                        );
                        if (!hasResourceTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must filter by resource_type'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing resource_type filter',
                            });
                        }

                        const hasProjectFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'project_id' &&
                                filter.value === projectResource.project_id,
                        );
                        if (!hasProjectFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must scope by project_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing project_id filter',
                            });
                        }

                        // Note: project_resource queries CAN filter by stage_slug to find resources from a specific stage

                        const hasJsonPathFilter = state.filters.some((filter) => {
                            if (typeof filter.column === 'string' && filter.column.includes('resource_description->>')) {
                                return true;
                            }
                            if (typeof filter.filters === 'string' && filter.filters.includes('resource_description->>')) {
                                return true;
                            }
                            return false;
                        });

                        if (hasJsonPathFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must not use JSON-path predicates on resource_description'),
                                count: 0,
                                status: 400,
                                statusText: 'JSON-path filter detected',
                            });
                        }

                        return Promise.resolve({
                            data: [projectResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'general-resource-id');
    });

    it("returns the same resource once when multiple rules require the same project_resource", async () => {
        // Updated: findSourceDocuments now returns ALL matching documents without "consuming" them.
        // Multiple rules requesting the same resource get it returned once (deduped).
        // The planner is responsible for distribution, not findSourceDocuments.
        const rules: InputRule[] = [
            { type: 'project_resource', slug: 'test-stage', document_key: FileType.GeneralResource },
            { type: 'project_resource', slug: 'test-stage', document_key: FileType.GeneralResource },
        ];

        const projectResource: DialecticProjectResourceRow = {
            id: 'general-resource-shared',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'general_resource.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 3072,
            resource_description: { type: 'project_resource', document_key: FileType.GeneralResource },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'project_resource',
            session_id: null,
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [projectResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
            },
        });

        // Should NOT throw - same resource satisfies both rules, returned once
        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 1, 'Should return the resource once (deduped)');
        assertEquals(documents[0].id, 'general-resource-shared');
    });

    it('enforces column predicates and rejects JSON-path filters for rendered document resources', async () => {
        const rules: InputRule[] = [
            {
                type: 'document',
                slug: 'test-stage',
                document_key: FileType.technical_approach,
            },
        ];

        const projectResource: DialecticProjectResourceRow = {
            id: 'rendered-document-resource-id',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_test-stage_technical_approach_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4096,
            resource_description: {
                type: 'rendered_document',
                document_key: FileType.technical_approach,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: 'contrib-123',
            stage_slug: 'test-stage',
        };

        type SelectResultRendered = {
            data: object[] | null;
            error: Error | null;
            count: number | null;
            status: number;
            statusText: string;
        };

        const renderedDocumentSelect = async (
            state: MockQueryBuilderState,
        ): Promise<SelectResultRendered> => {
            const requireEq = (column: string, value: unknown): void => {
                const hasFilter = state.filters.some(
                    (filter) =>
                        filter.type === 'eq' &&
                        filter.column === column &&
                        filter.value === value,
                );
                if (!hasFilter) {
                    throw new Error(
                        `rendered_document queries must filter by ${column}=${String(value)}`,
                    );
                }
            };

            requireEq('resource_type', projectResource.resource_type);
            requireEq('project_id', projectResource.project_id);
            requireEq('session_id', projectResource.session_id);
            requireEq('stage_slug', projectResource.stage_slug);
            requireEq('source_contribution_id', projectResource.source_contribution_id);

            const hasJsonPathFilter = state.filters.some((filter) => {
                if (typeof filter.column === 'string' && filter.column.includes('resource_description->>')) {
                    return true;
                }
                if (typeof filter.filters === 'string' && filter.filters.includes('resource_description->>')) {
                    return true;
                }
                return false;
            });

            if (hasJsonPathFilter) {
                throw new Error(
                    'resource queries must not use JSON-path predicates on resource_description',
                );
            }

            return {
                data: [projectResource],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
            };
        };

        mockParentJob.payload.sourceContributionId = projectResource.source_contribution_id;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: renderedDocumentSelect,
                },
                dialectic_contributions: {
                    select: async (): Promise<SelectResultRendered> => ({
                        data: [],
                        error: null,
                        count: 0,
                        status: 200,
                        statusText: 'OK',
                    }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, projectResource.id);
    });

    it('filters rendered_document resources by iteration_number', async () => {
        const rule: InputRule[] = [
            {
                type: 'document',
                slug: 'test-stage',
                document_key: FileType.technical_approach,
            },
        ];

        const iteration2ParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...mockParentJob,
            payload: {
                job_type: 'PLAN',
                model_id: 'model-1',
                projectId: 'proj-1',
                sessionId: 'sess-1',
                stageSlug: 'test-stage',
                iterationNumber: 2,
                walletId: 'wallet-1',
                continueUntilComplete: false,
                maxRetries: 3,
                continuation_count: 0,
                user_jwt: 'parent-jwt-default',
            },
            iteration_number: 2,
        };

        const iteration1Document: DialecticProjectResourceRow = {
            id: 'rendered-doc-iter-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_test-stage_technical_approach_iter1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4096,
            resource_description: {
                type: 'rendered_document',
                document_key: FileType.technical_approach,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: 'contrib-iter-1',
            stage_slug: 'test-stage',
        };

        const iteration2Document: DialecticProjectResourceRow = {
            id: 'rendered-doc-iter-2',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_test-stage_technical_approach_iter2.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4097,
            resource_description: {
                type: 'rendered_document',
                document_key: FileType.technical_approach,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 2,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: 'contrib-iter-2',
            stage_slug: 'test-stage',
        };

        const iteration3Document: DialecticProjectResourceRow = {
            id: 'rendered-doc-iter-3',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_test-stage_technical_approach_iter3.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4098,
            resource_description: {
                type: 'rendered_document',
                document_key: FileType.technical_approach,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 3,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: 'contrib-iter-3',
            stage_slug: 'test-stage',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number' &&
                                filter.value === 2,
                        );
                        if (!hasIterationFilter) {
                            return Promise.resolve({
                                data: [iteration1Document, iteration2Document, iteration3Document],
                                error: null,
                                count: 3,
                                status: 200,
                                statusText: 'OK',
                            });
                        }

                        return Promise.resolve({
                            data: [iteration2Document],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            iteration2ParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'rendered-doc-iter-2');
        assertEquals(documents[0].iteration_number, 2);
        assertEquals(documents.some((doc) => doc.id === 'rendered-doc-iter-1'), false);
        assertEquals(documents.some((doc) => doc.id === 'rendered-doc-iter-3'), false);
    });

    it('does not filter by source_contribution_id for project resources without linkage', async () => {
        const rules: InputRule[] = [
            {
                type: 'project_resource',
                slug: 'test-stage',
                document_key: FileType.GeneralResource,
            },
        ];

        const projectResource: DialecticProjectResourceRow = {
            id: 'unlinked-project-resource-id',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'general_resource_unlinked.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 2048,
            resource_description: {
                type: 'project_resource',
                document_key: FileType.GeneralResource,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'project_resource',
            session_id: null,
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        type SelectResultUnlinked = {
            data: object[] | null;
            error: Error | null;
            count: number | null;
            status: number;
            statusText: string;
        };

        const unlinkedResourceSelect = async (
            state: MockQueryBuilderState,
        ): Promise<SelectResultUnlinked> => {
            const hasNonNullSourceFilter = state.filters.some(
                (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'source_contribution_id' &&
                    filter.value !== null,
            );

            if (hasNonNullSourceFilter) {
                throw new Error(
                    'project_resource queries must not filter by non-null source_contribution_id when linkage is absent',
                );
            }

            const hasJsonPathFilter = state.filters.some((filter) => {
                if (typeof filter.column === 'string' && filter.column.includes('resource_description->>')) {
                    return true;
                }
                if (typeof filter.filters === 'string' && filter.filters.includes('resource_description->>')) {
                    return true;
                }
                return false;
            });

            if (hasJsonPathFilter) {
                throw new Error(
                    'project_resource queries must not use JSON-path predicates on resource_description',
                );
            }

            return {
                data: [projectResource],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
            };
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: unlinkedResourceSelect,
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, projectResource.id);
    });

    it('does not call downloadFromStorage even when it would throw an error', async () => {
        const rule: InputRule[] = [{ type: 'document', slug: 'test-stage' }];
        const mockResource: DialecticProjectResourceRow = {
            id: 'doc-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'doc1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 123,
            resource_description: { type: 'document', document_key: 'business_case' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        let downloadFromStorageCalled = false;
        const failingDownloadFromStorage = () => {
            downloadFromStorageCalled = true;
            return Promise.resolve({
                data: null,
                error: new Error('This should never be called'),
            });
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [mockResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are found'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(downloadFromStorageCalled, false, 'downloadFromStorage should not be called');
        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'doc-1');
        assertEquals(documents[0].content, '', 'content should be empty string');
    });

    it('returns SourceDocument objects with all required metadata but empty content', async () => {
        const rule: InputRule[] = [{ type: 'document', slug: 'test-stage', document_key: FileType.business_case }];
        const mockResource: DialecticProjectResourceRow = {
            id: 'doc-metadata-test',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'business_case.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 123,
            resource_description: { type: 'document', document_key: FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        let downloadFromStorageCallCount = 0;
        const trackDownloadFromStorage = () => {
            downloadFromStorageCallCount++;
            return Promise.resolve({
                data: new ArrayBuffer(0),
                error: null,
            });
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [mockResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are found'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(downloadFromStorageCallCount, 0, 'No storage download operations should occur');
        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'doc-metadata-test');
        assertEquals(documents[0].content, '', 'content must be empty string');
        assertEquals(documents[0].contribution_type, 'rendered_document');
        assertEquals(documents[0].session_id, 'sess-1');
        assertEquals(documents[0].stage, 'test-stage');
        assertEquals(documents[0].iteration_number, 1);
        assertEquals(documents[0].file_name, 'business_case.md');
        assertEquals(documents[0].storage_bucket, 'test-bucket');
        assertEquals(documents[0].storage_path, 'projects/proj-1/resources');
    });

    it('returns empty content for all input types (document, header_context, feedback)', async () => {
        const rules: InputRule[] = [
            { type: 'document', slug: 'test-stage', document_key: FileType.business_case },
            { type: 'header_context', slug: 'test-stage' },
            { type: 'feedback', slug: 'test-stage' },
        ];

        const mockDocumentResource: DialecticProjectResourceRow = {
            id: 'doc-all-types',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'business_case.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 123,
            resource_description: { type: 'document', document_key: FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        const mockHeaderContext: DialecticContributionRow = {
            id: 'header-all-types',
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
            contribution_type: 'header_context',
            file_name: 'model-1_0_header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/test-stage/_work/context',
            size_bytes: 80,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        const mockFeedback: DialecticFeedbackRow = {
            id: 'feedback-all-types',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage_slug: 'test-stage',
            iteration_number: 1,
            file_name: 'feedback.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/feedback',
            size_bytes: 100,
            mime_type: 'application/json',
            feedback_type: 'user_feedback',
            target_contribution_id: 'doc-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            project_id: 'proj-1',
            resource_description: null,
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const hasResourceTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'resource_type' &&
                                filter.value === 'rendered_document',
                        );
                        if (hasResourceTypeFilter) {
                            return Promise.resolve({
                                data: [mockDocumentResource],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const hasContributionTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'contribution_type' &&
                                filter.value === 'header_context',
                        );
                        if (hasContributionTypeFilter) {
                            return Promise.resolve({
                                data: [mockHeaderContext],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried for document type when resources are found'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        });
                    },
                },
                dialectic_feedback: {
                    select: () =>
                        Promise.resolve({
                            data: [mockFeedback],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 3, 'Should return documents for all three input types');
        
        const documentDoc = documents.find((doc) => doc.id === 'doc-all-types');
        const headerDoc = documents.find((doc) => doc.id === 'header-all-types');
        const feedbackDoc = documents.find((doc) => doc.id === 'feedback-all-types');

        assertEquals(documentDoc !== undefined, true, 'document type should be found');
        assertEquals(headerDoc !== undefined, true, 'header_context type should be found');
        assertEquals(feedbackDoc !== undefined, true, 'feedback type should be found');

        assertEquals(documentDoc!.content, '', 'document type should have empty content');
        assertEquals(headerDoc!.content, '', 'header_context type should have empty content');
        assertEquals(feedbackDoc!.content, '', 'feedback type should have empty content');
    });

    it("successfully returns a 'contribution' input type from dialectic_contributions", async () => {
        const rule: InputRule[] = [{ type: 'contribution', slug: 'test-stage', document_key: FileType.comparison_vector }];
        const mockContribution: DialecticContributionRow = {
            id: 'contribution-id',
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
            contribution_type: 'comparison_vector',
            file_name: 'model-1_1_comparison_vector_raw.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/test-stage/raw_responses',
            size_bytes: 80,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
        };

        // A record whose file_name contains 'comparison_vector' as a substring but
        // deconstructs to a DIFFERENT documentKey — must be excluded by exact matching.
        const substringFalsePositive: DialecticContributionRow = {
            ...mockContribution,
            id: 'false-positive-id',
            contribution_type: 'comparison_vector_detailed',
            file_name: 'model-1_1_comparison_vector_detailed_raw.json',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('contribution type test must not query project_resources'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const hasSessionFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'session_id' &&
                                filter.value === mockContribution.session_id,
                        );
                        if (!hasSessionFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('contribution queries must scope by session_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing session_id filter',
                            });
                        }

                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number' &&
                                filter.value === mockContribution.iteration_number,
                        );
                        if (!hasIterationFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('contribution queries must filter by iteration_number'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing iteration_number filter',
                            });
                        }

                        // DB returns both records — document_key filtering happens in TypeScript
                        return Promise.resolve({
                            data: [mockContribution, substringFalsePositive],
                            error: null,
                            count: 2,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1, 'Exact match only — substring false positive must be excluded');
        assertEquals(documents[0].id, 'contribution-id');
        assertEquals(documents[0].contribution_type, 'comparison_vector');
    });

    // Step 54.b.i: Test that when resources exist, contributions are NOT queried
    it('queries resources first and does not query contributions when resources are found', async () => {
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'test-stage',
            document_key: FileType.business_case,
        }];

        const mockResource: DialecticProjectResourceRow = {
            id: 'resource-54b-i',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_test-stage_business_case_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4096,
            resource_description: { type: 'document', document_key: FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        let contributionsQueryCalled = false;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const hasResourceTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'resource_type' &&
                                filter.value === 'rendered_document',
                        );
                        if (!hasResourceTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('document queries must filter by resource_type = rendered_document'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing resource_type filter',
                            });
                        }

                        const hasProjectFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'project_id' &&
                                filter.value === 'proj-1',
                        );
                        if (!hasProjectFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('document queries must scope by project_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing project_id filter',
                            });
                        }

                        return Promise.resolve({
                            data: [mockResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
                dialectic_contributions: {
                    select: () => {
                        contributionsQueryCalled = true;
                        return Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are found'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(contributionsQueryCalled, false, 'contributions should NOT be queried when resources are found');
        assertEquals(documents.length, 1, 'should return one document from resources');
        assertEquals(documents[0].id, 'resource-54b-i', 'should return the resource document');
        assertEquals(documents[0].contribution_type, 'rendered_document', 'should have correct contribution_type');
    });

    // Step 54.b.ii: Test that when both exist, only resources are returned
    it('returns only resources when both resources and contributions exist for the same document_key', async () => {
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'test-stage',
            document_key: FileType.business_case,
        }];

        const mockResource: DialecticProjectResourceRow = {
            id: 'resource-54b-ii',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_test-stage_business_case_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4096,
            resource_description: { type: 'document', document_key: FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        const mockContribution: DialecticContributionRow = {
            id: 'contribution-54b-ii',
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
            contribution_type: 'business_case',
            file_name: 'sess-1_test-stage_business_case_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage',
            size_bytes: 123,
            mime_type: 'text/markdown',
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
        };

        let contributionsQueryCalled = false;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => {
                        return Promise.resolve({
                            data: [mockResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
                dialectic_contributions: {
                    select: () => {
                        contributionsQueryCalled = true;
                        return Promise.resolve({
                            data: [mockContribution],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(contributionsQueryCalled, false, 'contributions should NOT be queried when resources are found');
        assertEquals(documents.length, 1, 'should return only one document (from resources)');
        assertEquals(documents[0].id, 'resource-54b-ii', 'should return the resource, NOT the contribution');
        assertEquals(documents[0].id !== 'contribution-54b-ii', true, 'should NOT return the contribution');
    });

    // Step 54.b.iii: Test that when resources don't exist, error is thrown and contributions are NOT queried
    it('throws error when resources are not found and does not query contributions', async () => {
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'test-stage',
            document_key: FileType.business_case,
        }];

        let contributionsQueryCalled = false;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => {
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
                dialectic_contributions: {
                    select: () => {
                        contributionsQueryCalled = true;
                        return Promise.resolve({
                            data: null,
                            error: new Error('contributions should not be queried when resources are missing'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        });
                    },
                },
            },
        });

        await assertRejects(
            async () => {
                await findSourceDocuments(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    mockParentJob,
                    rule,
                );
            },
            Error,
            'Required rendered document',
            'should throw error indicating required rendered document was not found',
        );

        assertEquals(contributionsQueryCalled, false, 'contributions should NOT be queried when resources are missing');
    });

    // Step 54.b.iv: Test that header_context still queries contributions (should pass)
    it('continues to query contributions for header_context type inputs', async () => {
        const rule: InputRule[] = [{
            type: 'header_context',
            slug: 'test-stage',
            document_key: FileType.HeaderContext,
        }];

        const mockHeaderContext: DialecticContributionRow = {
            id: 'header-54b-iv',
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
            contribution_type: 'header_context',
            file_name: 'model-1_0_header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'proj-1/session_sess-1/iteration_1/test-stage/_work/context',
            size_bytes: 80,
            mime_type: 'application/json',
            document_relationships: null,
            is_header: true,
            source_prompt_resource_id: null,
        };

        let contributionsQueryCalled = false;
        let resourcesQueryCalled = false;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => {
                        resourcesQueryCalled = true;
                        return Promise.resolve({
                            data: null,
                            error: new Error('header_context should not query project_resources'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        });
                    },
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        contributionsQueryCalled = true;
                        const hasContributionTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'contribution_type' &&
                                filter.value === 'header_context',
                        );
                        if (!hasContributionTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by contribution_type'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing contribution_type filter',
                            });
                        }
                        return Promise.resolve({
                            data: [mockHeaderContext],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(resourcesQueryCalled, false, 'resources should NOT be queried for header_context');
        assertEquals(contributionsQueryCalled, true, 'contributions SHOULD be queried for header_context');
        assertEquals(documents.length, 1, 'should return one header_context document');
        assertEquals(documents[0].id, 'header-54b-iv', 'should return the header_context from contributions');
        assertEquals(documents[0].contribution_type, 'header_context', 'should have correct contribution_type');
    });

    it('populates document_relationships from source contribution when returning rendered documents', async () => {
        // When findSourceDocuments returns a rendered document from dialectic_project_resources,
        // it should use source_contribution_id to fetch the contribution's document_relationships
        // and merge them into the returned SourceDocument.
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'thesis',
            document_key: FileType.business_case,
        }];

        const sourceContributionId = 'contrib-with-doc-rels';
        const expectedSourceGroup = 'lineage-group-abc';

        const mockResource: DialecticProjectResourceRow = {
            id: 'rendered-doc-with-lineage',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_thesis_business_case_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4096,
            resource_description: { type: 'document', document_key: FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: sourceContributionId,
            stage_slug: 'thesis',
        };

        const mockSourceContribution: DialecticContributionRow = {
            id: sourceContributionId,
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
            file_name: 'sess-1_thesis_business_case_v1.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
            size_bytes: 123,
            mime_type: 'application/json',
            document_relationships: { source_group: expectedSourceGroup, thesis: 'anchor-id-123' },
            is_header: false,
            source_prompt_resource_id: null,
        };

        let contributionQueryCalled = false;
        let queriedContributionIds: string[] = [];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [mockResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        contributionQueryCalled = true;
                        // Capture the IDs being queried via .in() filter
                        const inFilter = state.filters.find(
                            (filter) => filter.type === 'in' && filter.column === 'id'
                        );
                        if (inFilter && Array.isArray(inFilter.value)) {
                            queriedContributionIds = inFilter.value as string[];
                        }
                        return Promise.resolve({
                            data: [mockSourceContribution],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1, 'Should return one document');
        assertEquals(documents[0].id, 'rendered-doc-with-lineage', 'Should return the rendered document');

        // The key assertion: document_relationships should be populated from the source contribution
        assertEquals(
            contributionQueryCalled,
            true,
            'Should query contributions to fetch document_relationships for rendered document with source_contribution_id'
        );
        assertEquals(
            queriedContributionIds.includes(sourceContributionId),
            true,
            'Should query the contribution by source_contribution_id using .in() filter'
        );
        assertEquals(
            documents[0].document_relationships?.source_group,
            expectedSourceGroup,
            'Should have document_relationships.source_group from source contribution'
        );
        assertEquals(
            (documents[0].document_relationships as Record<string, unknown>)?.thesis,
            'anchor-id-123',
            'Should have document_relationships.thesis from source contribution'
        );
    });

    it('should allow optional feedback to be missing without throwing an error', async () => {
        // RED test: Proves that optional feedback (required: false) should not cause an error
        // when no feedback records exist. This test will fail with current implementation
        // because findSourceDocuments throws an error even when required: false.
        const rules: InputRule[] = [
            {
                type: 'feedback',
                slug: 'test-stage',
                document_key: FileType.business_case,
                required: false
            },
        ];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_feedback: {
                    select: () =>
                        Promise.resolve({
                            data: [], // No feedback exists - user hasn't provided any
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
            },
        });

        // This should NOT throw an error because feedback is optional (required: false)
        // Current implementation will throw: "A required input of type 'feedback' was not found"
        // This proves the flaw: optional feedback is being treated as required
        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        // When optional feedback is missing, the function should return successfully
        // with an empty array (or continue processing other rules if present)
        assertEquals(documents.length, 0, 'Should return empty array when optional feedback is missing');
    });

    it('should return ALL matching documents for a document_key, not just the first one', async () => {
        // RED test: Proves that findSourceDocuments returns only one document per document_key
        // when multiple exist (e.g., 3 models each produced a business_case).
        // The planner needs ALL documents to group them by lineage correctly.
        // Current implementation returns only 1 due to selectRecordsForRule returning early.
        const rules: InputRule[] = [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ];

        // Three business_case documents from three different models/lineages
        const mockResource1: DialecticProjectResourceRow = {
            id: 'business-case-model-a',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'model-a_0_business_case_lineage1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis/documents',
            mime_type: 'text/markdown',
            size_bytes: 1000,
            resource_description: { document_key: 'business_case' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: 'contrib-model-a',
            stage_slug: 'thesis',
        };

        const mockResource2: DialecticProjectResourceRow = {
            id: 'business-case-model-b',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'model-b_0_business_case_lineage2.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis/documents',
            mime_type: 'text/markdown',
            size_bytes: 1100,
            resource_description: { document_key: 'business_case' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: 'contrib-model-b',
            stage_slug: 'thesis',
        };

        const mockResource3: DialecticProjectResourceRow = {
            id: 'business-case-model-c',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'model-c_0_business_case_lineage3.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis/documents',
            mime_type: 'text/markdown',
            size_bytes: 1200,
            resource_description: { document_key: 'business_case' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: 'contrib-model-c',
            stage_slug: 'thesis',
        };

        // Mock contributions to provide document_relationships for each
        const mockContributions = [
            {
                id: 'contrib-model-a',
                document_relationships: {
                    source_group: 'lineage-group-a',
                    source_document: 'contrib-model-a',
                    thesis: 'contrib-model-a',
                },
            },
            {
                id: 'contrib-model-b',
                document_relationships: {
                    source_group: 'lineage-group-b',
                    source_document: 'contrib-model-b',
                    thesis: 'contrib-model-b',
                },
            },
            {
                id: 'contrib-model-c',
                document_relationships: {
                    source_group: 'lineage-group-c',
                    source_document: 'contrib-model-c',
                    thesis: 'contrib-model-c',
                },
            },
        ];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [mockResource1, mockResource2, mockResource3],
                            error: null,
                            count: 3,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        // Return contributions matching the .in() filter
                        const inFilter = state.filters.find(
                            (filter) => filter.type === 'in' && filter.column === 'id'
                        );
                        if (inFilter && Array.isArray(inFilter.value)) {
                            const requestedIds = inFilter.value as string[];
                            const matchingContribs = mockContributions.filter(c =>
                                requestedIds.includes(c.id)
                            );
                            return Promise.resolve({
                                data: matchingContribs,
                                error: null,
                                count: matchingContribs.length,
                                status: 200,
                                statusText: 'OK',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        // The planner needs ALL 3 documents to group them by lineage.
        // Current implementation returns only 1 because selectRecordsForRule
        // returns [record] (first unused) when allowMultiple is false.
        assertEquals(
            documents.length,
            3,
            'findSourceDocuments must return ALL matching documents (3), not just the first one. ' +
            'The planner needs all documents to group them by lineage correctly. ' +
            `Actual count: ${documents.length}`
        );

        // Verify all three documents are present with distinct IDs
        const documentIds = documents.map(d => d.id);
        assertEquals(
            documentIds.includes('business-case-model-a'),
            true,
            'Should include business_case from model A'
        );
        assertEquals(
            documentIds.includes('business-case-model-b'),
            true,
            'Should include business_case from model B'
        );
        assertEquals(
            documentIds.includes('business-case-model-c'),
            true,
            'Should include business_case from model C'
        );

        // Verify each document has its correct lineage from document_relationships
        const lineageGroups = documents
            .map(d => d.document_relationships?.source_group)
            .filter((sg): sg is string => sg !== null && sg !== undefined);
        assertEquals(
            lineageGroups.length,
            3,
            'All 3 documents should have document_relationships with source_group'
        );
        assertEquals(
            new Set(lineageGroups).size,
            3,
            'Each document should have a distinct lineage (source_group)'
        );
    });

    it("returns SourceDocument with document_key populated when mapping header_context contributions from dialectic_contributions", async () => {
        // Mock mirrors DialecticContributionRow from dialectic_contributions table with contribution_type 'header_context'
        // Real values from integration test failure: contributionId 91155b5f-d710-4325-9ee3-836a385d09f9
        // for model_id 77afe5e0-a0d8-4a01-974f-f74f9f89a4ef (full-dag-test-model-b)
        const rule: InputRule[] = [{
            type: 'header_context',
            slug: 'synthesis',
            document_key: FileType.header_context_pairwise,
            required: true,
        }];

        const mockHeaderContextContribution: DialecticContributionRow = {
            id: '91155b5f-d710-4325-9ee3-836a385d09f9',
            session_id: '30e8c9f9-8264-40aa-a66f-a8d12553ba70',
            user_id: '5bb9ec3e-2e8d-43d9-9d98-3a6029ea9168',
            stage: 'synthesis',
            iteration_number: 1,
            model_id: '77afe5e0-a0d8-4a01-974f-f74f9f89a4ef',
            model_name: 'Full DAG Test Model B',
            prompt_template_id_used: 'prompt-1',
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 100,
            tokens_used_output: 200,
            processing_time_ms: 500,
            error: null,
            citations: null,
            created_at: '2026-01-19T22:44:07.900Z',
            updated_at: '2026-01-19T22:44:07.900Z',
            contribution_type: 'header_context',
            file_name: 'full-dag-test-model-b_0_0b39478c_header_context_pairwise.json',
            storage_bucket: 'dialectic-project-resources',
            storage_path: '2afbba8d-80e9-4c87-82bb-582cb51ef7dc/session_30e8c9f9/iteration_1/3_synthesis/_work/context',
            size_bytes: 2271,
            mime_type: 'application/json',
            document_relationships: { source_group: '0b39478c-5936-4f93-b176-842b642b56ac' },
            is_header: false,
            source_prompt_resource_id: null,
        };

        const parentJobWithModelB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            id: 'parent-job-123',
            status: 'pending',
            payload: {
                job_type: 'PLAN',
                model_id: '77afe5e0-a0d8-4a01-974f-f74f9f89a4ef',
                projectId: '2afbba8d-80e9-4c87-82bb-582cb51ef7dc',
                sessionId: '30e8c9f9-8264-40aa-a66f-a8d12553ba70',
                stageSlug: 'synthesis',
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
            session_id: '30e8c9f9-8264-40aa-a66f-a8d12553ba70',
            started_at: null,
            stage_slug: 'synthesis',
            target_contribution_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };

        // A header_context contribution whose documentKey is 'header_context' (not 'header_context_pairwise').
        // With exact matching via deconstructStoragePath, requesting 'header_context_pairwise' must NOT
        // return a record whose documentKey is 'header_context'.
        const nonMatchingHeaderContext: DialecticContributionRow = {
            ...mockHeaderContextContribution,
            id: 'non-matching-header-context',
            file_name: 'full-dag-test-model-b_0_0b39478c_header_context.json',
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const hasContributionTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'contribution_type' &&
                                filter.value === 'header_context',
                        );
                        if (!hasContributionTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by contribution_type'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing contribution_type filter',
                            });
                        }

                        const hasModelIdFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'model_id' &&
                                filter.value === '77afe5e0-a0d8-4a01-974f-f74f9f89a4ef',
                        );
                        if (!hasModelIdFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('header_context queries must filter by model_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing model_id filter',
                            });
                        }

                        // DB returns both records (no ilike pre-filter); exact matching in TypeScript
                        return Promise.resolve({
                            data: [mockHeaderContextContribution, nonMatchingHeaderContext],
                            error: null,
                            count: 2,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJobWithModelB,
            rule,
        );

        assertEquals(documents.length, 1, 'Exact match only — header_context record must be excluded when rule requests header_context_pairwise');
        assertEquals(documents[0].id, '91155b5f-d710-4325-9ee3-836a385d09f9', 'Should return the correct header_context_pairwise contribution');
        assertEquals(documents[0].model_id, '77afe5e0-a0d8-4a01-974f-f74f9f89a4ef', 'Should have correct model_id');
        assertEquals(documents[0].contribution_type, 'header_context', 'Should have correct contribution_type');
        assertEquals(documents[0].document_key, 'header_context_pairwise', 'Should have document_key extracted from filename by deconstructStoragePath');
    });

    it('should allow optional documents to be missing without throwing an error', async () => {
        // When an input rule has required: false and no matching documents exist,
        // findSourceDocuments should skip that rule and return successfully.
        // Example: Parenthesis stage has master_plan with required: false because
        // master_plan only exists on iteration > 1.
        const rules: InputRule[] = [
            {
                type: 'document',
                slug: 'parenthesis',
                document_key: FileType.master_plan,
                required: false
            },
        ];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () =>
                        Promise.resolve({
                            data: [], // No master_plan exists on iteration 1
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 0, 'Should return empty array when optional document is missing');
    });

    it("selects initial_user_prompt project resource by resource_type (NOT by file_name)", async () => {
        // Integration reality:
        // - The recipe uses type 'project_resource' with document_key 'initial_user_prompt'
        // - The user-controlled filename may be something like 'initial_prompt_1.md' and will NOT contain 'initial_user_prompt'
        // So this MUST be found via dialectic_project_resources.resource_type === 'initial_user_prompt', not via file_name ILIKE.
        const rule: InputRule[] = [{ type: 'project_resource', slug: 'project', document_key: FileType.InitialUserPrompt }];

        const projectWideResource: DialecticProjectResourceRow = {
            id: 'initial-user-prompt-id',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'initial_prompt_1.md',
            storage_bucket: 'test-bucket',
            // FileManagerService stores InitialUserPrompt at the project root (storage_path === projectId)
            storage_path: 'proj-1',
            mime_type: 'text/markdown',
            size_bytes: 2048,
            resource_description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: FileType.InitialUserPrompt,
            session_id: null,
            source_contribution_id: null,
            stage_slug: null,
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        // Assert required filters ARE present
                        const hasProjectFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'project_id' &&
                                filter.value === 'proj-1',
                        );
                        if (!hasProjectFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must scope by project_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing project_id filter',
                            });
                        }

                        const hasResourceTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'resource_type' &&
                                filter.value === FileType.InitialUserPrompt,
                        );
                        if (!hasResourceTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('initial_user_prompt project resource queries must filter by resource_type=initial_user_prompt'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing resource_type filter',
                            });
                        }

                        // Note: project_resource queries CAN filter by stage_slug to find resources from a specific stage

                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number',
                        );
                        if (hasIterationFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must NOT filter by iteration_number'),
                                count: 0,
                                status: 400,
                                statusText: 'Unexpected iteration_number filter',
                            });
                        }

                        const hasModelFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'model_id',
                        );
                        if (hasModelFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must NOT filter by model_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Unexpected model_id filter',
                            });
                        }

                        const hasSessionFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'session_id',
                        );
                        if (hasSessionFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must NOT filter by session_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Unexpected session_id filter',
                            });
                        }

                        return Promise.resolve({
                            data: [projectWideResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        // Parent job is deep in the workflow with a specific model/iteration/stage,
        // but should still find the project-level initial prompt.
        mockParentJob.payload.iterationNumber = 2;
        mockParentJob.iteration_number = 2;
        mockParentJob.payload.stageSlug = 'paralysis';
        mockParentJob.stage_slug = 'paralysis';
        mockParentJob.payload.model_id = 'model-xyz';

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1, 'Should find project-level resource regardless of job context');
        assertEquals(documents[0].id, 'initial-user-prompt-id', 'Should return the correct project resource');
    });

    it('feedback query includes .eq("iteration_number", iterationNumber) filter', async () => {
        const rule: InputRule[] = [{ type: 'feedback', slug: 'test-stage', required: false }];
        const expectedIteration = 1;
        mockParentJob.payload.iterationNumber = expectedIteration;
        mockParentJob.iteration_number = expectedIteration;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_feedback: {
                    select: (state: MockQueryBuilderState) => {
                        const hasIterationFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'iteration_number' &&
                                filter.value === expectedIteration,
                        );
                        if (!hasIterationFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('feedback queries must filter by iteration_number'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing iteration_number filter',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 0, 'No feedback rows; query shape was asserted by mock');
    });

    it('feedback query uses resource_description->>\'document_key\' eq filter for document_key matching', async () => {
        const rule: InputRule[] = [
            { type: 'feedback', slug: 'test-stage', document_key: FileType.business_case },
        ];
        const mockFeedbackRow: DialecticFeedbackRow = {
            id: 'feedback-doc-key-id',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage_slug: 'test-stage',
            iteration_number: 1,
            file_name: 'business_case_feedback.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/feedback',
            size_bytes: 100,
            mime_type: 'text/markdown',
            feedback_type: 'user_feedback',
            target_contribution_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            project_id: 'proj-1',
            resource_description: { document_key: FileType.business_case, model_id: 'model-1' },
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_feedback: {
                    select: (state: MockQueryBuilderState) => {
                        const hasResourceDescDocumentKeyFilter = state.filters.some(
                            (filter) =>
                                (filter.type === 'eq' && filter.column === 'resource_description->>document_key') ||
                                (filter.type === 'filter' &&
                                    filter.column === 'resource_description->>document_key' &&
                                    filter.operator === 'eq'),
                        );
                        if (!hasResourceDescDocumentKeyFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error(
                                    'feedback queries with document_key must filter by resource_description->>\'document_key\'',
                                ),
                                count: 0,
                                status: 400,
                                statusText: 'Missing resource_description document_key filter',
                            });
                        }
                        return Promise.resolve({
                            data: [mockFeedbackRow],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1, 'Should return feedback when query uses resource_description document_key filter');
        assertEquals(documents[0].id, 'feedback-doc-key-id');
    });

    it('feedback query uses iterationNumber directly (consistent with other retrieval paths)', async () => {
        const rule: InputRule[] = [{ type: 'feedback', slug: 'thesis', required: false }];
        const expectedIteration = 2;
        mockParentJob.payload.iterationNumber = expectedIteration;
        mockParentJob.iteration_number = expectedIteration;

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_feedback: {
                    select: (state: MockQueryBuilderState) => {
                        const iterationFilter = state.filters.find(
                            (f) => f.type === 'eq' && f.column === 'iteration_number',
                        );
                        if (!iterationFilter || iterationFilter.value !== expectedIteration) {
                            return Promise.resolve({
                                data: null,
                                error: new Error(
                                    `feedback query must use iteration_number ${expectedIteration} from payload, got ${iterationFilter?.value ?? 'missing'}`,
                                ),
                                count: 0,
                                status: 400,
                                statusText: 'Wrong or missing iteration_number',
                            });
                        }
                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 0, 'No feedback rows; iteration_number value was asserted by mock');
    });

    it('feedback query includes model_id filter when parent job has model_id', async () => {
        const rules: InputRule[] = [{ type: 'feedback', slug: 'test-stage' }];
        mockParentJob.payload.model_id = 'model-for-feedback';

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_feedback: {
                    select: (state: MockQueryBuilderState) => {
                        const hasModelIdFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'filter' &&
                                filter.column === 'resource_description->>model_id' &&
                                filter.operator === 'eq' &&
                                filter.value === 'model-for-feedback',
                        );

                        if (!hasModelIdFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('Feedback query must filter by model_id from parent job'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing model_id filter',
                            });
                        }

                        return Promise.resolve({
                            data: [],
                            error: null,
                            count: 0,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );
    });

    it('returns only the feedback matching the parent job model_id when multiple models have feedback', async () => {
        const rules: InputRule[] = [{ type: 'feedback', slug: 'test-stage', document_key: FileType.business_case }];

        const feedbackModelA: DialecticFeedbackRow = {
            id: 'feedback-A',
            session_id: 'sess-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            stage_slug: 'test-stage',
            iteration_number: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            feedback_type: 'user_feedback',
            file_name: 'business_case_feedback_A.md',
            storage_bucket: 'test-bucket',
            storage_path: 'path/A',
            size_bytes: 100,
            mime_type: 'text/markdown',
            resource_description: { document_key: FileType.business_case, model_id: 'model-A' },
            target_contribution_id: 'contrib-A',
        };

        const feedbackModelB: DialecticFeedbackRow = {
            ...feedbackModelA,
            id: 'feedback-B',
            file_name: 'business_case_feedback_B.md',
            resource_description: { document_key: FileType.business_case, model_id: 'model-B' },
            target_contribution_id: 'contrib-B',
        };

        mockParentJob.payload.model_id = 'model-A';

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_feedback: {
                    select: (state: MockQueryBuilderState) => {
                        const allData = [feedbackModelA, feedbackModelB];
                        const modelIdFilter = state.filters.find(
                            (filter) => filter.type === 'filter' && filter.column === 'resource_description->>model_id'
                        );
                        const documentKeyFilter = state.filters.find(
                            (filter) =>
                                (filter.type === 'eq' && filter.column === 'resource_description->>document_key') ||
                                (filter.type === 'filter' &&
                                    filter.column === 'resource_description->>document_key' &&
                                    filter.operator === 'eq'),
                        );

                        const modelIdFilterValue: string | null =
                            modelIdFilter && typeof modelIdFilter.value === 'string'
                                ? modelIdFilter.value
                                : null;
                        const documentKeyFilterValue: string | null =
                            documentKeyFilter && typeof documentKeyFilter.value === 'string'
                                ? documentKeyFilter.value
                                : null;

                        if (!modelIdFilterValue) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('Feedback query must filter by resource_description->>model_id when parent job has model_id'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing model_id filter',
                            });
                        }
                        if (!documentKeyFilterValue) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('Feedback query must filter by resource_description->>\'document_key\' when InputRule.document_key is provided'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing document_key filter',
                            });
                        }

                        const filteredData = allData.filter((row) => {
                            const desc = row.resource_description;
                            if (!isRecord(desc)) {
                                return false;
                            }

                            const modelIdField = desc['model_id'];
                            const documentKeyField = desc['document_key'];

                            return (
                                typeof modelIdField === 'string' &&
                                typeof documentKeyField === 'string' &&
                                modelIdField === modelIdFilterValue &&
                                documentKeyField === documentKeyFilterValue
                            );
                        });

                        return Promise.resolve({
                            data: filteredData,
                            error: null,
                            count: filteredData.length,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'feedback-A');
    });

    it('enriches feedback documents with source_group from matching documents based on filename', async () => {
        const sourceGroup = 'lineage-group-uuid-123';
        
        // Create a rendered document with a source_group
        const businessCaseDoc: DialecticProjectResourceRow = {
            id: 'doc-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            session_id: 'sess-1',
            stage_slug: 'thesis',
            iteration_number: 1,
            resource_type: 'rendered_document',
            file_name: 'google-gemini-2.5-flash_0_business_case.md',
            storage_bucket: 'dialectic-contributions',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
            mime_type: 'text/markdown',
            size_bytes: 1000,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source_contribution_id: 'contrib-1',
            resource_description: { document_key: FileType.business_case },
        };
        
        // Create a contribution with document_relationships containing source_group
        const businessCaseContribution: DialecticContributionRow = {
            id: 'contrib-1',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'thesis',
            iteration_number: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'business_case',
            file_name: 'google-gemini-2.5-flash_0_business_case.md',
            storage_bucket: 'dialectic-contributions',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
            size_bytes: 1000,
            mime_type: 'text/markdown',
            model_id: 'model-1',
            model_name: 'Gemini 2.5 Flash',
            prompt_template_id_used: 'prompt-1',
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 100,
            tokens_used_output: 200,
            processing_time_ms: 1000,
            error: null,
            citations: null,
            document_relationships: { source_group: sourceGroup },
            is_header: false,
            source_prompt_resource_id: null,
        };
        
        // Create a feedback document with matching base filename but NO source_group
        const feedbackDoc: DialecticFeedbackRow = {
            id: 'feedback-1',
            session_id: 'sess-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            stage_slug: 'thesis',
            iteration_number: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            feedback_type: 'user_feedback',
            file_name: 'google-gemini-2.5-flash_0_business_case_feedback.md',
            storage_bucket: 'dialectic-contributions',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
            size_bytes: 500,
            mime_type: 'text/markdown',
            resource_description: { document_key: FileType.business_case, model_id: 'model-1' },
            target_contribution_id: 'contrib-1',
        };

        const rules: InputRule[] = [
            { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
            { type: 'feedback', slug: 'thesis', document_key: FileType.business_case, required: false },
        ];

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({
                        data: [businessCaseDoc],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: 'OK',
                    }),
                },
                dialectic_contributions: {
                    select: () => Promise.resolve({
                        data: [businessCaseContribution],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: 'OK',
                    }),
                },
                dialectic_feedback: {
                    select: () => Promise.resolve({
                        data: [feedbackDoc],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: 'OK',
                    }),
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rules,
        );

        // Should return 2 documents: the business_case document and the feedback
        assertEquals(documents.length, 2);
        
        // Find the feedback document in the results
        const feedbackResult = documents.find(doc => doc.contribution_type === 'feedback');
        
        // Assert that the feedback document was enriched with the source_group from the matching document
        assertEquals(feedbackResult?.id, 'feedback-1');
        assertEquals(feedbackResult?.file_name, 'google-gemini-2.5-flash_0_business_case_feedback.md');
        assertEquals(feedbackResult?.document_relationships?.source_group, sourceGroup,
            'Feedback document should be enriched with source_group from matching document based on filename pattern');
    });

    it("returns 'project_resource' initial_user_prompt without filtering by stage_slug", async () => {
        const rule: InputRule[] = [{
            type: 'project_resource',
            slug: 'project',
            document_key: FileType.InitialUserPrompt,
            required: true,
        }];
        const mockResource: DialecticProjectResourceRow = {
            id: 'initial-prompt-resource-id',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'initial_user_prompt.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources/initial_user_prompt.txt',
            mime_type: 'text/plain',
            size_bytes: 100,
            resource_description: { description: 'Initial user prompt', type: FileType.InitialUserPrompt },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'initial_user_prompt',
            session_id: null,
            source_contribution_id: null,
            stage_slug: null,
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: () =>
                        Promise.resolve({
                            data: null,
                            error: new Error('project_resource test must not query contributions'),
                            count: 0,
                            status: 500,
                            statusText: 'Intentional Failure',
                        }),
                },
                dialectic_project_resources: {
                    select: (state: MockQueryBuilderState) => {
                        const hasStageSlugFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'stage_slug',
                        );
                        if (hasStageSlugFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('initial_user_prompt must not filter by stage_slug'),
                                count: 0,
                                status: 400,
                                statusText: 'Unexpected stage_slug filter',
                            });
                        }

                        const hasResourceTypeFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'resource_type' &&
                                filter.value === 'initial_user_prompt',
                        );
                        if (!hasResourceTypeFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('initial_user_prompt must filter by resource_type = initial_user_prompt'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing resource_type filter',
                            });
                        }

                        return Promise.resolve({
                            data: [mockResource],
                            error: null,
                            count: 1,
                            status: 200,
                            statusText: 'OK',
                        });
                    },
                },
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'initial-prompt-resource-id');
    });
});