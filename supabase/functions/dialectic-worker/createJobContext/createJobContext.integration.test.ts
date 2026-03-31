import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
  createJobContext,
  createExecuteModelCallContext,
  createPrepareModelJobContext,
  createPlanJobContext,
  createRenderJobContext,
} from './createJobContext.ts';
import {
  createMockJobContextParams,
  createMockBoundExecuteModelCallAndSave,
  createMockBoundEnqueueRenderJob,
} from './JobContext.mock.ts';
import type {
  IExecuteModelCallContext,
  IJobContext,
  IPlanJobContext,
  IPrepareModelJobContext,
  IRenderJobContext,
} from './JobContext.interface.ts';

Deno.test('Integration: constructed context passes structural check against IJobContext and slicers build expected objects', () => {
  const params = createMockJobContextParams();
  const rootContext: IJobContext = createJobContext(params);

  assertEquals(rootContext.logger, params.logger);
  assertEquals(rootContext.fileManager, params.fileManager);
  assertEquals(rootContext.downloadFromStorage, params.downloadFromStorage);
  assertEquals(rootContext.deleteFromStorage, params.deleteFromStorage);
  assertEquals(rootContext.getAiProviderAdapter, params.getAiProviderAdapter);
  assertEquals(rootContext.getAiProviderConfig, params.getAiProviderConfig);
  assertEquals(rootContext.ragService, params.ragService);
  assertEquals(rootContext.indexingService, params.indexingService);
  assertEquals(rootContext.embeddingClient, params.embeddingClient);
  assertEquals(rootContext.countTokens, params.countTokens);
  assertEquals(rootContext.tokenWalletService, params.tokenWalletService);
  assertEquals(rootContext.notificationService, params.notificationService);
  assertEquals(rootContext.promptAssembler, params.promptAssembler);
  assertEquals(rootContext.getSeedPromptForStage, params.getSeedPromptForStage);
  assertEquals(rootContext.gatherArtifacts, params.gatherArtifacts);
  assertEquals(rootContext.continueJob, params.continueJob);
  assertEquals(rootContext.retryJob, params.retryJob);
  assertEquals(rootContext.pickLatest, params.pickLatest);
  assertEquals(rootContext.applyInputsRequiredScope, params.applyInputsRequiredScope);
  assertEquals(rootContext.validateWalletBalance, params.validateWalletBalance);
  assertEquals(rootContext.validateModelCostRates, params.validateModelCostRates);
  assertEquals(rootContext.resolveFinishReason, params.resolveFinishReason);
  assertEquals(rootContext.isIntermediateChunk, params.isIntermediateChunk);
  assertEquals(rootContext.determineContinuation, params.determineContinuation);
  assertEquals(rootContext.buildUploadContext, params.buildUploadContext);
  assertEquals(rootContext.getGranularityPlanner, params.getGranularityPlanner);
  assertEquals(rootContext.planComplexStage, params.planComplexStage);
  assertEquals(rootContext.findSourceDocuments, params.findSourceDocuments);
  assertEquals(rootContext.documentRenderer, params.documentRenderer);
  assertEquals(rootContext.prepareModelJob, params.prepareModelJob);
  assertEquals(rootContext.debitTokens, params.debitTokens);

  const executeContext: IExecuteModelCallContext = createExecuteModelCallContext(rootContext);
  assertEquals(executeContext.logger, rootContext.logger);
  assertEquals(executeContext.fileManager, rootContext.fileManager);
  assertEquals(executeContext.getAiProviderAdapter, rootContext.getAiProviderAdapter);
  assertEquals(executeContext.tokenWalletService, rootContext.tokenWalletService);
  assertEquals(executeContext.notificationService, rootContext.notificationService);
  assertEquals(executeContext.continueJob, rootContext.continueJob);
  assertEquals(executeContext.retryJob, rootContext.retryJob);
  assertEquals(executeContext.resolveFinishReason, rootContext.resolveFinishReason);
  assertEquals(executeContext.isIntermediateChunk, rootContext.isIntermediateChunk);
  assertEquals(executeContext.determineContinuation, rootContext.determineContinuation);
  assertEquals(executeContext.buildUploadContext, rootContext.buildUploadContext);
  assertEquals(executeContext.debitTokens, rootContext.debitTokens);
  assertEquals('ragService' in executeContext, false);
  assertEquals('countTokens' in executeContext, false);
  assertEquals('prepareModelJob' in executeContext, false);

  const planContext: IPlanJobContext = createPlanJobContext(rootContext);
  assertEquals(planContext.logger, rootContext.logger);
  assertEquals(planContext.notificationService, rootContext.notificationService);
  assertEquals(planContext.getGranularityPlanner, rootContext.getGranularityPlanner);
  assertEquals(planContext.planComplexStage, rootContext.planComplexStage);
  assertEquals(planContext.findSourceDocuments, rootContext.findSourceDocuments);
  assertEquals('fileManager' in planContext, false);
  assertEquals('prepareModelJob' in planContext, false);

  const renderContext: IRenderJobContext = createRenderJobContext(rootContext);
  assertEquals(renderContext.logger, rootContext.logger);
  assertEquals(renderContext.fileManager, rootContext.fileManager);
  assertEquals(renderContext.downloadFromStorage, rootContext.downloadFromStorage);
  assertEquals(renderContext.deleteFromStorage, rootContext.deleteFromStorage);
  assertEquals(renderContext.notificationService, rootContext.notificationService);
  assertEquals(renderContext.documentRenderer, rootContext.documentRenderer);
  assertEquals('prepareModelJob' in renderContext, false);
  assertEquals('getAiProviderAdapter' in renderContext, false);
});

