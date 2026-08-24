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
import {
  mockNotificationService,
  resetMockNotificationService,
} from "../../_shared/utils/notification.service.mock.ts";
import { isJson, isRecord } from "../../_shared/utils/type_guards.ts";
import { isModelContributionContext } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { DialecticStageSlug, FileType } from "../../_shared/types/file_manager.types.ts";
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
import type {
  SaveResponseDeps,
  SaveResponseErrorReturn,
  SaveResponseParams,
  SaveResponseReturn,
} from "./saveResponse.interface.ts";
import {
  isSaveResponseErrorReturn,
  isSaveResponseSuccessReturn,
} from "./saveResponse.guard.ts";
import { buildSaveResponsePayload, buildSaveResponseDeps } from "./saveResponse.mock.ts";
import { saveResponse } from "./saveResponse.ts";
import { loadJobContext } from "../loadJobContext/loadJobContext.ts";
import { assembleAiResponse } from "../assembleAiResponse/assembleAiResponse.ts";
import { debitForResponse } from "../debitForResponse/debitForResponse.ts";
import { prepareResponseContent } from "../prepareResponseContent/prepareResponseContent.ts";
import { retryJob } from "../retryJob/retryJob.ts";
import { saveContributionResponse } from "../saveContributionResponse/saveContributionResponse.ts";
import { isSaveContributionResponseBuildContextError } from "../saveContributionResponse/saveContributionResponse.provides.ts";
import { saveCompressedResponse } from "../saveCompressedResponse/saveCompressedResponse.ts";
import { resolveContributionIdentity } from "../resolveContributionIdentity/resolveContributionIdentity.ts";
import {
  isResolveContributionIdentityDocumentKeyError,
  isResolveContributionIdentityProviderIdentifierError,
} from "../resolveContributionIdentity/resolveContributionIdentity.provides.ts";
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
import { buildCanonicalPathParams } from "../../_shared/services/file_manager.mock.ts";
import {
  buildDialecticContributionRow,
  buildDialecticJobRow,
  buildDialecticExecuteJobPayload,
  buildTokenWalletRow,
  buildDialecticSessionRow,
  buildDocumentRelationships,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider, type MockProviderOverrides } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildAssembleAiResponseDeps } from "../assembleAiResponse/assembleAiResponse.mock.ts";
import { buildDebitForResponseDeps } from "../debitForResponse/debitForResponse.mock.ts";
import { buildSaveCompressedResponseDeps } from "../saveCompressedResponse/saveCompressedResponse.mock.ts";
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


const stopDocumentJson: string = '{"content": "AI response content"}';
const headerContextAiJson: string =
  '{"header_context_artifact": {"type": "header_context", "document_key": "header_context", "artifact_class": "header_context", "file_type": "json"}, "context_for_documents": []}';

/**
 * Build a mock Supabase client wired to a job row constructed from the given
 * payload. Mirrors saveResponse.continue.test.ts's buildMockSupabaseFromPayload.
 */
