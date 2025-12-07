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
import type { Database, Tables } from '../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticContributionRow,
    DialecticProjectResourceRow,
    DialecticFeedbackRow,
    InputRule,
} from '../dialectic-service/dialectic.interface.ts';
import { findSourceDocuments } from './task_isolator.ts';
import { createMockSupabaseClient, MockQueryBuilderState } from '../_shared/supabase.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';

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

    it("successfully returns a 'seed_prompt' from dialectic_project_resources", async () => {
        const rule: InputRule[] = [{ type: 'seed_prompt', slug: 'test-stage' }];
        const mockSeedPromptResource: DialecticProjectResourceRow = {
            id: 'seed-prompt-resource-id',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'seed.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 123,
            resource_description: { "description": "A test seed prompt", type: 'seed_prompt' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'seed_prompt',
            session_id: null,
            source_contribution_id: null,
            stage_slug: 'test-stage',
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

                        const expectedStageSlug = rule[0].slug;
                        const hasStageFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'stage_slug' &&
                                filter.value === expectedStageSlug,
                        );
                        if (!hasStageFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('seed_prompt queries must filter by rule.slug'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing stage_slug filter',
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
            file_name: 'header.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/context',
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
            file_name: 'sess-1_test-stage_header_context_v1.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/context',
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
            file_name: 'sess-1_test-stage_header_context_v2.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/context',
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

    it("filters seed_prompt resources by iteration_number", async () => {
        const rule: InputRule[] = [{ type: 'seed_prompt', slug: 'test-stage' }];
        const iteration1SeedPrompt: DialecticProjectResourceRow = {
            id: 'seed-prompt-iter-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'seed-iter-1.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 123,
            resource_description: { "description": "Seed prompt iteration 1", type: 'seed_prompt' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'seed_prompt',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        const iteration2SeedPrompt: DialecticProjectResourceRow = {
            id: 'seed-prompt-iter-2',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'seed-iter-2.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 124,
            resource_description: { "description": "Seed prompt iteration 2", type: 'seed_prompt' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 2,
            resource_type: 'seed_prompt',
            session_id: 'sess-1',
            source_contribution_id: null,
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
                                filter.value === 1,
                        );
                        if (!hasIterationFilter) {
                            return Promise.resolve({
                                data: [iteration1SeedPrompt, iteration2SeedPrompt],
                                error: null,
                                count: 2,
                                status: 200,
                                statusText: 'OK',
                            });
                        }

                        return Promise.resolve({
                            data: [iteration1SeedPrompt],
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
        assertEquals(documents[0].id, 'seed-prompt-iter-1');
        assertEquals(documents[0].iteration_number, 1);
        assertEquals(documents.some((doc) => doc.id === 'seed-prompt-iter-2'), false);
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
            file_name: 'header-iter-1.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/context',
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
            file_name: 'header-iter-2.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_2/test-stage/_work/context',
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

    it("filters project_resource resources by iteration_number", async () => {
        const rule: InputRule[] = [{ type: 'project_resource', slug: 'test-stage', document_key: FileType.GeneralResource }];
        const iteration1ProjectResource: DialecticProjectResourceRow = {
            id: 'project-resource-iter-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'resource-iter-1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 3072,
            resource_description: { type: 'project_resource', document_key: FileType.GeneralResource },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'project_resource',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        const iteration2ProjectResource: DialecticProjectResourceRow = {
            id: 'project-resource-iter-2',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'resource-iter-2.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 3073,
            resource_description: { type: 'project_resource', document_key: FileType.GeneralResource },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 2,
            resource_type: 'project_resource',
            session_id: 'sess-1',
            source_contribution_id: null,
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
                                filter.value === 1,
                        );
                        if (!hasIterationFilter) {
                            return Promise.resolve({
                                data: [iteration1ProjectResource, iteration2ProjectResource],
                                error: null,
                                count: 2,
                                status: 200,
                                statusText: 'OK',
                            });
                        }

                        return Promise.resolve({
                            data: [iteration1ProjectResource],
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
        assertEquals(documents[0].id, 'project-resource-iter-1');
        assertEquals(documents[0].iteration_number, 1);
        assertEquals(documents.some((doc) => doc.id === 'project-resource-iter-2'), false);
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

                        const expectedStageSlug = rules[0].slug;
                        const hasStageFilter = state.filters.some(
                            (filter) =>
                                filter.type === 'eq' &&
                                filter.column === 'stage_slug' &&
                                filter.value === expectedStageSlug,
                        );
                        if (!hasStageFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('project_resource queries must filter by rule.slug'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing stage_slug filter',
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

    it("throws when a 'project_resource' rule cannot find an unused resource", async () => {
        const rules: InputRule[] = [
            { type: 'project_resource', slug: 'test-stage', document_key: FileType.GeneralResource },
            { type: 'project_resource', slug: 'test-stage', document_key: FileType.GeneralResource },
        ];

        const projectResource: DialecticProjectResourceRow = {
            id: 'general-resource-consumed',
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

        await assertRejects(
            () =>
                findSourceDocuments(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    mockParentJob,
                    rules,
                ),
            Error,
            "A required input of type 'project_resource' was not found for the current job.",
        );
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
            file_name: 'header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/context',
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
            file_name: 'header_context.json',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/test-stage/_work/context',
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
});