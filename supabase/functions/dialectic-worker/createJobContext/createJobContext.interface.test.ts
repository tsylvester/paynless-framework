import { assert, assertEquals } from "jsr:@std/assert";
import type {
  ILoggerContext,
  IFileContext,
  IModelContext,
  IRagContext,
  ITokenContext,
  INotificationContext,
  IPrepareModelJobContext,
  IPlanJobContext,
  IRenderJobContext,
  ISaveResponseContext,
  IJobContext,
  JobContextParams,
  BuildUploadContextFn,
  BoundPrepareModelJobFn,
  ContinueJobFn,
} from "./JobContext.interface.ts";
import type { BuildUploadContextResourceParams } from "../../_shared/utils/buildUploadContext/buildUploadContext.interface.ts";
import type {
  DialecticContributionRow,
  DialecticProjectResourceRow,
  DialecticExecuteJobPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import type { BoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type { ComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.interface.ts";
import type { SanitizeJsonContentFn } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.interface.ts";
import type { BoundDebitTokens } from "../../_shared/utils/debitTokens.interface.ts";

declare const contributionRow: DialecticContributionRow;
declare const resourceRow: DialecticProjectResourceRow;
declare const execPayload: DialecticExecuteJobPayload;
declare const boundPrepareModelJobFn: BoundPrepareModelJobFn;
declare const boundEnqueueModelCallFn: BoundEnqueueModelCallFn;
declare const buildUploadContextFn: BuildUploadContextFn;
declare const resourceParams: BuildUploadContextResourceParams;
declare const computeJobSigFn: ComputeJobSig;
declare const sanitizeJsonContentFn: SanitizeJsonContentFn;
declare const boundEnqueueRenderJobFn: BoundEnqueueRenderJobFn;
declare const boundDebitTokensFn: BoundDebitTokens;

Deno.test("ILoggerContext has the required surface", () => {
  const surface: Record<keyof ILoggerContext, true> = {
    logger: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

Deno.test("IFileContext has the required surface", () => {
  const surface: Record<keyof IFileContext, true> = {
    fileManager: true,
    downloadFromStorage: true,
    deleteFromStorage: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

Deno.test("IModelContext has the required surface", () => {
  const surface: Record<keyof IModelContext, true> = {
    getAiProviderAdapter: true,
    getAiProviderConfig: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

Deno.test("IRagContext has the required surface", () => {
  const surface: Record<keyof IRagContext, true> = {
    ragService: true,
    indexingService: true,
    embeddingClient: true,
    countTokens: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

Deno.test("ITokenContext has the required surface", () => {
  const surface: Record<keyof ITokenContext, true> = {
    adminTokenWalletService: true,
    userTokenWalletService: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

Deno.test("INotificationContext has the required surface", () => {
  const surface: Record<keyof INotificationContext, true> = {
    notificationService: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

Deno.test("IPrepareModelJobContext has the required surface", () => {
  const surface: Record<keyof IPrepareModelJobContext, true> = {
    logger: true,
    applyInputsRequiredScope: true,
    countTokens: true,
    adminTokenWalletService: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    ragService: true,
    embeddingClient: true,
    enqueueModelCall: true,
    calculateAffordability: true,
  };
  assertEquals(Object.keys(surface).length, 10);
});

Deno.test("IPlanJobContext has the required surface", () => {
  const surface: Record<keyof IPlanJobContext, true> = {
    logger: true,
    notificationService: true,
    getGranularityPlanner: true,
    planComplexStage: true,
    findSourceDocuments: true,
  };
  assertEquals(Object.keys(surface).length, 5);
});

Deno.test("IRenderJobContext has the required surface", () => {
  const surface: Record<keyof IRenderJobContext, true> = {
    logger: true,
    fileManager: true,
    downloadFromStorage: true,
    deleteFromStorage: true,
    notificationService: true,
    documentRenderer: true,
    assembleContributionChain: true,
    loadDocumentTemplate: true,
    mergeChunkContent: true,
  };
  assertEquals(Object.keys(surface).length, 9);
});

Deno.test("ISaveResponseContext has the required surface", () => {
  const surface: Record<keyof ISaveResponseContext, true> = {
    enqueueRenderJob: true,
    debitTokens: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

Deno.test("IJobContext has the required surface", () => {
  const surface: Record<keyof IJobContext, true> = {
    logger: true,
    notificationService: true,
    getGranularityPlanner: true,
    planComplexStage: true,
    findSourceDocuments: true,
    fileManager: true,
    downloadFromStorage: true,
    deleteFromStorage: true,
    documentRenderer: true,
    assembleContributionChain: true,
    loadDocumentTemplate: true,
    mergeChunkContent: true,
    getAiProviderAdapter: true,
    getAiProviderConfig: true,
    ragService: true,
    indexingService: true,
    embeddingClient: true,
    countTokens: true,
    adminTokenWalletService: true,
    userTokenWalletService: true,
    pickLatest: true,
    applyInputsRequiredScope: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    getMaxOutputTokens: true,
    continueJob: true,
    retryJob: true,
    resolveFinishReason: true,
    isIntermediateChunk: true,
    determineContinuation: true,
    buildUploadContext: true,
    debitTokens: true,
    promptAssembler: true,
    getSeedPromptForStage: true,
    gatherArtifacts: true,
    prepareModelJob: true,
    enqueueModelCall: true,
    sanitizeJsonContent: true,
    computeJobSig: true,
  };
  assertEquals(Object.keys(surface).length, 39);
});

Deno.test("JobContextParams has the required surface", () => {
  const surface: Record<keyof JobContextParams, true> = {
    logger: true,
    fileManager: true,
    downloadFromStorage: true,
    deleteFromStorage: true,
    getAiProviderAdapter: true,
    getAiProviderConfig: true,
    ragService: true,
    indexingService: true,
    embeddingClient: true,
    countTokens: true,
    adminTokenWalletService: true,
    userTokenWalletService: true,
    notificationService: true,
    getSeedPromptForStage: true,
    promptAssembler: true,
    getExtensionFromMimeType: true,
    extractSourceGroupFragment: true,
    randomUUID: true,
    shouldEnqueueRenderJob: true,
    getGranularityPlanner: true,
    planComplexStage: true,
    findSourceDocuments: true,
    documentRenderer: true,
    assembleContributionChain: true,
    loadDocumentTemplate: true,
    mergeChunkContent: true,
    continueJob: true,
    retryJob: true,
    gatherArtifacts: true,
    prepareModelJob: true,
    enqueueModelCall: true,
    debitTokens: true,
    pickLatest: true,
    applyInputsRequiredScope: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    getMaxOutputTokens: true,
    resolveFinishReason: true,
    isIntermediateChunk: true,
    determineContinuation: true,
    buildUploadContext: true,
    sanitizeJsonContent: true,
    computeJobSig: true,
  };
  assertEquals(Object.keys(surface).length, 43);
});