function buildMockSupabaseFromPayload(
  payload: DialecticExecuteJobPayload,
  jobRowOverrides: Partial<DialecticJobRow>,
  providerOverrides?: MockProviderOverrides,
) {
  if (!isJson(payload)) {
    throw new Error("test fixture: payload must be Json-compatible");
  }
  const jobRow = buildDialecticJobRow({
    ...jobRowOverrides,
    payload,
  });
  const mockSetup = createMockSupabaseClient("path-context-test", {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: { data: [jobRow], error: null },
        update: { data: null, error: null },
        insert: { data: null, error: null },
      },
      ai_providers: {
        select: { data: [buildMockProvider(providerOverrides)], error: null },
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

/**
 * Build a SaveResponseDeps that simulates a particular model finish reason.
 * Mirrors saveResponse.continue.test.ts's depsWithFinishReason.
 */
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

Deno.test(
  "ALL required values present for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41bi" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success return for pathContext 41.b.i, got ${
        JSON.stringify(result)
      }`,
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
      "uploadContext should be ModelContributionUploadContext",
    );
    assertEquals(uploadContext.pathContext.documentKey, "business_case");
    assertEquals(
      uploadContext.pathContext.projectId,
      payload.projectId,
    );
    assertEquals(
      uploadContext.pathContext.sessionId,
      payload.sessionId,
    );
    assertEquals(uploadContext.pathContext.iteration, 1);
    assertEquals(uploadContext.pathContext.stageSlug, "thesis");
    assertEquals(uploadContext.pathContext.modelSlug, "dummy-model-v1");
    assertEquals(uploadContext.pathContext.attemptCount, 0);
  },
);

Deno.test(
  "execute_chunk_completed notification uses document_key from payload",
  async () => {
    resetMockNotificationService();
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.feature_spec,
      document_key: FileType.feature_spec,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41bii" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    // Find the execute_chunk_completed call specifically — execute_completed
    // may also be emitted on terminal success and would precede/follow it.
    const chunkCompletedCall = mockNotificationService.sendJobNotificationEvent
      .calls.find((call: { args: unknown[] }) => {
        const p: unknown = call.args[0];
        return isRecord(p) && p.type === "execute_chunk_completed";
      });
    assertExists(
      chunkCompletedCall,
      "execute_chunk_completed notification should have been sent",
    );
    const payloadArg: unknown = chunkCompletedCall.args[0];
    assert(isRecord(payloadArg));
    assertEquals(payloadArg.type, "execute_chunk_completed");
    assertEquals(
      payloadArg.document_key,
      "feature_spec",
      "notification.document_key should be from payload",
    );
  },
);

Deno.test(
  "error when document_key is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biiia" }),
    });
    delete payload.document_key;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      isResolveContributionIdentityDocumentKeyError(errReturn.error),
      `Expected ResolveContributionIdentityDocumentKeyError, got ${errReturn.error.name}`,
    );
  },
);

Deno.test(
  "error when document_key is empty string for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: "" as unknown as FileType,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biiib" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      isResolveContributionIdentityDocumentKeyError(errReturn.error),
      `Expected ResolveContributionIdentityDocumentKeyError, got ${errReturn.error.name}`,
    );
  },
);

Deno.test(
  "error when projectId is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biiic" }),
    });
    delete (payload as unknown as Record<string, unknown>).projectId;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("projectId"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  "error when sessionId is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biiid" }),
    });
    delete (payload as unknown as Record<string, unknown>).sessionId;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("sessionId"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  "error when iterationNumber is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biiie" }),
    });
    delete payload.iterationNumber;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      isSaveContributionResponseBuildContextError(errReturn.error),
      `Expected SaveContributionResponseBuildContextError, got ${errReturn.error.name}`,
    );
  },
);

Deno.test(
  "error when canonicalPathParams is undefined for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biiif" }),
    });
    delete (payload as unknown as Record<string, unknown>).canonicalPathParams;
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes("canonicalPathParams"),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  "error when providerDetails.api_identifier is empty for document file type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biiii" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    // Use whitespace-only api_identifier so it passes the `isSelectedAiProvider`
    // length guard (which rejects strict empty string) but still fails the
    // document-type validation that checks `trim() === ''`. This targets the
    // same combined missingValues check the EMCAS test exercises.
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(
      payload,
      {},
      { api_identifier: "   " },
    );
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseErrorReturn(result),
      `Expected error, got ${JSON.stringify(result)}`,
    );
    const errReturn: SaveResponseErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      isResolveContributionIdentityProviderIdentifierError(errReturn.error),
      `Expected ResolveContributionIdentityProviderIdentifierError, got ${errReturn.error.name}`,
    );
  },
);

Deno.test(
  "succeeds for HeaderContext with document_key",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.HeaderContext,
      document_relationships: buildDocumentRelationships({ source_group: "sg-41biv" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
  },
);

/* ------------------------------------------------------------------ */
/*  sourceAnchorModelSlug propagates for antithesis HeaderContext      */
/* ------------------------------------------------------------------ */

Deno.test(
  "saveResponse propagates sourceAnchorModelSlug from canonicalPathParams to pathContext when creating HeaderContext for antithesis stage",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.HeaderContext,
      stageSlug: DialecticStageSlug.Antithesis,
      canonicalPathParams: buildCanonicalPathParams({
        contributionType: "header_context",
        stageSlug: DialecticStageSlug.Antithesis,
        sourceAnchorModelSlug: "gpt-4",
        sourceAnchorType: "thesis",
      }),
      document_relationships: buildDocumentRelationships({ source_group: "sg-srcanchor" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertExists(
      uploadContext.pathContext.sourceAnchorModelSlug,
      "pathContext should include sourceAnchorModelSlug from canonicalPathParams",
    );
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, "gpt-4");
    assertEquals(uploadContext.pathContext.stageSlug, "antithesis");
  },
);

Deno.test(
  "extracts document_key for assembled_document_json output type",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.AssembledDocumentJson,
      document_key: FileType.business_case,
      document_relationships: buildDocumentRelationships({ source_group: "sg-101c" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.documentKey, "business_case");
  },
);

Deno.test(
  "saveResponse passes documentKey to pathContext unconditionally for HeaderContext",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.HeaderContext,
      canonicalPathParams: buildCanonicalPathParams({
        contributionType: "header_context",
      }),
      document_relationships: buildDocumentRelationships({ source_group: "sg-dockey" }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.documentKey, payload.document_key);
  },
);

Deno.test(
  "PathContext includes sourceGroupFragment when document_relationships.source_group is present",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const documentRelationships: DocumentRelationships = buildDocumentRelationships({
      source_group: "550e8400-e29b-41d4-a716-446655440000",
    });
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: documentRelationships,
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.i, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      "550e8400",
      "pathContext.sourceGroupFragment should be first 8 chars after hyphen removal",
    );
  },
);

Deno.test(
  "fragment extraction handles UUID with hyphens correctly",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const documentRelationships: DocumentRelationships = buildDocumentRelationships({
      source_group: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.HeaderContext,
      document_relationships: documentRelationships,
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.ii, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      "a1b2c3d4",
      "pathContext.sourceGroupFragment should be hyphens removed, first 8 chars, lowercase",
    );
  },
);

Deno.test(
  "PathContext works without source_group (backward compatibility)",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.HeaderContext,
      document_relationships: buildDocumentRelationships(),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.iii, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      undefined,
      "pathContext.sourceGroupFragment should be undefined when document_relationships.source_group is absent",
    );
  },
);

Deno.test(
  "fragment extraction handles undefined source_group gracefully",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const documentRelationships: DocumentRelationships = buildDocumentRelationships();
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.HeaderContext,
      document_relationships: documentRelationships,
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.iv, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      undefined,
      "pathContext.sourceGroupFragment should be undefined when source_group is undefined",
    );
  },
);

Deno.test(
  "sourceAnchorModelSlug propagates for antithesis patterns",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      stageSlug: DialecticStageSlug.Antithesis,
      document_relationships: buildDocumentRelationships({
        source_group: "550e8400-e29b-41d4-a716-446655440000",
      }),
      canonicalPathParams: buildCanonicalPathParams({
        contributionType: "antithesis",
        stageSlug: DialecticStageSlug.Antithesis,
        sourceAnchorModelSlug: "gpt-4",
      }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: stopDocumentJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.v, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, "gpt-4");
    assertEquals(uploadContext.pathContext.stageSlug, "antithesis");
    assertEquals(uploadContext.pathContext.sourceGroupFragment, "550e8400");
  },
);

Deno.test(
  "canonicalPathParams includes sourceAnchorModelSlug for antithesis HeaderContext jobs",
  async () => {
    const fileManager: MockFileManagerService = createMockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
    const deps: SaveResponseDeps = depsWithFinishReason("stop", fileManager, realBoundContinueJob, realBoundRetryJob);
    const payload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      output_type: FileType.HeaderContext,
      stageSlug: DialecticStageSlug.Antithesis,
      canonicalPathParams: buildCanonicalPathParams({
        contributionType: "antithesis",
        stageSlug: DialecticStageSlug.Antithesis,
        sourceAnchorModelSlug: "gpt-4",
      }),
      document_relationships: buildDocumentRelationships({
        source_group: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    if (!isJson(payload)) {
      throw new Error("test fixture: payload must be Json");
    }
    const { mockSetup, jobRow } = buildMockSupabaseFromPayload(payload, {});
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
    const result: SaveResponseReturn = await saveResponse(
      deps,
      params,
      buildSaveResponsePayload({
        assembled_content: headerContextAiJson,
      }),
    );
    assert(
      isSaveResponseSuccessReturn(result),
      `Expected success for 71.c.vi, got ${JSON.stringify(result)}`,
    );
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, "gpt-4");
    assertEquals(uploadContext.pathContext.stageSlug, "antithesis");
  },
);
