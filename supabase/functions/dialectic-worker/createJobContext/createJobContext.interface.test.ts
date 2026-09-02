import { assert, assertEquals } from "jsr:@std/assert";
import type {
  ILoggerContext,
  IFileContext,
  IModelContext,
  ITokenContext,
  INotificationContext,
  IPlanJobContext,
  IRenderJobContext,
  IJobContext,
  JobContextParams,
} from "./JobContext.interface.ts";
import type {
  ProcessSimpleJobFn,
  ProcessComplexJobFn,
  ProcessRenderJobFn,
  ProcessSimpleJobParams,
  ProcessComplexJobParams,
  ProcessRenderJobParams,
  ProcessSimpleJobPayload,
  ProcessComplexJobPayload,
  ProcessRenderJobPayload,
  ProcessSimpleJobDispatchedReturn,
  ProcessSimpleJobDeferredReturn,
  ProcessSimpleJobSuccessReturn,
  ProcessSimpleJobErrorReturn,
  ProcessSimpleJobReturn,
  ProcessComplexJobSuccessReturn,
  ProcessComplexJobErrorReturn,
  ProcessComplexJobReturn,
  ProcessRenderJobSuccessReturn,
  ProcessRenderJobErrorReturn,
  ProcessRenderJobReturn,
  IJobProcessors,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobFn,
  BoundPrepareModelJobFn,
} from "../prepareModelJob/prepareModelJob.interface.ts";
import type { RetryJobFn, BoundRetryJobFn } from "../retryJob/retryJob.interface.ts";
import type { GatherArtifactsFn, BoundGatherArtifactsFn } from "../gatherArtifacts/gatherArtifacts.interface.ts";
import type { EnqueueModelCallFn, BoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.interface.ts";

// --- Unchanged interface surface cases ---

/** Contract: ILoggerContext's required key surface is exactly logger. */
Deno.test("ILoggerContext has the required surface", () => {
  const surface: Record<keyof ILoggerContext, true> = {
    logger: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: IFileContext's required key surface is exactly fileManager, downloadFromStorage and deleteFromStorage. */
Deno.test("IFileContext has the required surface", () => {
  const surface: Record<keyof IFileContext, true> = {
    fileManager: true,
    downloadFromStorage: true,
    deleteFromStorage: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

/** Contract: IModelContext's required key surface is exactly getAiProviderAdapter and getAiProviderConfig. */
Deno.test("IModelContext has the required surface", () => {
  const surface: Record<keyof IModelContext, true> = {
    getAiProviderAdapter: true,
    getAiProviderConfig: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ITokenContext's required key surface is exactly adminTokenWalletService and userTokenWalletService. */
Deno.test("ITokenContext has the required surface", () => {
  const surface: Record<keyof ITokenContext, true> = {
    adminTokenWalletService: true,
    userTokenWalletService: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: INotificationContext's required key surface is exactly notificationService. */
Deno.test("INotificationContext has the required surface", () => {
  const surface: Record<keyof INotificationContext, true> = {
    notificationService: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: IPlanJobContext's required key surface is exactly logger, notificationService, getGranularityPlanner, planComplexStage and findSourceDocuments. */
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

/** Contract: IRenderJobContext's required key surface is exactly logger, fileManager, downloadFromStorage, deleteFromStorage, notificationService, documentRenderer, assembleContributionChain, loadDocumentTemplate and mergeChunkContent. */
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

// --- Modified interface surface cases ---

/** Contract: IJobContext's required key surface is exactly logger, notificationService, getGranularityPlanner, planComplexStage, findSourceDocuments, fileManager, downloadFromStorage, deleteFromStorage, documentRenderer, assembleContributionChain, loadDocumentTemplate, mergeChunkContent, getAiProviderAdapter, getAiProviderConfig, countTokens, adminTokenWalletService, userTokenWalletService, pickLatest, applyInputsRequiredScope, validateWalletBalance, validateModelCostRates, getMaxOutputTokens, retryJob, promptAssembler, getSeedPromptForStage, gatherArtifacts, prepareModelJob, enqueueModelCall, computeJobSig, calculateAffordability and compressPrompt. */
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
    countTokens: true,
    adminTokenWalletService: true,
    userTokenWalletService: true,
    pickLatest: true,
    applyInputsRequiredScope: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    getMaxOutputTokens: true,
    retryJob: true,
    promptAssembler: true,
    getSeedPromptForStage: true,
    gatherArtifacts: true,
    prepareModelJob: true,
    enqueueModelCall: true,
    computeJobSig: true,
    calculateAffordability: true,
    compressPrompt: true,
  };
  assert(surface.logger);
  assert(surface.notificationService);
  assert(surface.getGranularityPlanner);
  assert(surface.planComplexStage);
  assert(surface.findSourceDocuments);
  assert(surface.fileManager);
  assert(surface.downloadFromStorage);
  assert(surface.deleteFromStorage);
  assert(surface.documentRenderer);
  assert(surface.assembleContributionChain);
  assert(surface.loadDocumentTemplate);
  assert(surface.mergeChunkContent);
  assert(surface.getAiProviderAdapter);
  assert(surface.getAiProviderConfig);
  assert(surface.countTokens);
  assert(surface.adminTokenWalletService);
  assert(surface.userTokenWalletService);
  assert(surface.pickLatest);
  assert(surface.applyInputsRequiredScope);
  assert(surface.validateWalletBalance);
  assert(surface.validateModelCostRates);
  assert(surface.getMaxOutputTokens);
  assert(surface.retryJob);
  assert(surface.promptAssembler);
  assert(surface.getSeedPromptForStage);
  assert(surface.gatherArtifacts);
  assert(surface.prepareModelJob);
  assert(surface.enqueueModelCall);
  assert(surface.computeJobSig);
  assert(surface.calculateAffordability);
  assert(surface.compressPrompt);
});

/** Contract: JobContextParams' required key surface is exactly logger, fileManager, downloadFromStorage, deleteFromStorage, getAiProviderAdapter, getAiProviderConfig, countTokens, adminTokenWalletService, userTokenWalletService, notificationService, getSeedPromptForStage, promptAssembler, getExtensionFromMimeType, extractSourceGroupFragment, randomUUID, shouldEnqueueRenderJob, getGranularityPlanner, planComplexStage, findSourceDocuments, documentRenderer, assembleContributionChain, loadDocumentTemplate, mergeChunkContent, retryJob, gatherArtifacts, prepareModelJob, enqueueModelCall, pickLatest, applyInputsRequiredScope, validateWalletBalance, validateModelCostRates, getMaxOutputTokens, computeJobSig, compressPrompt, calculateAffordability, enqueueCompressJobs, getSortedCompressionCandidates, applyCompressionOverlay, textSplitter, constructStoragePath, tokenizerDeps, netlifyQueueUrl, netlifyApiKey, apiKeyForProvider and resolveCompressionSource. */
Deno.test("JobContextParams has the required surface", () => {
  const surface: Record<keyof JobContextParams, true> = {
    logger: true,
    fileManager: true,
    downloadFromStorage: true,
    deleteFromStorage: true,
    getAiProviderAdapter: true,
    getAiProviderConfig: true,
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
    retryJob: true,
    gatherArtifacts: true,
    prepareModelJob: true,
    enqueueModelCall: true,
    pickLatest: true,
    applyInputsRequiredScope: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    getMaxOutputTokens: true,
    computeJobSig: true,
    compressPrompt: true,
    calculateAffordability: true,
    enqueueCompressJobs: true,
    getSortedCompressionCandidates: true,
    applyCompressionOverlay: true,
    textSplitter: true,
    constructStoragePath: true,
    tokenizerDeps: true,
    netlifyQueueUrl: true,
    netlifyApiKey: true,
    apiKeyForProvider: true,
    resolveCompressionSource: true,
  };
  assert(surface.logger);
  assert(surface.fileManager);
  assert(surface.downloadFromStorage);
  assert(surface.deleteFromStorage);
  assert(surface.getAiProviderAdapter);
  assert(surface.getAiProviderConfig);
  assert(surface.countTokens);
  assert(surface.adminTokenWalletService);
  assert(surface.userTokenWalletService);
  assert(surface.notificationService);
  assert(surface.getSeedPromptForStage);
  assert(surface.promptAssembler);
  assert(surface.getExtensionFromMimeType);
  assert(surface.extractSourceGroupFragment);
  assert(surface.randomUUID);
  assert(surface.shouldEnqueueRenderJob);
  assert(surface.getGranularityPlanner);
  assert(surface.planComplexStage);
  assert(surface.findSourceDocuments);
  assert(surface.documentRenderer);
  assert(surface.assembleContributionChain);
  assert(surface.loadDocumentTemplate);
  assert(surface.mergeChunkContent);
  assert(surface.retryJob);
  assert(surface.gatherArtifacts);
  assert(surface.prepareModelJob);
  assert(surface.enqueueModelCall);
  assert(surface.pickLatest);
  assert(surface.applyInputsRequiredScope);
  assert(surface.validateWalletBalance);
  assert(surface.validateModelCostRates);
  assert(surface.getMaxOutputTokens);
  assert(surface.computeJobSig);
  assert(surface.compressPrompt);
  assert(surface.calculateAffordability);
  assert(surface.enqueueCompressJobs);
  assert(surface.getSortedCompressionCandidates);
  assert(surface.applyCompressionOverlay);
  assert(surface.textSplitter);
  assert(surface.constructStoragePath);
  assert(surface.tokenizerDeps);
  assert(surface.netlifyQueueUrl);
  assert(surface.netlifyApiKey);
  assert(surface.apiKeyForProvider);
  assert(surface.resolveCompressionSource);
});

/** Contract: PrepareModelJobDeps' required key surface is exactly logger, applyInputsRequiredScope, tokenWalletService, validateWalletBalance, validateModelCostRates, calculateAffordability, enqueueModelCall and compressPrompt. */
Deno.test("PrepareModelJobDeps has the required surface", () => {
  const surface: Record<keyof PrepareModelJobDeps, true> = {
    logger: true,
    applyInputsRequiredScope: true,
    tokenWalletService: true,
    validateWalletBalance: true,
    validateModelCostRates: true,
    calculateAffordability: true,
    enqueueModelCall: true,
    compressPrompt: true,
  };
  assert(surface.logger);
  assert(surface.applyInputsRequiredScope);
  assert(surface.tokenWalletService);
  assert(surface.validateWalletBalance);
  assert(surface.validateModelCostRates);
  assert(surface.calculateAffordability);
  assert(surface.enqueueModelCall);
  assert(surface.compressPrompt);
});

// --- Processor params surface cases ---

/** Contract: ProcessSimpleJobParams' required key surface is exactly dbClient. */
Deno.test("ProcessSimpleJobParams has the required surface", () => {
  const surface: Record<keyof ProcessSimpleJobParams, true> = {
    dbClient: true,
  };
  assert(surface.dbClient);
});

/** Contract: ProcessComplexJobParams' required key surface is exactly dbClient. */
Deno.test("ProcessComplexJobParams has the required surface", () => {
  const surface: Record<keyof ProcessComplexJobParams, true> = {
    dbClient: true,
  };
  assert(surface.dbClient);
});

/** Contract: ProcessRenderJobParams' required key surface is exactly dbClient. */
Deno.test("ProcessRenderJobParams has the required surface", () => {
  const surface: Record<keyof ProcessRenderJobParams, true> = {
    dbClient: true,
  };
  assert(surface.dbClient);
});

// --- Processor payload surface cases ---

/** Contract: ProcessSimpleJobPayload's required key surface is exactly job. */
Deno.test("ProcessSimpleJobPayload has the required surface", () => {
  const surface: Record<keyof ProcessSimpleJobPayload, true> = {
    job: true,
  };
  assert(surface.job);
});

/** Contract: ProcessComplexJobPayload's required key surface is exactly job. */
Deno.test("ProcessComplexJobPayload has the required surface", () => {
  const surface: Record<keyof ProcessComplexJobPayload, true> = {
    job: true,
  };
  assert(surface.job);
});

/** Contract: ProcessRenderJobPayload's required key surface is exactly job. */
Deno.test("ProcessRenderJobPayload has the required surface", () => {
  const surface: Record<keyof ProcessRenderJobPayload, true> = {
    job: true,
  };
  assert(surface.job);
});

// --- Processor return union membership cases ---

/** Contract: ProcessSimpleJobDispatchedReturn is a flavor of ProcessSimpleJobSuccessReturn, which is a member of ProcessSimpleJobReturn. */
Deno.test("ProcessSimpleJobDispatchedReturn is a flavor of the success arm and a member of the return union", () => {
  const dispatched: ProcessSimpleJobDispatchedReturn = { dispatched: true };
  const success: ProcessSimpleJobSuccessReturn = dispatched;
  const result: ProcessSimpleJobReturn = success;
  assert(result === dispatched);
});

/** Contract: ProcessSimpleJobDeferredReturn is a flavor of ProcessSimpleJobSuccessReturn, which is a member of ProcessSimpleJobReturn. */
Deno.test("ProcessSimpleJobDeferredReturn is a flavor of the success arm and a member of the return union", () => {
  const deferred: ProcessSimpleJobDeferredReturn = { deferred: true };
  const success: ProcessSimpleJobSuccessReturn = deferred;
  const result: ProcessSimpleJobReturn = success;
  assert(result === deferred);
});

/** Contract: ProcessSimpleJobErrorReturn is a member of ProcessSimpleJobReturn. */
Deno.test("ProcessSimpleJobErrorReturn is a member of the return union", () => {
  const error: ProcessSimpleJobErrorReturn = { error: new Error("test"), retriable: false };
  const result: ProcessSimpleJobReturn = error;
  assert(result === error);
});

/** Contract: ProcessComplexJobSuccessReturn is a member of ProcessComplexJobReturn. */
Deno.test("ProcessComplexJobSuccessReturn is a member of the return union", () => {
  const planned: ProcessComplexJobSuccessReturn = { planned: true };
  const result: ProcessComplexJobReturn = planned;
  assert(result === planned);
});

/** Contract: ProcessComplexJobErrorReturn is a member of ProcessComplexJobReturn. */
Deno.test("ProcessComplexJobErrorReturn is a member of the return union", () => {
  const error: ProcessComplexJobErrorReturn = { error: new Error("test"), retriable: false };
  const result: ProcessComplexJobReturn = error;
  assert(result === error);
});

/** Contract: ProcessRenderJobSuccessReturn is a member of ProcessRenderJobReturn. */
Deno.test("ProcessRenderJobSuccessReturn is a member of the return union", () => {
  const rendered: ProcessRenderJobSuccessReturn = { rendered: true };
  const result: ProcessRenderJobReturn = rendered;
  assert(result === rendered);
});

/** Contract: ProcessRenderJobErrorReturn is a member of ProcessRenderJobReturn. */
Deno.test("ProcessRenderJobErrorReturn is a member of the return union", () => {
  const error: ProcessRenderJobErrorReturn = { error: new Error("test"), retriable: false };
  const result: ProcessRenderJobReturn = error;
  assert(result === error);
});

// --- Processor Fn return-type assertions ---

/** Contract: ProcessSimpleJobFn resolves to its declared Promise<ProcessSimpleJobReturn>. */
Deno.test("ProcessSimpleJobFn resolves to its declared return type", () => {
  const success: ProcessSimpleJobDispatchedReturn = { dispatched: true };
  const returned: ReturnType<ProcessSimpleJobFn> = Promise.resolve(success);
  const declared: Promise<ProcessSimpleJobReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: ProcessComplexJobFn resolves to its declared Promise<ProcessComplexJobReturn>. */
Deno.test("ProcessComplexJobFn resolves to its declared return type", () => {
  const success: ProcessComplexJobSuccessReturn = { planned: true };
  const returned: ReturnType<ProcessComplexJobFn> = Promise.resolve(success);
  const declared: Promise<ProcessComplexJobReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: ProcessRenderJobFn resolves to its declared Promise<ProcessRenderJobReturn>. */
Deno.test("ProcessRenderJobFn resolves to its declared return type", () => {
  const success: ProcessRenderJobSuccessReturn = { rendered: true };
  const returned: ReturnType<ProcessRenderJobFn> = Promise.resolve(success);
  const declared: Promise<ProcessRenderJobReturn> = returned;
  assert(declared instanceof Promise);
});

// --- IJobProcessors surface ---

/** Contract: IJobProcessors' required key surface is exactly processSimpleJob, processComplexJob, planComplexStage, processRenderJob and processCompressJob. */
Deno.test("IJobProcessors has the required surface", () => {
  const surface: Record<keyof IJobProcessors, true> = {
    processSimpleJob: true,
    processComplexJob: true,
    planComplexStage: true,
    processRenderJob: true,
    processCompressJob: true,
  };
  assert(surface.processSimpleJob);
  assert(surface.processComplexJob);
  assert(surface.planComplexStage);
  assert(surface.processRenderJob);
  assert(surface.processCompressJob);
});
