/**
 * HeaderContext plan output: saved JSON shape, type-guard rejection paths, and
 * contribution / pathContext fileType (post-stream; assembled_content carries JSON).
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
    HeaderContext,
    UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { FinishReason } from "../../_shared/types.ts";
import { MockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isRecord } from "../../_shared/utils/type_guards.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { isHeaderContext } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isModelContributionContext } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import type { SaveResponseDeps, SaveResponseParams, SaveResponseReturn } from "./saveResponse.interface.ts";
import { buildSaveResponsePayload, buildSaveResponseDeps } from "./saveResponse.mock.ts";
import { isSaveResponseSuccessReturn } from "./saveResponse.guard.ts";
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
    buildHeaderContext,
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
    const mockSetup = createMockSupabaseClient("plan-validation-test", {
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
    "saveResponse — plan validation — header_context saves with context_for_documents and no files_to_generate",
    async () => {
        const validHeaderContext: HeaderContext = buildHeaderContext();
        const headerJson: string = JSON.stringify(validHeaderContext);
        const savedContribution: DialecticContributionRow = buildDialecticContributionRow({
            contribution_type: "header_context",
            file_name: "header_context.json",
            mime_type: "application/json",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
        const jobPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.HeaderContext,
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(jobPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps("stop", fileManager);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return for valid header_context save",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(isRecord(uploadContext), "Upload context should be a record");
        assertExists(uploadContext.fileContent, "Upload context should have fileContent");
        assert(typeof uploadContext.fileContent === "string", "fileContent must be a string");
        assert(
            uploadContext.fileContent.includes("context_for_documents"),
            "Saved content should contain context_for_documents",
        );
        assert(
            !uploadContext.fileContent.includes("files_to_generate"),
            "Saved content should NOT contain files_to_generate",
        );
    },
);

Deno.test(
    "saveResponse — plan validation — header_context with files_to_generate fails isHeaderContext",
    async () => {
        const invalidHeaderContext = {
            ...buildHeaderContext(),
            files_to_generate: [
                {
                    from_document_key: FileType.business_case,
                    template_filename: "test.md",
                },
            ],
        } as HeaderContext;

        const headerJson: string = JSON.stringify(invalidHeaderContext);
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
        const jobPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.HeaderContext,
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(jobPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps("stop", fileManager);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return after save of invalid-shaped JSON",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(isRecord(uploadContext), "Upload context should be a record");
        assertExists(uploadContext.fileContent, "Upload context should have fileContent");
        assert(typeof uploadContext.fileContent === "string", "fileContent must be a string");
        let parsedContent: Parameters<typeof isHeaderContext>[0];
        try {
            parsedContent = JSON.parse(uploadContext.fileContent);
        } catch (e) {
            throw new Error(
                `Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
        assert(
            !isHeaderContext(parsedContent),
            "HeaderContext with files_to_generate should fail type guard validation",
        );
        assert(isRecord(parsedContent), "Parsed content should be a record");
        assert(
            "files_to_generate" in parsedContent,
            "Parsed content should have files_to_generate property (proving invalid structure)",
        );
    },
);

Deno.test(
    "saveResponse — plan validation — header_context missing context_for_documents fails isHeaderContext",
    async () => {
        const invalidHeaderContext: HeaderContext = {
            system_materials: {
                agent_notes_to_self: "Test executive summary",
                input_artifacts_summary: "Test input artifacts summary",
                stage_rationale: "Test stage rationale",
            },
            header_context_artifact: {
                type: "header_context",
                document_key: FileType.HeaderContext,
                artifact_class: "header_context",
                file_type: "json",
            },
        } as HeaderContext;

        const headerJson: string = JSON.stringify(invalidHeaderContext);
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
        const jobPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.HeaderContext,
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(jobPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps("stop", fileManager);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return after save of invalid-shaped JSON",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(isRecord(uploadContext), "Upload context should be a record");
        assertExists(uploadContext.fileContent, "Upload context should have fileContent");
        assert(typeof uploadContext.fileContent === "string", "fileContent must be a string");
        let parsedContent: Parameters<typeof isHeaderContext>[0];
        try {
            parsedContent = JSON.parse(uploadContext.fileContent);
        } catch (e) {
            throw new Error(
                `Failed to parse saved content as JSON: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
        assert(
            !isHeaderContext(parsedContent),
            "HeaderContext missing context_for_documents should fail type guard validation",
        );
    },
);

Deno.test(
    "saveResponse — plan validation — header_context output saves with fileType HeaderContext on pathContext",
    async () => {
        const validHeaderContext: HeaderContext = buildHeaderContext();
        const headerJson: string = JSON.stringify(validHeaderContext);
        const savedContribution: DialecticContributionRow = buildDialecticContributionRow({
            contribution_type: "header_context",
            file_name: "header_context.json",
            mime_type: "application/json",
        });
        const fileManager: MockFileManagerService = createMockFileManagerService();
        fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
        const jobPayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
            output_type: FileType.HeaderContext,
        });
        const { mockSetup, jobRow } = buildMockSupabaseFromPayload(jobPayload, {});
        const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
        const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
        const deps = buildIntegrationDeps("stop", fileManager);
        const result: SaveResponseReturn = await saveResponse(
            deps,
            params,
            buildSaveResponsePayload({
                assembled_content: headerJson,
            }),
        );
        assert(
            isSaveResponseSuccessReturn(result),
            "Expected success return for header_context fileType check",
        );
        assert(
            fileManager.uploadAndRegisterFile.calls.length > 0,
            "FileManager.uploadAndRegisterFile should be called",
        );
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall, "uploadAndRegisterFile should have been called");
        const uploadContext = uploadCall.args[0];
        assert(
            isModelContributionContext(uploadContext),
            "Upload context should be ModelContributionUploadContext",
        );
        assertEquals(
            uploadContext.pathContext.fileType,
            FileType.HeaderContext,
            "PLAN-derived header_context job should save with fileType HeaderContext",
        );
    },
);
