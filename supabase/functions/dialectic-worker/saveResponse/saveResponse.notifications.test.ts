/**
 * Job lifecycle notifications for saveResponse (`execute_chunk_completed`;
 * `execute_completed` is emitted here on terminal success per split architecture).
 */
import {
    assert,
    assertEquals,
    assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    DialecticJobRow,
    DocumentRelationships,
    UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { FinishReason } from "../../_shared/types.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import {
    ExecuteChunkCompletedPayload,
    ExecuteCompletedPayload,
} from "../../_shared/types/notification.service.types.ts";
import {
    mockNotificationService,
    resetMockNotificationService,
} from "../../_shared/utils/notification.service.mock.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { saveResponse } from "./saveResponse.ts";
import type { SaveResponseDeps, SaveResponseParams } from "./saveResponse.interface.ts";
import { buildSaveResponsePayload, buildSaveResponseDeps } from "./saveResponse.mock.ts";
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

const defaultNotificationPayload = buildSaveResponsePayload({
    assembled_content: '{"ok": true}',
    finish_reason: "stop",
});

interface IntegrationDepsOptions {
    finishReason: FinishReason;
    fileManager: MockFileManagerService;
    continueJobFn?: BoundContinueJobFn;
    retryJobFn?: BoundRetryJobFn;
    isIntermediateChunkFn?: typeof isIntermediateChunk;
    debitForResponseFn?: BoundDebitForResponseFn;
}

