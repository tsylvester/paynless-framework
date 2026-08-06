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
    SourceDocument,
    DialecticProjectResourceRow,
    InputRule,
    DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import type { IPlanJobContext } from './createJobContext/JobContext.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { planComplexStage } from './task_isolator.ts';
import { findSourceDocuments } from './findSourceDocuments.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { DialecticStageSlug, FileType } from '../_shared/types/file_manager.types.ts';
import { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { isDialecticExecuteJobPayload } from '../_shared/utils/type_guards.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { createPlanJobContext } from './createJobContext/createJobContext.ts';
import { createMockRootContext } from './createJobContext/JobContext.mock.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import {
    buildDialecticJobRow,
    buildDialecticPlanJobPayload,
    buildDialecticStageRecipeStep,
    buildSourceDocument,
    buildDialecticExecuteJobPayload,
} from '../_shared/dialectic.mock.ts';

describe('planComplexStage - Source Document Filtering', () => {
    // Filtering with completed IDs - doc1 and doc3 excluded, only doc2 passed
    it('should filter out completed source documents when completedSourceDocumentIds is provided', async () => {
        // Contract: When completedSourceDocumentIds is a non-empty Set containing
        // 'doc-1-id' and 'doc-3-id', planComplexStage filters out source documents
        // whose source_group matches those identifiers. Only the document with
        // source_group 'doc-2-id' survives to the planner, which creates one
        // execute child job carrying that document's relationships.

        // Arrange:
        // 1. Build a valid parent job row and payload.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: DialecticStageSlug.Thesis,
        });

        const parentPayload = buildDialecticPlanJobPayload({
            stageSlug: DialecticStageSlug.Thesis,
            user_jwt: 'user-jwt-123',
        });
        if (!isJson(parentPayload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }

        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload: parentPayload,
        };

        // 2. Build a valid recipe step with inputs_required for documents.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-uuid',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 3. Build three source documents with distinct source_group identifiers.
        //    doc-1 and doc-3 will be marked completed; doc-2 will survive.
        const doc1 = buildSourceDocument({
            id: 'doc-1',
            document_relationships: { source_group: 'doc-1-id' },
        });
        const doc2 = buildSourceDocument({
            id: 'doc-2',
            document_relationships: { source_group: 'doc-2-id' },
        });
        const doc3 = buildSourceDocument({
            id: 'doc-3',
            document_relationships: { source_group: 'doc-3-id' },
        });

        const findSourceDocuments = async (): Promise<SourceDocument[]> => [
            doc1,
            doc2,
            doc3,
        ];

        // 4. Build a planner that creates one execute payload per source document,
        //    carrying each document's relationships onto the payload.
        const planner: GranularityPlannerFn = (sourceDocs: SourceDocument[]) => {
            return sourceDocs.map((doc): DialecticExecuteJobPayload => {
                const payload = buildDialecticExecuteJobPayload({
                    stageSlug: DialecticStageSlug.Thesis,
                    document_relationships: doc.document_relationships ?? null,
                });
                return payload;
            });
        };

        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext({
            findSourceDocuments,
            getGranularityPlanner: () => planner,
        });
        const ctx = createPlanJobContext(rootCtx);

        // 5. Build the completedSourceDocumentIds Set marking doc-1 and doc-3 as completed.
        const completedSourceDocumentIds = new Set<string>(['doc-1-id', 'doc-3-id']);

        // Act:
        const result = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            ctx,
            recipeStep,
            'user-jwt-123',
            completedSourceDocumentIds,
        );

        // Assert:
        // 1. Exactly one child job was created — only doc-2 survived the filter.
        assertEquals(result.length, 1, 'only the non-completed document should produce a child job');

        // 2. The child payload is a valid execute payload carrying doc-2's source_group.
        const payload = result[0].payload;
        assert(isDialecticExecuteJobPayload(payload), 'child payload should be a valid DialecticExecuteJobPayload');
        assert(payload.document_relationships !== null, 'child payload should carry document_relationships');
        if (payload.document_relationships) {
            assertEquals(payload.document_relationships.source_group, 'doc-2-id', 'child payload should carry the surviving document\'s source_group');
        }
    });

    /**
     * Contract: given completedSourceDocumentIds containing every source document's
     *   source_group, all documents are filtered out and no child jobs are created.
     * Arrange: two source documents whose source_groups both appear in the Set.
     * Act:     planComplexStage with the completed Set.
     * Assert:  result is empty — zero child jobs.
     */
    it('should create no child jobs when all source documents are completed', async () => {
        // Arrange
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: DialecticStageSlug.Thesis,
        });
        const parentPayload = buildDialecticPlanJobPayload({
            stageSlug: DialecticStageSlug.Thesis,
            user_jwt: 'user-jwt-123',
        });
        if (!isJson(parentPayload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }
        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload: parentPayload,
        };

        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-uuid',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        const doc1 = buildSourceDocument({
            id: 'resource-1',
            document_relationships: { source_group: 'resource-1-id' },
        });
        const doc2 = buildSourceDocument({
            id: 'resource-2',
            document_relationships: { source_group: 'resource-2-id' },
        });

        const findSourceDocuments = async (): Promise<SourceDocument[]> => [doc1, doc2];

        const planner: GranularityPlannerFn = (sourceDocs: SourceDocument[]) => {
            return sourceDocs.map((doc): DialecticExecuteJobPayload => {
                return buildDialecticExecuteJobPayload({
                    stageSlug: DialecticStageSlug.Thesis,
                    document_relationships: doc.document_relationships ?? null,
                });
            });
        };

        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext({
            findSourceDocuments,
            getGranularityPlanner: () => planner,
        });
        const ctx = createPlanJobContext(rootCtx);

        const completedSourceDocumentIds = new Set<string>(['resource-1-id', 'resource-2-id']);

        // Act
        const result = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            ctx,
            recipeStep,
            'user-jwt-123',
            completedSourceDocumentIds,
        );

        // Assert
        assertEquals(result.length, 0, 'no child jobs should be created when all source documents are completed');
    });
});

