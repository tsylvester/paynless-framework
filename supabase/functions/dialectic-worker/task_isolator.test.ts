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
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    GranularityPlannerFn,
    IDialecticJobDeps,
    SourceDocument,
    DialecticProjectResourceRow,
    InputRule,
    DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { planComplexStage, findSourceDocuments } from './task_isolator.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { isDialecticExecuteJobPayload } from '../_shared/utils/type_guards.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';

describe('planComplexStage - Source Document Filtering', () => {
    let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
    let mockLogger: ILogger;
    let mockDeps: IDialecticJobDeps;
    let mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload };
    let mockRecipeStep: DialecticRecipeStep;

    beforeEach(() => {
        mockLogger = {
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
        };

        mockSupabase = createMockSupabaseClient();

        mockParentJob = {
            id: 'parent-job-123',
            parent_job_id: null,
            session_id: 'sess-1',
            user_id: 'user-123',
            iteration_number: 1,
            status: 'processing',
            max_retries: 3,
            attempt_count: 0,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            completed_at: null,
            results: null,
            error_details: null,
            prerequisite_job_id: null,
            target_contribution_id: null,
            is_test_job: false,
            job_type: 'PLAN',
            stage_slug: 'test-stage',
            payload: {
                job_type: 'PLAN',
                projectId: 'proj-1',
                sessionId: 'sess-1',
                stageSlug: 'test-stage',
                iterationNumber: 1,
                walletId: 'wallet-1',
                user_jwt: 'user-jwt-123',
                model_id: 'model-1',
            },
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
            inputs_required: [{ type: 'document', slug: 'any', multiple: true }],
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

        const mockPlanner: GranularityPlannerFn = (sourceDocs: SourceDocument[]) => {
            return sourceDocs.map((doc): DialecticExecuteJobPayload => ({
                job_type: 'execute',
                projectId: 'proj-1',
                sessionId: 'sess-1',
                stageSlug: 'test-stage',
                iterationNumber: 1,
                walletId: 'wallet-1',
                user_jwt: 'user-jwt-123',
                model_id: 'model-1',
                prompt_template_id: 'test-prompt-uuid',
                output_type: FileType.business_case,
                canonicalPathParams: {
                    contributionType: 'thesis',
                    stageSlug: 'test-stage',
                },
                inputs: {},
                document_relationships: doc.document_relationships ?? null,
            }));
        };

        mockDeps = {
            logger: mockLogger,
            planComplexStage: () => Promise.resolve([]),
            downloadFromStorage: (): Promise<DownloadStorageResult> => {
                const encoded = new TextEncoder().encode('test content');
                const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
                const arrayBuffer: ArrayBuffer = buffer instanceof ArrayBuffer ? buffer : new ArrayBuffer(0);
                return Promise.resolve({
                    data: arrayBuffer,
                    error: null,
                });
            },
            getGranularityPlanner: () => mockPlanner,
            ragService: undefined,
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

    // 45.c.i: Filtering with completed IDs - doc1 and doc3 excluded, only doc2 passed
    it('should filter out completed source documents when completedSourceDocumentIds is provided', async () => {
        const mockProjectResources: DialecticProjectResourceRow[] = [
            {
                id: 'doc-1',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc1.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc1',
                    document_relationships: { source_group: 'doc-1-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
            {
                id: 'doc-2',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc2.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc2',
                    document_relationships: { source_group: 'doc-2-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
            {
                id: 'doc-3',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc3.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc3',
                    document_relationships: { source_group: 'doc-3-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
        ];

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: 'OK' }),
                },
            },
        });

        const completedSourceDocumentIds = new Set<string>(['doc-1-id', 'doc-3-id']);

        const result = await planComplexStage(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123',
            completedSourceDocumentIds,
        );

        assertEquals(result.length, 1);
        const payload = result[0].payload;
        assert(isDialecticExecuteJobPayload(payload));
        assert(payload.document_relationships !== null);
        if (payload.document_relationships) {
            assertEquals(payload.document_relationships.source_group, 'doc-2-id');
        }
    });

    // 45.c.ii: Empty Set - all documents passed
    it('should pass all source documents to planner when completedSourceDocumentIds is empty', async () => {
        const mockProjectResources: DialecticProjectResourceRow[] = [
            {
                id: 'doc-1',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc1.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc1',
                    document_relationships: { source_group: 'doc-1-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
            {
                id: 'doc-2',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc2.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc2',
                    document_relationships: { source_group: 'doc-2-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
        ];

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: 'OK' }),
                },
            },
        });

        const completedSourceDocumentIds = new Set<string>();

        const result = await planComplexStage(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123',
            completedSourceDocumentIds,
        );

        assertEquals(result.length, 2);
    });

    // 45.c.iii: Undefined parameter - all documents passed (backward compatibility)
    it('should pass all source documents to planner when completedSourceDocumentIds is undefined', async () => {
        const mockProjectResources: DialecticProjectResourceRow[] = [
            {
                id: 'doc-1',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc1.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc1',
                    document_relationships: { source_group: 'doc-1-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
            {
                id: 'doc-2',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc2.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc2',
                    document_relationships: { source_group: 'doc-2-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
        ];

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: 'OK' }),
                },
            },
        });

        const result = await planComplexStage(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123',
        );

        assertEquals(result.length, 2);
    });

    // 45.c.iv: Missing/invalid source_group throws error
    it('should throw an error for source documents without valid source_group', async () => {
        const mockProjectResources: DialecticProjectResourceRow[] = [
            {
                id: 'doc-1',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc1.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc1',
                    document_relationships: null,
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
        ];

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: 'OK' }),
                },
            },
        });

        const completedSourceDocumentIds = new Set<string>(['some-id']);

        await assertRejects(
            () => planComplexStage(
                mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
                mockParentJob,
                mockDeps,
                mockRecipeStep,
                'user-jwt-123',
                completedSourceDocumentIds,
            ),
            Error,
            'extractSourceDocumentIdentifier requires document_relationships',
        );
    });

    // 45.c.v: Non-matching identifiers - all documents passed
    it('should pass all source documents when completedSourceDocumentIds contains non-matching identifiers', async () => {
        const mockProjectResources: DialecticProjectResourceRow[] = [
            {
                id: 'doc-1',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc1.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc1',
                    document_relationships: { source_group: 'doc-1-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
            {
                id: 'doc-2',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'doc2.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 123,
                resource_description: {
                    type: 'document',
                    document_key: 'doc2',
                    document_relationships: { source_group: 'doc-2-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
        ];

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: 'OK' }),
                },
            },
        });

        const completedSourceDocumentIds = new Set<string>(['non-matching-id-1', 'non-matching-id-2']);

        const result = await planComplexStage(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123',
            completedSourceDocumentIds,
        );

        assertEquals(result.length, 2);
    });

    // 45.c.vi: Resources can be filtered (document-type inputs now only use resources)
    it('should filter source documents from project_resources', async () => {
        const mockProjectResources: DialecticProjectResourceRow[] = [
            {
                id: 'resource-1',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'resource1.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 456,
                resource_description: {
                    type: 'document',
                    document_key: 'resource1',
                    document_relationships: { source_group: 'resource-1-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
            {
                id: 'resource-2',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'resource2.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 456,
                resource_description: {
                    type: 'document',
                    document_key: 'resource2',
                    document_relationships: { source_group: 'resource-2-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
        ];

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: 'OK' }),
                },
            },
        });

        const completedSourceDocumentIds = new Set<string>(['resource-1-id']);

        const result = await planComplexStage(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123',
            completedSourceDocumentIds,
        );

        assertEquals(result.length, 1);
        const payload = result[0].payload;
        assert(isDialecticExecuteJobPayload(payload));
        assert(payload.document_relationships !== null);
        if (payload.document_relationships) {
            assertEquals(payload.document_relationships.source_group, 'resource-2-id');
        }
    });

    // 45.c.vii: mapResourceToSourceDocument preserves document_relationships
    it('should preserve document_relationships when mapping DialecticProjectResourceRow to SourceDocument', async () => {
        // VERIFY: This test explicitly verifies that document_relationships is extracted
        // from the NESTED location: row.resource_description.document_relationships
        const mockProjectResource: DialecticProjectResourceRow = {
            id: 'resource-1',
            project_id: 'proj-1',
            user_id: 'user-123',
            file_name: 'resource1.txt',
            storage_bucket: 'test-bucket',
            storage_path: 'projects/proj-1/resources',
            mime_type: 'text/plain',
            size_bytes: 456,
            resource_description: {
                document_relationships: { source_group: 'test-id' },
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: 1,
            resource_type: 'rendered_document',
            session_id: 'sess-1',
            source_contribution_id: null,
            stage_slug: 'test-stage',
        };

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: [mockProjectResource], error: null, count: 1, status: 200, statusText: 'OK' }),
                },
            },
        });

        const sourceDocuments = await findSourceDocuments(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            [{ type: 'document', slug: 'any' }],
        );

        assertEquals(sourceDocuments.length, 1);
        const sourceDoc = sourceDocuments[0];
        assert(sourceDoc.document_relationships !== null);
        if (sourceDoc.document_relationships) {
            // VERIFY: The source_group was extracted from resource_description.document_relationships
            assertEquals(sourceDoc.document_relationships.source_group, 'test-id');
            // VERIFY: The value matches the nested location in the source row
            const resourceDesc = mockProjectResource.resource_description;
            if (resourceDesc && typeof resourceDesc === 'object' && 'document_relationships' in resourceDesc) {
                const nestedDocRels = resourceDesc.document_relationships;
                if (nestedDocRels && typeof nestedDocRels === 'object' && 'source_group' in nestedDocRels) {
                    assertEquals(
                        sourceDoc.document_relationships.source_group,
                        nestedDocRels.source_group,
                    );
                }
            }
        }
    });

    // 45.c.viii: mapContributionToSourceDocument preserves document_relationships
    it('should preserve document_relationships when mapping DialecticContributionRow to SourceDocument', async () => {
        // VERIFY: This test explicitly verifies that document_relationships is extracted
        // from the DIRECT column: row.document_relationships (not nested)
        // NOTE: This test uses header_context type since document-type inputs now only use resources
        const mockContribution: DialecticContributionRow = {
            id: 'contribution-1',
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
            size_bytes: 123,
            mime_type: 'application/json',
            document_relationships: { source_group: 'test-id' }, // Direct column, not nested
            is_header: true,
            source_prompt_resource_id: null,
        };

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_contributions: {
                    select: () => Promise.resolve({ data: [mockContribution], error: null, count: 1, status: 200, statusText: 'OK' }),
                },
            },
        });

        const sourceDocuments = await findSourceDocuments(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            [{ type: 'header_context', slug: 'test-stage' }],
        );

        assertEquals(sourceDocuments.length, 1);
        const sourceDoc = sourceDocuments[0];
        assert(sourceDoc.document_relationships !== null);
        if (sourceDoc.document_relationships) {
            // VERIFY: The source_group was extracted from the direct document_relationships column
            assertEquals(sourceDoc.document_relationships.source_group, 'test-id');
            // VERIFY: The value matches the direct column in the source row
            if (mockContribution.document_relationships && typeof mockContribution.document_relationships === 'object' && 'source_group' in mockContribution.document_relationships) {
                assertEquals(
                    sourceDoc.document_relationships.source_group,
                    mockContribution.document_relationships.source_group,
                );
            }
        }
    });

    // 45.c.ix: Multiple resources filtering works correctly
    it('should filter multiple source documents correctly based on their source_group values', async () => {
        const mockProjectResources: DialecticProjectResourceRow[] = [
            {
                id: 'resource-1',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'resource1.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 456,
                resource_description: {
                    type: 'document',
                    document_key: 'resource1',
                    document_relationships: { source_group: 'resource-1-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
            {
                id: 'resource-2',
                project_id: 'proj-1',
                user_id: 'user-123',
                file_name: 'resource2.txt',
                storage_bucket: 'test-bucket',
                storage_path: 'projects/proj-1/resources',
                mime_type: 'text/plain',
                size_bytes: 456,
                resource_description: {
                    type: 'document',
                    document_key: 'resource2',
                    document_relationships: { source_group: 'resource-2-id' },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                iteration_number: 1,
                resource_type: 'rendered_document',
                session_id: 'sess-1',
                source_contribution_id: null,
                stage_slug: 'test-stage',
            },
        ];

        const mockSupabaseWithData = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_project_resources: {
                    select: () => Promise.resolve({ data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: 'OK' }),
                },
            },
        });

        const completedSourceDocumentIds = new Set<string>(['resource-1-id', 'resource-2-id']);

        const result = await planComplexStage(
            mockSupabaseWithData.client as unknown as SupabaseClient<Database>,
            mockParentJob,
            mockDeps,
            mockRecipeStep,
            'user-jwt-123',
            completedSourceDocumentIds,
        );

        assertEquals(result.length, 0);
    });
});

