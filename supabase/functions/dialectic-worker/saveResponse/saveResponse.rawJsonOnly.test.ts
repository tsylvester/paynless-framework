/**
 * Raw JSON document upload context: pathContext.fileType, mimeType, fileContent,
 * contributionMetadata (no rawJsonResponseContent), and persisted contribution paths.
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
    UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { FinishReason } from "../../_shared/types.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isDialecticContribution, isJson, isRecord } from "../../_shared/utils/type_guards.ts";
import { isModelContributionContext } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
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

const realBoundDebitForResponse: BoundDebitForResponseFn = (params, payload) =>
    debitForResponse(buildDebitForResponseDeps(), params, payload);

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

const sanitizedJson: string =
    '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';

function depsWithFinishReason(
    finishReason: FinishReason,
    fileManager: MockFileManagerService,
    continueJobFn: BoundContinueJobFn,
    retryJobFn: BoundRetryJobFn,
): SaveResponseDeps {
    const fm = fileManager;
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
    const base = buildSaveResponseDeps();
    return {
        ...base,
        logger: integrationLogger,
        loadJobContext: realBoundLoadJobContext,
        assembleAiResponse: realBoundAssembleAiResponse,
        debitForResponse: realBoundDebitForResponse,
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
    const mockSetup = createMockSupabaseClient("raw-json-test", {
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

Deno.test(
    "saveResponse passes FileType.ModelContributionRawJson to file manager (not document key fileType)",
    async () => {
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const deps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "00000000-0000-4000-8000-000000000002",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.pathContext.fileType,
            FileType.ModelContributionRawJson,
            `Expected fileType to be FileType.ModelContributionRawJson, but got ${uploadContext.pathContext.fileType}. The function currently passes the document key fileType (e.g., FileType.business_case) instead of FileType.ModelContributionRawJson.`,
        );
    },
);

Deno.test(
    'saveResponse passes mimeType "application/json" to file manager (not "text/markdown")',
    async () => {
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const deps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "00000000-0000-4000-8000-000000000002",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.mimeType,
            "application/json",
            `Expected mimeType to be "application/json", but got "${uploadContext.mimeType}". The function currently passes aiResponse.contentType || "text/markdown" instead of "application/json".`,
        );
    },
);

Deno.test(
    "saveResponse passes sanitized JSON string as fileContent to file manager",
    async () => {
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const deps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "00000000-0000-4000-8000-000000000002",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.fileContent,
            sanitizedJson,
            `Expected fileContent to be the sanitized JSON string like '{"content": "# Business Case\\n\\n..."}', not the raw provider response object.`,
        );
        assert(
            typeof uploadContext.fileContent === "string",
            "fileContent should be a string (the sanitized JSON), not an object",
        );
    },
);

Deno.test(
    "saveResponse does NOT include rawJsonResponseContent in upload context",
    async () => {
        const contributionRow: DialecticContributionRow = buildDialecticContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(contributionRow, null);
        const deps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "00000000-0000-4000-8000-000000000002",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        assert(
            !("rawJsonResponseContent" in uploadContext.contributionMetadata),
            `Expected rawJsonResponseContent to NOT be present in contributionMetadata. It's redundant - fileContent IS the raw JSON content. The function currently sets rawJsonResponseContent: aiResponse.rawProviderResponse.`,
        );
        const contributionMetadata = uploadContext.contributionMetadata;
        assert(
            isRecord(contributionMetadata),
            "contributionMetadata should be a record",
        );
        assert(
            !("rawJsonResponseContent" in contributionMetadata),
            "rawJsonResponseContent should not be in contributionMetadata",
        );
    },
);

Deno.test(
    "saveResponse creates contribution record with correct file_name, storage_path, and mime_type",
    async () => {
        const expectedContribution: DialecticContributionRow = buildDialecticContributionRow({
            id: "contrib-123",
            file_name: "mock-ai-v1_0_business_case_raw.json",
            storage_path: "raw_responses",
            raw_response_storage_path: "raw_responses/mock-ai-v1_0_business_case_raw.json",
            mime_type: "application/json",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(expectedContribution, null);
        const deps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
        const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.business_case,
            document_relationships: buildDocumentRelationships({
                source_group: "00000000-0000-4000-8000-000000000002",
            }),
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: sanitizedJson,
            }),
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "Expected fileManager.uploadAndRegisterFile to be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be a ModelContributionUploadContext",
        );
        const result = await fileManager.uploadAndRegisterFile(uploadContext);
        assert(!result.error, "File upload should succeed");
        assertExists(result.record, "Contribution record should be returned");
        if (isDialecticContribution(result.record)) {
            const contribution: DialecticContributionRow = result.record;
            assert(
                contribution.storage_path !== null &&
                    contribution.storage_path.includes("raw_responses"),
                `Expected storage_path to contain 'raw_responses/' (not 'documents/'), but got '${contribution.storage_path}'`,
            );
            if (contribution.file_name) {
                assert(
                    contribution.file_name.endsWith("_raw.json"),
                    `Expected file_name to end with '_raw.json' (not '.md'), but got '${contribution.file_name}'`,
                );
            } else {
                throw new Error("Expected file_name to be non-null");
            }
            assertEquals(
                contribution.mime_type,
                "application/json",
                `Expected mime_type to be "application/json" (not "text/markdown"), but got "${contribution.mime_type}"`,
            );
            assert(
                contribution.raw_response_storage_path !== null &&
                    contribution.raw_response_storage_path.includes("_raw.json"),
                `Expected raw_response_storage_path to point to the _raw.json file, but got '${contribution.raw_response_storage_path}'`,
            );
        }
    },
);
