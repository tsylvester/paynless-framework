/**
 * Final-chunk assembly behavior: `assembleAndSaveFinalDocument` gating for `saveResponse`
 * (adapted from `executeModelCallAndSave.assembleDocument.test.ts`).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    DialecticJobRow,
    UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { FinishReason } from "../../_shared/types.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import type { SaveResponseDeps, SaveResponseParams } from "./saveResponse.interface.ts";
import { buildSaveResponsePayload, buildSaveResponseDeps } from "./saveResponse.mock.ts";
import { saveResponse } from "./saveResponse.ts";
import { loadJobContext } from "../loadJobContext/loadJobContext.ts";
import { assembleAiResponse } from "../assembleAiResponse/assembleAiResponse.ts";
import { debitForResponse } from "../debitForResponse/debitForResponse.ts";
import { prepareResponseContent } from "../prepareResponseContent/prepareResponseContent.ts";
import { retryJob } from "../retryJob/retryJob.ts";
import { saveContributionResponse } from "../saveContributionResponse/saveContributionResponse.ts";
import { saveCompressedResponse } from "../saveCompressedResponse/saveCompressedResponse.ts";
import { resolveContributionIdentity } from "../resolveContributionIdentity/resolveContributionIdentity.ts";
import { persistContributionRelationships } from "../persistContributionRelationships/persistContributionRelationships.ts";
import { finalizeContributionJob } from "../finalizeContributionJob/finalizeContributionJob.ts";
import { continueJob } from "../continueJob/continueJob.ts";
import { resolveFinishReason } from "../../_shared/utils/resolveFinishReason.ts";
import { isIntermediateChunk } from "../../_shared/utils/isIntermediateChunk.ts";
import { sanitizeJsonContent } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.ts";
import { determineContinuation } from "../../_shared/utils/determineContinuation/determineContinuation.ts";
import { buildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.ts";
import { buildSaveContributionResponseDeps } from "../saveContributionResponse/saveContributionResponse.mock.ts";
import { buildFinalizeContributionJobDeps } from "../finalizeContributionJob/finalizeContributionJob.mock.ts";
import { buildPrepareResponseContentDeps } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import { buildEnqueueRenderJobSuccessReturn } from "../enqueueRenderJob/enqueueRenderJob.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import {
    buildDialecticContributionRow,
    buildDialecticJobRow,
    buildDialecticExecuteJobPayload,
    buildTokenWalletRow,
    buildDialecticSessionRow,
    buildDocumentRelationships,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildAssembleAiResponseDeps } from "../assembleAiResponse/assembleAiResponse.mock.ts";
import { buildDebitForResponseDeps } from "../debitForResponse/debitForResponse.mock.ts";
import { buildSaveCompressedResponseDeps } from "../saveCompressedResponse/saveCompressedResponse.mock.ts";
import {
    mockNotificationService,
} from "../../_shared/utils/notification.service.mock.ts";
import type { BoundRetryJobFn } from "../retryJob/retryJob.interface.ts";
import type { BoundLoadJobContextFn } from "../loadJobContext/loadJobContext.interface.ts";
import type { BoundAssembleAiResponseFn } from "../assembleAiResponse/assembleAiResponse.interface.ts";
import type { BoundDebitForResponseFn } from "../debitForResponse/debitForResponse.interface.ts";
import type { BoundPrepareResponseContentFn } from "../prepareResponseContent/prepareResponseContent.interface.ts";
import type { BoundSaveContributionResponseFn } from "../saveContributionResponse/saveContributionResponse.interface.ts";
import type { BoundSaveCompressedResponseFn } from "../saveCompressedResponse/saveCompressedResponse.interface.ts";
import type { BoundFinalizeContributionJobFn } from "../finalizeContributionJob/finalizeContributionJob.interface.ts";
import type { BoundContinueJobFn } from "../continueJob/continueJob.interface.ts";
import type { BoundResolveContributionIdentityFn } from "../resolveContributionIdentity/resolveContributionIdentity.interface.ts";
import type { BoundPersistContributionRelationshipsFn } from "../persistContributionRelationships/persistContributionRelationships.interface.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const integrationLogger = new MockLogger();

const realBoundLoadJobContext: BoundLoadJobContextFn = (params, payload) =>
    loadJobContext({}, params, payload);

const realBoundAssembleAiResponse: BoundAssembleAiResponseFn = (params, payload) =>
    assembleAiResponse(buildAssembleAiResponseDeps(), params, payload);

const realBoundRetryJob: BoundRetryJobFn = (params, payload) =>
    retryJob({ logger: integrationLogger, notificationService: mockNotificationService }, params, payload);

const realBoundResolveContributionIdentity: BoundResolveContributionIdentityFn = (params, payload) =>
    resolveContributionIdentity({ logger: integrationLogger }, params, payload);

const realBoundPersistContributionRelationships: BoundPersistContributionRelationshipsFn = (params, payload) =>
    persistContributionRelationships({}, params, payload);

const realBoundContinueJob: BoundContinueJobFn = (params, payload) =>
    continueJob({ logger: integrationLogger }, params, payload);

const realBuildUploadContext = buildUploadContext;

const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });

function buildIntegrationDeps(
    finishReason: FinishReason,
    fileManager: MockFileManagerService,
): SaveResponseDeps {
    const fm = fileManager;
    const boundFinalize: BoundFinalizeContributionJobFn = (params, payload) =>
        finalizeContributionJob(
            buildFinalizeContributionJobDeps({
                logger: integrationLogger,
                notificationService: mockNotificationService,
                fileManager: fm,
                continueJob: realBoundContinueJob,
                enqueueRenderJob: enqueueRenderJobStub,
            }),
            params,
            payload,
        );
    const boundSaveContribution: BoundSaveContributionResponseFn = (params, payload) =>
        saveContributionResponse(
            buildSaveContributionResponseDeps({
                fileManager: fm,
                buildUploadContext: realBuildUploadContext,
                resolveContributionIdentity: realBoundResolveContributionIdentity,
                persistContributionRelationships: realBoundPersistContributionRelationships,
                finalizeContributionJob: boundFinalize,
            }),
            params,
            payload,
        );
    const boundPrepare: BoundPrepareResponseContentFn = (params, payload) =>
        prepareResponseContent(
            buildPrepareResponseContentDeps({
                logger: integrationLogger,
                resolveFinishReason: (_ai: UnifiedAIResponse) => finishReason,
                isIntermediateChunk,
                sanitizeJsonContent,
                determineContinuation,
            }),
            params,
            payload,
        );
    const boundSaveCompressed: BoundSaveCompressedResponseFn = (params, payload) =>
        saveCompressedResponse(
            buildSaveCompressedResponseDeps({
                fileManager: fm,
                buildUploadContext: realBuildUploadContext,
                enqueueRenderJob: enqueueRenderJobStub,
            }),
            params,
            payload,
        );
    const boundDebit: BoundDebitForResponseFn = (params, payload) =>
        debitForResponse(buildDebitForResponseDeps(), params, payload);
    const base = buildSaveResponseDeps();
    return {
        ...base,
        logger: integrationLogger,
        loadJobContext: realBoundLoadJobContext,
        assembleAiResponse: realBoundAssembleAiResponse,
        debitForResponse: boundDebit,
        prepareResponseContent: boundPrepare,
        saveContributionResponse: boundSaveContribution,
        saveCompressedResponse: boundSaveCompressed,
        retryJob: realBoundRetryJob,
    };
}

function buildMockSupabaseFromPayload(
    payload: DialecticExecuteJobPayload,
    jobRowOverrides: Partial<DialecticJobRow>,
) {
    if (!isJson(payload)) {
        throw new Error("test fixture: payload must be Json-compatible");
    }
    const jobRow = buildDialecticJobRow({
        ...jobRowOverrides,
        payload,
    });
    const mockSetup = createMockSupabaseClient("assemble-document-test", {
        genericMockResults: {
            dialectic_generation_jobs: {
                select: { data: [jobRow], error: null },
                update: { data: null, error: null },
                insert: { data: null, error: null },
            },
            ai_providers: {
                select: { data: [buildMockProvider()], error: null },
            },
            token_wallets: {
                select: { data: [buildTokenWalletRow()], error: null },
            },
            dialectic_sessions: {
                select: { data: [buildDialecticSessionRow()], error: null },
            },
            dialectic_contributions: {
                update: { data: null, error: null },
            },
            dialectic_project_resources: {
                update: { data: null, error: null },
            },
        },
    });
    return { mockSetup, jobRow };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument for final chunk with markdown document (root relationships normalize to contribution id)",
    async () => {
        const rootContributionId: string = "root-contrib-123";
        const savedContribution: DialecticContributionRow = buildDialecticContributionRow({
            document_relationships: {
                source_group: "550e8400-e29b-41d4-a716-446655440000",
                thesis: rootContributionId,
            },
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
        const markdownPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: {
                source_group: "550e8400-e29b-41d4-a716-446655440000",
                thesis: rootContributionId,
            },
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(markdownPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps: SaveResponseDeps = buildIntegrationDeps("stop", fileManager);
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: '{"content": "AI response"}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called when persisted stage relationship equals contribution id (single effective root chunk)",
        );
    },
);

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument for final JSON-only chunk when rootIdFromSaved equals contribution id",
    async () => {
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
        const jsonOnlyPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.HeaderContext,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(jsonOnlyPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps: SaveResponseDeps = buildIntegrationDeps("stop", fileManager);
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content:
                    '{"header": "Header Context", "context": {"key": "value"}}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called for single-chunk JSON artifacts (rootIdFromSaved === contribution.id)",
        );
    },
);

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument for non-final chunk (resolvedFinish !== stop)",
    async () => {
        const rootContributionId: string = "root-contrib-789";
        const savedContribution: DialecticContributionRow = buildDialecticContributionRow({
            id: "contrib-continuation-1",
            document_relationships: {
                thesis: rootContributionId,
                source_group: "550e8400-e29b-41d4-a716-446655440001",
            },
            target_contribution_id: rootContributionId,
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
        const continuationPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.HeaderContext,
            target_contribution_id: rootContributionId,
            continueUntilComplete: true,
            continuation_count: 1,
            document_relationships: {
                thesis: rootContributionId,
                source_group: "550e8400-e29b-41d4-a716-446655440001",
            },
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(continuationPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps: SaveResponseDeps = buildIntegrationDeps("length", fileManager);
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: '{"content": "Partial AI response"}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called for non-final chunks (resolvedFinish !== stop)",
        );
    },
);

Deno.test(
    "saveResponse — should NOT call assembleAndSaveFinalDocument when document_relationships on saved record is null (no rootIdFromSaved after persistence rules)",
    async () => {
        const savedContribution: DialecticContributionRow = buildDialecticContributionRow({
            document_relationships: null,
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
        const jsonOnlyPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.HeaderContext,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(jsonOnlyPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps: SaveResponseDeps = buildIntegrationDeps("stop", fileManager);
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content:
                    '{"header": "Header Context", "context": {"key": "value"}}',
            }),
        );
        assertEquals(
            fileManager.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called when document_relationships cannot yield rootIdFromSaved distinct from contribution id",
        );
    },
);