Deno.test('Integration: createPrepareModelJobContext result passes structural check against updated IPrepareModelJobContext', () => {
  const params = createMockJobContextParams();
  const rootContext: IJobContext = createJobContext(params);
  const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
  const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();

  const prepareContext: IPrepareModelJobContext = createPrepareModelJobContext(
    rootContext,
    boundExecuteModelCallAndSave,
    boundEnqueueRenderJob,
  );

  assertEquals(prepareContext.logger, rootContext.logger);
  assertEquals(prepareContext.applyInputsRequiredScope, rootContext.applyInputsRequiredScope);
  assertEquals(prepareContext.countTokens, rootContext.countTokens);
  assertEquals(prepareContext.tokenWalletService, rootContext.tokenWalletService);
  assertEquals(prepareContext.validateWalletBalance, rootContext.validateWalletBalance);
  assertEquals(prepareContext.validateModelCostRates, rootContext.validateModelCostRates);
  assertEquals(prepareContext.ragService, rootContext.ragService);
  assertEquals(prepareContext.embeddingClient, rootContext.embeddingClient);
  assertEquals(prepareContext.executeModelCallAndSave, boundExecuteModelCallAndSave);
  assertEquals(prepareContext.enqueueRenderJob, boundEnqueueRenderJob);
  assertEquals('pickLatest' in prepareContext, false);
  assertEquals('downloadFromStorage' in prepareContext, false);
  assertEquals('fileManager' in prepareContext, false);
  assertEquals('continueJob' in prepareContext, false);
  assertEquals('retryJob' in prepareContext, false);
  assertEquals('getAiProviderAdapter' in prepareContext, false);
  assertEquals('resolveFinishReason' in prepareContext, false);
  assertEquals('isIntermediateChunk' in prepareContext, false);
  assertEquals('determineContinuation' in prepareContext, false);
  assertEquals('buildUploadContext' in prepareContext, false);
  assertEquals('debitTokens' in prepareContext, false);
  assertEquals('notificationService' in prepareContext, false);
  assertEquals('prepareModelJob' in prepareContext, false);
});
