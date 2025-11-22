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
            mockDownloadFromStorage
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
            mockDownloadFromStorage
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'header-context-contribution-id');
    });

    it("successfully returns a document from contributions using the 'slug' property", async () => {
        const rule: InputRule[] = [{ type: 'document', slug: 'thesis' }];
        const mockThesisDocument: DialecticContributionRow = {
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
        };

        type SelectResult = {
            data: object[] | null;
            error: Error | null;
            count: number | null;
            status: number;
            statusText: string;
        };

        const dialecticContributionsSelect = async (
            state: MockQueryBuilderState,
        ): Promise<SelectResult> => {
            const hasStageFilter = state.filters.some(
                (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'stage' &&
                    filter.value === 'thesis',
            );

            if (!hasStageFilter) {
                return {
                    data: null,
                    error: new Error('document test must filter by rule.slug'),
                    count: 0,
                    status: 500,
                    statusText: 'Intentional Failure',
                };
            }

            const resultData: object[] = [mockThesisDocument];
            return {
                data: resultData,
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
            };
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: dialecticContributionsSelect,
                },
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
            },
        });
        
        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
            mockDownloadFromStorage
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'doc-1-thesis');
    });
    it('falls back to contributions when resource document_key does not match', async () => {
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'thesis',
            document_key: FileType.technical_approach,
        }];

        const mockThesisDocument: DialecticContributionRow = {
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
            file_name: 'sess-1_thesis_technical_approach_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
            size_bytes: 123,
            mime_type: 'text/plain',
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
        };

        type SelectResult = {
            data: object[] | null;
            error: Error | null;
            count: number | null;
            status: number;
            statusText: string;
        };

        const dialecticContributionsSelect = async (
            state: MockQueryBuilderState,
        ): Promise<SelectResult> => {
            const hasWildcardIdComparison = state.filters.some(
                (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'id' &&
                    filter.value === FileType.technical_approach,
            );

            if (hasWildcardIdComparison) {
                return {
                    data: null,
                    error: new Error('document queries must not compare id to FileType-based wildcard values'),
                    count: 0,
                    status: 500,
                    statusText: 'Intentional Failure',
                };
            }

            const hasStageFilter = state.filters.some(
                (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'stage' &&
                    filter.value === 'thesis',
            );

            if (!hasStageFilter) {
                return {
                    data: null,
                    error: new Error('document queries must include the stage filter'),
                    count: 0,
                    status: 500,
                    statusText: 'Intentional Failure',
                };
            }

            return {
                data: [mockThesisDocument],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
            };
        };

        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: dialecticContributionsSelect,
                },
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
            },
        });

        const documents = await findSourceDocuments(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            rule,
            mockDownloadFromStorage,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'doc-1-thesis');
    });

    it('returns a document when document_key is provided without comparing it to a FileType wildcard', async () => {
        const rule: InputRule[] = [{
            type: 'document',
            slug: 'thesis',
            document_key: FileType.technical_approach,
        }];

        const resourceRow: DialecticProjectResourceRow = {
            id: 'resource-wrong-key',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_thesis_business_case.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 4096,
            resource_description: { type: 'document', document_key: FileType.business_case },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'thesis',
        };

        const contributionRow: DialecticContributionRow = {
            id: 'doc-technical-approach',
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
            file_name: 'sess-1_thesis_technical_approach_v1.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
            size_bytes: 123,
            mime_type: 'text/plain',
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
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
                    select: (state: MockQueryBuilderState) => {
                        const hasStage = state.filters.some(
                            (filter) => filter.type === 'eq' && filter.column === 'stage' && filter.value === 'thesis',
                        );
                        if (!hasStage) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('stage filter is required'),
                                count: 0,
                                status: 500,
                                statusText: 'Missing filter',
                            });
                        }
                        return Promise.resolve({
                            data: [contributionRow],
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
            mockDownloadFromStorage,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, 'doc-technical-approach');
    });

    // NOTE: These coverage tests reflect the temporary JSON-path filtering. See Contract_Column_Use.md for the column fix plan.
    it('returns the newest contribution when the matching project resource was already used by an earlier rule', async () => {
        const rules: InputRule[] = [
            { type: 'document', slug: 'test-stage', document_key: FileType.success_metrics },
            { type: 'document', slug: 'test-stage', document_key: FileType.success_metrics },
        ];

        const projectResource: DialecticProjectResourceRow = {
            id: 'resource-success-metrics',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'sess-1_thesis_success_metrics.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/markdown',
            size_bytes: 5120,
            resource_description: { type: 'document', document_key: FileType.success_metrics },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: null,
            resource_type: 'document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        const fallbackContribution: DialecticContributionRow = {
            id: 'contribution-success-metrics',
            session_id: 'sess-1',
            user_id: 'user-123',
            stage: 'test-stage',
            iteration_number: 1,
            model_id: 'model-2',
            model_name: 'Fallback Model',
            prompt_template_id_used: 'prompt-2',
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: 123,
            tokens_used_output: 321,
            processing_time_ms: 250,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: 'thesis',
            file_name: 'sess-1_thesis_success_metrics_from_contribution.md',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/sessions/sess-1/iteration_1/thesis',
            size_bytes: 2048,
            mime_type: 'text/markdown',
            document_relationships: null,
            is_header: false,
            source_prompt_resource_id: null,
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
                dialectic_contributions: {
                    select: (state: MockQueryBuilderState) => {
                        const hasSessionFilter = state.filters.some(
                            (filter) => filter.type === 'eq' && filter.column === 'session_id' && filter.value === 'sess-1',
                        );
                        const hasIterationFilter = state.filters.some(
                            (filter) => filter.type === 'eq' && filter.column === 'iteration_number' && filter.value === 1,
                        );
                        const hasLatestEditFilter = state.filters.some(
                            (filter) => filter.type === 'eq' && filter.column === 'is_latest_edit' && filter.value === true,
                        );
                        const hasStageFilter = state.filters.some(
                            (filter) => filter.type === 'eq' && filter.column === 'stage' && filter.value === 'test-stage',
                        );

                        if (!hasSessionFilter || !hasIterationFilter || !hasLatestEditFilter || !hasStageFilter) {
                            return Promise.resolve({
                                data: null,
                                error: new Error('document fallback must filter by session, iteration, latest edit, and stage'),
                                count: 0,
                                status: 400,
                                statusText: 'Missing filters',
                            });
                        }

                        return Promise.resolve({
                            data: [fallbackContribution],
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
            mockDownloadFromStorage,
        );

        assertEquals(documents.length, 2);
        const ids = documents.map((doc) => doc.id).sort();
        assertEquals(ids, ['contribution-success-metrics', 'resource-success-metrics']);
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
            mockDownloadFromStorage,
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
            mockDownloadFromStorage,
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
            mockDownloadFromStorage,
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
            mockDownloadFromStorage,
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
            mockDownloadFromStorage,
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
                    mockDownloadFromStorage,
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
            mockDownloadFromStorage,
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
            mockDownloadFromStorage,
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
            mockDownloadFromStorage,
        );

        assertEquals(documents.length, 1);
        assertEquals(documents[0].id, projectResource.id);
    });
});