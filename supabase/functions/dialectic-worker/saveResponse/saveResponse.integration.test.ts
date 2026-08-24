import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  mockNotificationService,
  resetMockNotificationService,
} from "../../_shared/utils/notification.service.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { sanitizeJsonContent } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.ts";
import { resolveFinishReason } from "../../_shared/utils/resolveFinishReason.ts";
import { isIntermediateChunk } from "../../_shared/utils/isIntermediateChunk.ts";
import { determineContinuation } from "../../_shared/utils/determineContinuation/determineContinuation.ts";
import { buildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.ts";
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
import { saveResponse } from "./saveResponse.ts";
import type {
  SaveResponseDeps,
  SaveResponseParams,
  SaveResponsePayload,
  SaveResponseReturn,
  SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";
import type { BoundLoadJobContextFn } from "../loadJobContext/loadJobContext.interface.ts";
import type { BoundAssembleAiResponseFn } from "../assembleAiResponse/assembleAiResponse.interface.ts";
import type { BoundDebitForResponseFn } from "../debitForResponse/debitForResponse.interface.ts";
import type { BoundPrepareResponseContentFn } from "../prepareResponseContent/prepareResponseContent.interface.ts";
import type { BoundRetryJobFn } from "../retryJob/retryJob.interface.ts";
import type { BoundSaveContributionResponseFn } from "../saveContributionResponse/saveContributionResponse.interface.ts";
import type { BoundSaveCompressedResponseFn } from "../saveCompressedResponse/saveCompressedResponse.interface.ts";
import type { BoundResolveContributionIdentityFn } from "../resolveContributionIdentity/resolveContributionIdentity.interface.ts";
import type { BoundPersistContributionRelationshipsFn } from "../persistContributionRelationships/persistContributionRelationships.interface.ts";
import type { BoundFinalizeContributionJobFn } from "../finalizeContributionJob/finalizeContributionJob.interface.ts";
import type { BoundContinueJobFn } from "../continueJob/continueJob.interface.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import {
  buildDialecticJobRow,
  buildDialecticContributionRow,
  buildDialecticExecuteJobPayload,
  buildTokenWalletRow,
  buildDialecticSessionRow,
  buildDocumentRelationships,
  buildContentToInclude,
} from "../../_shared/dialectic.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildAssembleAiResponseDeps } from "../assembleAiResponse/assembleAiResponse.mock.ts";
import { buildDebitForResponseDeps } from "../debitForResponse/debitForResponse.mock.ts";
import { buildPrepareResponseContentDeps } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import { buildSaveContributionResponseDeps } from "../saveContributionResponse/saveContributionResponse.mock.ts";
import { buildSaveCompressedResponseDeps } from "../saveCompressedResponse/saveCompressedResponse.mock.ts";
import { buildFinalizeContributionJobDeps } from "../finalizeContributionJob/finalizeContributionJob.mock.ts";
import { buildEnqueueRenderJobSuccessReturn } from "../enqueueRenderJob/enqueueRenderJob.mock.ts";
import { isSaveResponseSuccessReturn } from "./saveResponse.guard.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts"
// ---------------------------------------------------------------------------
// Shared real-bound consts — real implementations bound with real sub-deps.
// Sub-deps that are boundary mocks use the mock deps builders, whose defaults
// are themselves built from builders (buildDebitTokensSuccess, etc.).
// ---------------------------------------------------------------------------

const integrationLogger = new MockLogger();

const realBoundLoadJobContext: BoundLoadJobContextFn = (params, payload) =>
  loadJobContext({}, params, payload);

const realBoundAssembleAiResponse: BoundAssembleAiResponseFn = (params, payload) =>
  assembleAiResponse(buildAssembleAiResponseDeps(), params, payload);

const realBoundDebitForResponse: BoundDebitForResponseFn = (params, payload) =>
  debitForResponse(buildDebitForResponseDeps(), params, payload);

const realBoundPrepareResponseContent: BoundPrepareResponseContentFn = (params, payload) =>
  prepareResponseContent(
    buildPrepareResponseContentDeps({
      logger: integrationLogger,
      resolveFinishReason,
      isIntermediateChunk,
      sanitizeJsonContent,
      determineContinuation,
    }),
    params,
    payload,
  );

const realBoundRetryJob: BoundRetryJobFn = (params, payload) =>
  retryJob({ logger: integrationLogger, notificationService: mockNotificationService }, params, payload);

const realBoundResolveContributionIdentity: BoundResolveContributionIdentityFn = (params, payload) =>
  resolveContributionIdentity({ logger: integrationLogger }, params, payload);

const realBoundPersistContributionRelationships: BoundPersistContributionRelationshipsFn = (params, payload) =>
  persistContributionRelationships({}, params, payload);

const realBoundContinueJob: BoundContinueJobFn = (params, payload) =>
  continueJob({ logger: integrationLogger }, params, payload);

const realBuildUploadContext = buildUploadContext;

/**
 * Wire the mock Supabase client with DB row data from builders. Only the
 * jobRow varies per test; provider, wallet, and session rows use builder
 * defaults.
 */
function buildMockSupabase(jobRow: DialecticJobRow) {
  return createMockSupabaseClient("integration-test", {
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
}

// ---------------------------------------------------------------------------
// EXECUTE tests — exercise the contribution arm through the full chain
// ---------------------------------------------------------------------------

/**
 * Contract: an EXECUTE job_type with valid content and finish_reason "stop"
 *   routes through the contribution arm and returns status "completed".
 * Arrange: a document-artifact EXECUTE payload; a file manager configured to
 *   return a valid contribution record on upload.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "completed".
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveContributionResponse → resolveContributionIdentity →
 *   persistContributionRelationships → finalizeContributionJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE terminal success returns completed", async () => {
  // Arrange
  resetMockNotificationService();
  const executePayload = buildDialecticExecuteJobPayload({
    document_relationships: buildDocumentRelationships({ source_group: "sg-terminal-success" }),
  });
  if(!isJson(executePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: executePayload });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobStub,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ result: "valid json content" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "completed");
  } else {
    throw new Error("Result is not a success return");
  }
});

/**
 * Contract: an EXECUTE job_type with empty AI content triggers the retry path
 *   through the real retryJob, which updates the job to "retrying" and returns
 *   status "completed".
 * Arrange: a document-artifact EXECUTE payload; assembled_content is empty
 *   string so prepareResponseContent returns retryRequired.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "completed"; retryJob
 *   updated the job via DB update; retry notification was sent.
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent → retryJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE empty content triggers real retryJob and returns completed", async () => {
  // Arrange
  resetMockNotificationService();
  const executePayload = buildDialecticExecuteJobPayload({
    document_relationships: buildDocumentRelationships({ source_group: "sg-empty-content" }),
  });
  if(!isJson(executePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: executePayload });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobStub,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: "",
    token_usage: null,
    finish_reason: null,
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (!isSaveResponseSuccessReturn(result)) {
    throw new Error("Expected success return from retry path");
  }
  const successResult: SaveResponseSuccessReturn = result;
  assertEquals(successResult.status, "completed");
  const jobUpdateSpies = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(jobUpdateSpies);
  assertEquals(jobUpdateSpies.callCount > 0, true, "retryJob should update job status via DB update");
  const retryCalls = mockNotificationService.sendContributionRetryingEvent.calls;
  assertEquals(retryCalls.length > 0, true, "retryJob should send contribution_generation_retrying notification");
});

/**
 * Contract: an EXECUTE job_type with finish_reason "length" and
 *   continueUntilComplete triggers the continuation path through the real
 *   continueJob, which enqueues a new job and returns status
 *   "needs_continuation".
 * Arrange: a document-artifact EXECUTE payload with continueUntilComplete; a
 *   file manager configured to return a valid contribution record.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "needs_continuation";
 *   continueJob inserted a new job into the DB; continuation notification was
 *   sent.
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveContributionResponse → resolveContributionIdentity →
 *   persistContributionRelationships → finalizeContributionJob → continueJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE continuation path triggers real continueJob and returns needs_continuation", async () => {
  // Arrange
  resetMockNotificationService();
  const continuationPayload = buildDialecticExecuteJobPayload({
    continueUntilComplete: true,
    document_relationships: buildDocumentRelationships({ source_group: "sg-continuation" }),
  });
  if(!isJson(continuationPayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: continuationPayload });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobStub,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ partial: "data" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "length",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "needs_continuation");
  } else {
    throw new Error("Result is not a success return");
  }
  const jobInsertSpies = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "insert");
  assertExists(jobInsertSpies);
  assertEquals(jobInsertSpies.callCount > 0, true, "continueJob should insert a new continuation job");
  const continuedCalls = mockNotificationService.sendContributionGenerationContinuedEvent.calls;
  assertEquals(continuedCalls.length > 0, true, "continuation should send contribution_generation_continued notification");
});

/**
 * Contract: an EXECUTE job_type with continuation_count 5 and
 *   continueUntilComplete reaches the continuation limit, triggers assembly,
 *   and returns status "continuation_limit_reached".
 * Arrange: a document-artifact EXECUTE payload with continueUntilComplete,
 *   continuation_count 5, and target_contribution_id set; a file manager
 *   configured to return a valid contribution record whose thesis points to
 *   the root.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status
 *   "continuation_limit_reached"; continuation notification still fires.
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveContributionResponse → resolveContributionIdentity →
 *   persistContributionRelationships → finalizeContributionJob → continueJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE continuation limit reached returns continuation_limit_reached", async () => {
  // Arrange
  resetMockNotificationService();
  const rootContributionId = "root-contrib-id";
  const limitPayload = buildDialecticExecuteJobPayload({
    continueUntilComplete: true,
    continuation_count: 5,
    target_contribution_id: rootContributionId,
    document_relationships: {
      thesis: rootContributionId,
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  if(!isJson(limitPayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({
    payload: limitPayload,
    target_contribution_id: rootContributionId,
  });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(
    buildDialecticContributionRow({
      document_relationships: {
        thesis: rootContributionId,
        source_group: "00000000-0000-4000-8000-000000000002",
      },
    }),
    null,
  );
  const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobStub,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ partial: "final chunk" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "length",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "continuation_limit_reached");
  } else {
    throw new Error("Result is not a success return");
  }
  const continuedCalls = mockNotificationService.sendContributionGenerationContinuedEvent.calls;
  assertEquals(continuedCalls.length > 0, true, "continuation notification should fire even at limit");
});

/**
 * Contract: an EXECUTE job_type with malformed JSON content triggers the retry
 *   path through the real retryJob and returns status "completed".
 * Arrange: a document-artifact EXECUTE payload; assembled_content is malformed
 *   JSON so prepareResponseContent returns retryRequired after sanitization
 *   failure.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "completed"; retryJob
 *   updated the job via DB update; retry notification was sent.
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent → retryJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE malformed JSON triggers real retryJob and returns completed", async () => {
  // Arrange
  resetMockNotificationService();
  const executePayload = buildDialecticExecuteJobPayload({
    document_relationships: buildDocumentRelationships({ source_group: "sg-malformed-json" }),
  });
  if(!isJson(executePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: executePayload });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobStub,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: "this is not valid JSON {{{",
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (!isSaveResponseSuccessReturn(result)) {
    throw new Error("Expected success return from retry path");
  }
  const successResult: SaveResponseSuccessReturn = result;
  assertEquals(successResult.status, "completed");
  const jobUpdateSpies = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
  assertExists(jobUpdateSpies);
  assertEquals(jobUpdateSpies.callCount > 0, true, "retryJob should update job via DB on malformed JSON");
  const retryCalls = mockNotificationService.sendContributionRetryingEvent.calls;
  assertEquals(retryCalls.length > 0, true, "retryJob should send retry notification on malformed JSON");
});

/**
 * Contract: an EXECUTE job_type with finish_reason "stop" on a continuation
 *   chain (target_contribution_id set, document_relationships.thesis points to
 *   root) calls enqueueRenderJob exactly once on terminal completion.
 * Arrange: a document-artifact EXECUTE payload with target_contribution_id and
 *   continuation_count 1; a file manager configured to return a valid
 *   contribution; an enqueueRenderJob spy counting calls.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "completed";
 *   enqueueRenderJob was called exactly once.
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveContributionResponse → resolveContributionIdentity →
 *   persistContributionRelationships → finalizeContributionJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE terminal completion calls enqueueRenderJob exactly once", async () => {
  // Arrange
  resetMockNotificationService();
  const rootContributionId = "root-contrib-render-test";
  const executePayload = buildDialecticExecuteJobPayload({
    continueUntilComplete: true,
    continuation_count: 1,
    target_contribution_id: rootContributionId,
    document_relationships: {
      thesis: rootContributionId,
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  if(!isJson(executePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({
    payload: executePayload,
    target_contribution_id: rootContributionId,
  });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(
    buildDialecticContributionRow({
      document_relationships: {
        thesis: rootContributionId,
        source_group: "00000000-0000-4000-8000-000000000002",
      },
    }),
    null,
  );
  let enqueueRenderJobCallCount = 0;
  const enqueueRenderJobSpy: BoundEnqueueRenderJobFn = async () => {
    enqueueRenderJobCallCount++;
    return buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
  };
  const boundFinalize: BoundFinalizeContributionJobFn = (params, payload) =>
    finalizeContributionJob(
      buildFinalizeContributionJobDeps({
        logger: integrationLogger,
        notificationService: mockNotificationService,
        fileManager: fm,
        continueJob: realBoundContinueJob,
        enqueueRenderJob: enqueueRenderJobSpy,
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobSpy,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ result: "final chunk content" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "completed");
  } else {
    throw new Error("Result is not a success return");
  }
  assertEquals(enqueueRenderJobCallCount, 1, "enqueueRenderJob should be called exactly once on terminal completion");
});

/**
 * Contract: an EXECUTE job_type with finish_reason "stop" on a continuation
 *   chain where enqueueRenderJob dispatches a render job (renderJobId non-null)
 *   does NOT call assembleAndSaveFinalDocument.
 * Arrange: a document-artifact EXECUTE payload with target_contribution_id,
 *   continuation_count 1, and document_relationships.thesis pointing to root;
 *   a file manager configured to return a valid contribution; an
 *   enqueueRenderJob stub returning a non-null renderJobId.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "completed";
 *   assembleAndSaveFinalDocument was not called.
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveContributionResponse → resolveContributionIdentity →
 *   persistContributionRelationships → finalizeContributionJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE with render dispatch does NOT call assembleAndSaveFinalDocument", async () => {
  // Arrange
  resetMockNotificationService();
  const rootContributionId = "root-contrib-render-test";
  const executePayload = buildDialecticExecuteJobPayload({
    continueUntilComplete: true,
    continuation_count: 1,
    target_contribution_id: rootContributionId,
    document_relationships: {
      thesis: rootContributionId,
      source_group: "00000000-0000-4000-8000-000000000002",
    },
  });
  if(!isJson(executePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({
    payload: executePayload,
    target_contribution_id: rootContributionId,
  });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(
    buildDialecticContributionRow({
      document_relationships: {
        thesis: rootContributionId,
        source_group: "00000000-0000-4000-8000-000000000002",
      },
    }),
    null,
  );
  const enqueueRenderJobWithDispatch: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: "render-job-1" });
  const boundFinalize: BoundFinalizeContributionJobFn = (params, payload) =>
    finalizeContributionJob(
      buildFinalizeContributionJobDeps({
        logger: integrationLogger,
        notificationService: mockNotificationService,
        fileManager: fm,
        continueJob: realBoundContinueJob,
        enqueueRenderJob: enqueueRenderJobWithDispatch,
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobWithDispatch,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ result: "final chunk content" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "completed");
  } else {
    throw new Error("Result is not a success return");
  }
  assertEquals(
    fm.assembleAndSaveFinalDocument.calls.length,
    0,
    "assembleAndSaveFinalDocument should NOT be called when enqueueRenderJob dispatches a render job",
  );
});

/**
 * Contract: an EXECUTE job_type on the continuation path (finish_reason
 *   "length") does NOT call enqueueRenderJob.
 * Arrange: a document-artifact EXECUTE payload with continueUntilComplete;
 *   a file manager configured to return a valid contribution; an
 *   enqueueRenderJob spy counting calls.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "needs_continuation";
 *   enqueueRenderJob was not called.
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveContributionResponse → resolveContributionIdentity →
 *   persistContributionRelationships → finalizeContributionJob → continueJob.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: EXECUTE continuation path does NOT call enqueueRenderJob", async () => {
  // Arrange
  resetMockNotificationService();
  const continuationPayload = buildDialecticExecuteJobPayload({
    continueUntilComplete: true,
    document_relationships: buildDocumentRelationships({ source_group: "sg-continuation" }),
  });
  if(!isJson(continuationPayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: continuationPayload });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  let enqueueRenderJobCallCount = 0;
  const enqueueRenderJobSpy: BoundEnqueueRenderJobFn = async () => {
    enqueueRenderJobCallCount++;
    return buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
  };
  const boundFinalize: BoundFinalizeContributionJobFn = (params, payload) =>
    finalizeContributionJob(
      buildFinalizeContributionJobDeps({
        logger: integrationLogger,
        notificationService: mockNotificationService,
        fileManager: fm,
        continueJob: realBoundContinueJob,
        enqueueRenderJob: enqueueRenderJobSpy,
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
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobSpy,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify({ partial: "data" }),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "length",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "needs_continuation");
  } else {
    throw new Error("Result is not a success return");
  }
  assertEquals(enqueueRenderJobCallCount, 0, "enqueueRenderJob should NOT be called on continuation path");
});

// ---------------------------------------------------------------------------
// COMPRESS tests — exercise the compressed arm through the full chain
// ---------------------------------------------------------------------------

/**
 * Contract: a COMPRESS job_type with mode "text" and finish_reason "stop"
 *   routes through the compressed arm and returns status "completed".
 * Arrange: a text-mode COMPRESS payload with valid content; a file manager
 *   configured to return a valid resource record on upload.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "completed".
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveCompressedResponse.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: COMPRESS text mode returns completed", async () => {
  // Arrange
  resetMockNotificationService();
  const compressPayload = buildDialecticCompressJobPayload({
    content: JSON.stringify(buildContentToInclude()),
  });
  if(!isJson(compressPayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({
    payload: compressPayload,
    job_type: "COMPRESS",
  });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
  const fmForContribution = createMockFileManagerService();
  fmForContribution.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const boundFinalize: BoundFinalizeContributionJobFn = (params, payload) =>
    finalizeContributionJob(
      buildFinalizeContributionJobDeps({
        logger: integrationLogger,
        notificationService: mockNotificationService,
        fileManager: fmForContribution,
        continueJob: realBoundContinueJob,
        enqueueRenderJob: enqueueRenderJobStub,
      }),
      params,
      payload,
    );
  const boundSaveContribution: BoundSaveContributionResponseFn = (params, payload) =>
    saveContributionResponse(
      buildSaveContributionResponseDeps({
        fileManager: fmForContribution,
        buildUploadContext: realBuildUploadContext,
        resolveContributionIdentity: realBoundResolveContributionIdentity,
        persistContributionRelationships: realBoundPersistContributionRelationships,
        finalizeContributionJob: boundFinalize,
      }),
      params,
      payload,
    );
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobStub,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: "compressed text content",
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "completed");
  } else {
    throw new Error("Result is not a success return");
  }
});

/**
 * Contract: a COMPRESS job_type with mode "json" and finish_reason "stop"
 *   routes through the compressed arm, calls enqueueRenderJob, updates the job
 *   to "waiting_for_children", and returns status "waiting_for_children".
 * Arrange: a json-mode COMPRESS payload with valid JSON content; a file
 *   manager configured to return a valid resource record on upload.
 * Act: saveResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status "waiting_for_children".
 * Boundary: DB, file manager, notification service, debitTokens, countTokens,
 *   enqueueRenderJob — the chain run real is saveResponse → loadJobContext →
 *   assembleAiResponse → debitForResponse → prepareResponseContent →
 *   saveCompressedResponse.
 * Mocked: createMockSupabaseClient, MockFileManagerService,
 *   mockNotificationService, debitTokens, countTokens, enqueueRenderJob.
 */
Deno.test("Integration: COMPRESS json mode returns waiting_for_children", async () => {
  // Arrange
  resetMockNotificationService();
  const compressPayload = buildDialecticCompressJobPayload({
    mode: "json",
    content: JSON.stringify(buildContentToInclude()),
  });
  if(!isJson(compressPayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({
    payload: compressPayload,
    job_type: "COMPRESS",
  });
  const fm = createMockFileManagerService();
  fm.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const enqueueRenderJobStub: BoundEnqueueRenderJobFn = async () =>
    buildEnqueueRenderJobSuccessReturn({ renderJobId: null });
  const fmForContribution = createMockFileManagerService();
  fmForContribution.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);
  const boundFinalize: BoundFinalizeContributionJobFn = (params, payload) =>
    finalizeContributionJob(
      buildFinalizeContributionJobDeps({
        logger: integrationLogger,
        notificationService: mockNotificationService,
        fileManager: fmForContribution,
        continueJob: realBoundContinueJob,
        enqueueRenderJob: enqueueRenderJobStub,
      }),
      params,
      payload,
    );
  const boundSaveContribution: BoundSaveContributionResponseFn = (params, payload) =>
    saveContributionResponse(
      buildSaveContributionResponseDeps({
        fileManager: fmForContribution,
        buildUploadContext: realBuildUploadContext,
        resolveContributionIdentity: realBoundResolveContributionIdentity,
        persistContributionRelationships: realBoundPersistContributionRelationships,
        finalizeContributionJob: boundFinalize,
      }),
      params,
      payload,
    );
  const deps: SaveResponseDeps = {
    logger: integrationLogger,
    retryJob: realBoundRetryJob,
    loadJobContext: realBoundLoadJobContext,
    assembleAiResponse: realBoundAssembleAiResponse,
    debitForResponse: realBoundDebitForResponse,
    prepareResponseContent: realBoundPrepareResponseContent,
    saveContributionResponse: boundSaveContribution,
    saveCompressedResponse: (params, payload) =>
      saveCompressedResponse(
        buildSaveCompressedResponseDeps({
          fileManager: fm,
          buildUploadContext: realBuildUploadContext,
          enqueueRenderJob: enqueueRenderJobStub,
        }),
        params,
        payload,
      ),
  };
  const mockSetup = buildMockSupabase(jobRow);
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: SaveResponseParams = { job_id: jobRow.id, dbClient };
  const payload: SaveResponsePayload = {
    assembled_content: JSON.stringify(buildContentToInclude()),
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    processingTimeMs: 100,
  };

  // Act
  const result: SaveResponseReturn = await saveResponse(deps, params, payload);

  // Assert
  if (isSaveResponseSuccessReturn(result)) {
    const successResult: SaveResponseSuccessReturn = result;
    assertEquals(successResult.status, "waiting_for_children");
  } else {
    throw new Error("Result is not a success return");
  }
});