function buildIntegrationDeps(options: IntegrationDepsOptions): SaveResponseDeps {
    const fm = options.fileManager;
    const finishReason = options.finishReason;
    const continueJobFn = options.continueJobFn ?? realBoundContinueJob;
    const retryJobFn = options.retryJobFn ?? realBoundRetryJob;
    const isIntermediateChunkFn = options.isIntermediateChunkFn ?? isIntermediateChunk;

    const boundFinalize: BoundFinalizeContributionJobFn = (params, payload) =>
        finalizeContributionJob(
            buildFinalizeContributionJobDeps({
                logger: integrationLogger,
                notificationService: mockNotificationService,
                fileManager: fm,
                continueJob: continueJobFn,
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
                isIntermediateChunk: isIntermediateChunkFn,
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
    const boundDebit: BoundDebitForResponseFn = options.debitForResponseFn
        ? options.debitForResponseFn
        : (params, payload) =>
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
        retryJob: retryJobFn,
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
    const mockSetup = createMockSupabaseClient("notifications-test", {
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

function countJobNotificationType(
    type: ExecuteChunkCompletedPayload["type"] | ExecuteCompletedPayload["type"],
): number {
    let count = 0;
    const calls = mockNotificationService.sendJobNotificationEvent.calls;
    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const first: unknown = call.args[0];
        if (
            isRecord(first) &&
            "type" in first &&
            first.type === type
        ) {
            count += 1;
        }
    }
    return count;
}

function callsWithJobNotificationType(
    type: ExecuteChunkCompletedPayload["type"] | ExecuteCompletedPayload["type"],
): typeof mockNotificationService.sendJobNotificationEvent.calls {
    return mockNotificationService.sendJobNotificationEvent.calls.filter((c) => {
        const p: unknown = c.args[0];
        return isRecord(p) && "type" in p && p.type === type;
    });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

Deno.test(
    "saveResponse - notifications: execute_chunk_completed emitted for final chunk",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps({
            finishReason: "stop",
            fileManager,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        const chunkCalls = callsWithJobNotificationType("execute_chunk_completed");
        assertEquals(
            chunkCalls.length,
            1,
            "Expected one execute_chunk_completed emission for final chunk",
        );
        const firstCall = chunkCalls[0];
        assertExists(firstCall, "Expected notification call");
        const [payloadArg, targetUserId] = firstCall.args;
        const expected: ExecuteChunkCompletedPayload = {
            sessionId: "test-session-id",
            stageSlug: "thesis",
            job_id: "a0000002-0000-4000-a000-000000000002",
            step_key: "business_case",
            document_key: "business_case",
            modelId: "test-model-id",
            iterationNumber: 1,
            type: "execute_chunk_completed",
        };
        assertEquals(payloadArg, expected);
        assertEquals(targetUserId, "test-user-id", "targetUserId must equal project owner on job row");
    },
);

Deno.test(
    "saveResponse - notifications: execute_chunk_completed emitted with all required fields when continuation chunk and document-related",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            continueUntilComplete: true,
            continuation_count: 2,
            target_contribution_id: "root-123",
            document_relationships: {
                source_group: "550e8400-e29b-41d4-a716-446655440000",
                thesis: "root-123",
            } as DocumentRelationships,
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps({
            finishReason: "length",
            fileManager,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        const chunkCalls = callsWithJobNotificationType("execute_chunk_completed");
        assertEquals(
            chunkCalls.length,
            1,
            "Expected one execute_chunk_completed emission",
        );
        const firstCall = chunkCalls[0];
        assertExists(firstCall, "Expected notification call");
        const [payloadArg, targetUserId] = firstCall.args;
        const expected: ExecuteChunkCompletedPayload = {
            sessionId: "test-session-id",
            stageSlug: "thesis",
            job_id: "a0000002-0000-4000-a000-000000000002",
            step_key: "business_case",
            document_key: "business_case",
            modelId: "test-model-id",
            iterationNumber: 1,
            type: "execute_chunk_completed",
        };
        assertEquals(payloadArg, expected);
        assertEquals(targetUserId, "test-user-id", "targetUserId must equal project owner on job row");
    },
);

Deno.test(
    "saveResponse - notifications: no sendJobNotificationEvent when output type is non-document (HeaderContext)",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow({
            contribution_type: "header_context",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps({
            finishReason: "stop",
            fileManager,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(
            mockNotificationService.sendJobNotificationEvent.calls.length,
            0,
            "Expected no sendJobNotificationEvent when output type is HeaderContext (non-document)",
        );
    },
);

Deno.test(
    "saveResponse - notifications: no job notification when project owner user_id on job row is empty",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, { user_id: "" });
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps({
            finishReason: "stop",
            fileManager,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(
            mockNotificationService.sendJobNotificationEvent.calls.length,
            0,
            "Expected no sendJobNotificationEvent when project owner user_id is empty",
        );
    },
);

Deno.test(
    "saveResponse - notifications: all sendJobNotificationEvent calls include targetUserId as second argument",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const projectOwnerUserId = "owner-user-456";
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, { user_id: projectOwnerUserId });
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps({
            finishReason: "stop",
            fileManager,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        const allCalls = mockNotificationService.sendJobNotificationEvent.calls;
        assert(
            allCalls.length >= 1,
            "At least one notification expected",
        );
        for (
            let i = 0;
            i < allCalls.length;
            i++
        ) {
            const call = allCalls[i];
            assertExists(call, "Call entry must exist");
            const args = call.args;
            assertExists(args[1], "Second argument (targetUserId) must be present");
            assertEquals(
                args[1],
                projectOwnerUserId,
                "targetUserId must equal job row user_id",
            );
        }
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed emitted exactly once on terminal success",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps({
            finishReason: "stop",
            fileManager,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 1);
        const calls = mockNotificationService.sendJobNotificationEvent.calls.filter(
            (c) => {
                const p: unknown = c.args[0];
                return isRecord(p) && p.type === "execute_completed";
            },
        );
        assertEquals(calls.length, 1);
        const [payloadArg, targetUserId] = calls[0].args;
        const expected: ExecuteCompletedPayload = {
            sessionId: "test-session-id",
            stageSlug: "thesis",
            job_id: "a0000002-0000-4000-a000-000000000002",
            step_key: "business_case",
            document_key: "business_case",
            modelId: "test-model-id",
            iterationNumber: 1,
            type: "execute_completed",
        };
        assertEquals(payloadArg, expected);
        assertEquals(targetUserId, "test-user-id");
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed not emitted on needs_continuation path",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const continueJobStub: BoundContinueJobFn = async () => ({ enqueued: true });
        const deps = buildIntegrationDeps({
            finishReason: "length",
            fileManager,
            isIntermediateChunkFn: () => true,
            continueJobFn: continueJobStub,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 0);
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed not emitted on retriable error path",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const failingDebit: BoundDebitForResponseFn = async () => ({
            error: new Error("debit failed"),
            retriable: true,
        });
        const deps = buildIntegrationDeps({
            finishReason: "stop",
            fileManager,
            debitForResponseFn: failingDebit,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 0);
    },
);

Deno.test(
    "saveResponse - notifications: execute_completed not emitted on unretriable error path",
    async () => {
        resetMockNotificationService();
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "550e8400-e29b-41d4-a716-446655440000",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const failingDebit: BoundDebitForResponseFn = async () => ({
            error: new Error("debit failed"),
            retriable: false,
        });
        const deps = buildIntegrationDeps({
            finishReason: "stop",
            fileManager,
            debitForResponseFn: failingDebit,
        });
        await saveResponse(deps, params, defaultNotificationPayload);
        assertEquals(countJobNotificationType("execute_completed"), 0);
    },
);
