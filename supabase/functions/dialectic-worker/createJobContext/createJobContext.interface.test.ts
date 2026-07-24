import { assertEquals } from "jsr:@std/assert";
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
} from "./JobContext.interface.ts";
import type { BuildUploadContextResourceParams } from "../../_shared/utils/buildUploadContext/buildUploadContext.interface.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";

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

Deno.test("IJobContext.prepareModelJob is BoundPrepareModelJobFn", () => {
  const fn: BoundPrepareModelJobFn = async () => ({
    error: new Error("interface test stub"),
    retriable: false,
  });
  const field: IJobContext["prepareModelJob"] = fn;
  assertEquals(field, fn);
});

Deno.test("IJobContext.enqueueModelCall is BoundEnqueueModelCallFn", () => {
  const fn: IJobContext["enqueueModelCall"] = async () => ({
    error: new Error("interface test stub"),
    retriable: false,
  });
  assertEquals(typeof fn, "function");
});

Deno.test("IJobContext.buildUploadContext is BuildUploadContextFn", () => {
  const fn: BuildUploadContextFn = (_params: Parameters<BuildUploadContextFn>[0]) => ({
    fileContent: "",
    mimeType: "text/markdown",
    sizeBytes: 0,
    userId: null,
    description: "",
    pathContext: {
      projectId: "",
      fileType: "" as never,
    },
  });
  const field: IJobContext["buildUploadContext"] = fn;
  assertEquals(field, fn);
});

Deno.test("BuildUploadContextFn params accept BuildUploadContextResourceParams", () => {
  const resourceParams: BuildUploadContextResourceParams = {
    projectId: "proj-1",
    storageFileType: FileType.CompressedContextRawJson,
    sessionId: "sess-1",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    sourceType: "contribution",
    documentKey: undefined,
    sourceId: undefined,
    chunkIndex: undefined,
    chunkTotal: undefined,
    contentForStorage: "{}",
    projectOwnerUserId: "owner-1",
    description: "desc",
  };
  const fnParams: Parameters<BuildUploadContextFn>[0] = resourceParams;
  assertEquals(fnParams, resourceParams);
});

Deno.test("IJobContext.computeJobSig is ComputeJobSig", () => {
  const fn: IJobContext["computeJobSig"] = async (
    _jobId: string,
    _userId: string,
    _createdAt: string,
  ): Promise<string> => "test-sig";
  assertEquals(typeof fn, "function");
});

Deno.test("IJobContext.sanitizeJsonContent is SanitizeJsonContentFn", () => {
  const fn: IJobContext["sanitizeJsonContent"] = (content: string) => ({
    sanitized: content.trim(),
    originalLength: content.length,
    wasSanitized: false,
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
  });
  assertEquals(typeof fn, "function");
});

Deno.test("JobContextParams.computeJobSig is ComputeJobSig", () => {
  const fn: JobContextParams["computeJobSig"] = async (
    _jobId: string,
    _userId: string,
    _createdAt: string,
  ): Promise<string> => "test-sig";
  assertEquals(typeof fn, "function");
});

Deno.test("JobContextParams.sanitizeJsonContent is SanitizeJsonContentFn", () => {
  const fn: JobContextParams["sanitizeJsonContent"] = (content: string) => ({
    sanitized: content.trim(),
    originalLength: content.length,
    wasSanitized: false,
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
  });
  assertEquals(typeof fn, "function");
});

Deno.test("ISaveResponseContext.enqueueRenderJob is BoundEnqueueRenderJobFn", () => {
  const fn: ISaveResponseContext["enqueueRenderJob"] = async () => ({
    error: new Error("interface test stub"),
    retriable: false,
  });
  assertEquals(typeof fn, "function");
});

Deno.test("ISaveResponseContext.debitTokens is BoundDebitTokens", () => {
  const fn: ISaveResponseContext["debitTokens"] = async () => ({
    error: new Error("interface test stub"),
    retriable: false,
  });
  assertEquals(typeof fn, "function");
});
