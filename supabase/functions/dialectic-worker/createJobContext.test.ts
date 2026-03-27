// supabase/functions/dialectic-worker/createJobContext.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
  createJobContext,
  createExecuteModelCallContext,
  createPrepareModelJobContext,
  createPlanJobContext,
  createRenderJobContext,
} from './createJobContext.ts';
import {
  isIJobContext,
  isIExecuteModelCallContext,
  isIPrepareModelJobContext,
  isIPlanJobContext,
  isIRenderJobContext,
} from './type-guards/JobContext.type_guards.ts';
import {
  createMockJobContextParams,
  createMockRootContext,
  createMockBoundExecuteModelCallAndSave,
  createMockBoundEnqueueRenderJob,
} from './JobContext.mock.ts';
import type { BoundPrepareModelJobFn } from './JobContext.interface.ts';

describe('createJobContext Factory and Slicers', () => {
  describe('createJobContext', () => {
    it('updates createMockJobContextParams call sites to use prepareModelJob override', () => {
      const overridePrepareModelJob: BoundPrepareModelJobFn = async () => ({
        error: new Error('red test override'),
        retriable: false,
      });
      const params = createMockJobContextParams({
        prepareModelJob: overridePrepareModelJob,
      });
      const result = createJobContext(params);

      assertEquals(result.prepareModelJob, overridePrepareModelJob);
      assertEquals('executeModelCallAndSave' in result, false);
      assertEquals('callUnifiedAIModel' in result, false);
    });

    it('returns an object that passes isIJobContext with new context structure', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals(isIJobContext(result), true);
    });

    it('returns an object with prepareModelJob instead of executeModelCallAndSave', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals('prepareModelJob' in result, true);
      assertEquals(typeof result.prepareModelJob, 'function');
      assertEquals('executeModelCallAndSave' in result, false);
    });

    it('returns an object without callUnifiedAIModel', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals('callUnifiedAIModel' in result, false);
    });

    it('copies getSeedPromptForStage from params onto root IJobContext', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals(result.getSeedPromptForStage, params.getSeedPromptForStage);
    });
  });

  describe('createExecuteModelCallContext', () => {
    it('extracts only the 12 IExecuteModelCallContext fields from root IJobContext', () => {
      const root = createMockRootContext();
      const result = createExecuteModelCallContext(root);

      assertEquals(isIExecuteModelCallContext(result), true);
    });

    it('result passes isIExecuteModelCallContext guard', () => {
      const root = createMockRootContext();
      const result = createExecuteModelCallContext(root);

      assertEquals(isIExecuteModelCallContext(result), true);
    });

    it('result includes logger, fileManager, getAiProviderAdapter, tokenWalletService, notificationService, continueJob, retryJob, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens', () => {
      const root = createMockRootContext();
      const result = createExecuteModelCallContext(root);

      assertEquals(result.logger, root.logger);
      assertEquals(result.fileManager, root.fileManager);
      assertEquals(result.getAiProviderAdapter, root.getAiProviderAdapter);
      assertEquals(result.tokenWalletService, root.tokenWalletService);
      assertEquals(result.notificationService, root.notificationService);
      assertEquals(result.continueJob, root.continueJob);
      assertEquals(result.retryJob, root.retryJob);
      assertEquals(result.resolveFinishReason, root.resolveFinishReason);
      assertEquals(result.isIntermediateChunk, root.isIntermediateChunk);
      assertEquals(result.determineContinuation, root.determineContinuation);
      assertEquals(result.buildUploadContext, root.buildUploadContext);
      assertEquals(result.debitTokens, root.debitTokens);
    });

    it('result does NOT include ragService, countTokens, pickLatest, applyInputsRequiredScope, validateWalletBalance, validateModelCostRates, downloadFromStorage, embeddingClient, prepareModelJob', () => {
      const root = createMockRootContext();
      const result = createExecuteModelCallContext(root);

      assertEquals('ragService' in result, false);
      assertEquals('countTokens' in result, false);
      assertEquals('pickLatest' in result, false);
      assertEquals('applyInputsRequiredScope' in result, false);
      assertEquals('validateWalletBalance' in result, false);
      assertEquals('validateModelCostRates' in result, false);
      assertEquals('downloadFromStorage' in result, false);
      assertEquals('embeddingClient' in result, false);
      assertEquals('prepareModelJob' in result, false);
    });
  });

  describe('createPrepareModelJobContext', () => {
    it('extracts 10 raw fields from root IJobContext and receives 2 pre-bound closures as arguments', () => {
      const root = createMockRootContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
      );

      assertEquals(isIPrepareModelJobContext(result), true);
    });

    it('result passes isIPrepareModelJobContext guard', () => {
      const root = createMockRootContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
      );

      assertEquals(isIPrepareModelJobContext(result), true);
    });

    it('result includes logger, pickLatest, downloadFromStorage, applyInputsRequiredScope, countTokens, tokenWalletService, validateWalletBalance, validateModelCostRates, ragService, embeddingClient, executeModelCallAndSave, enqueueRenderJob', () => {
      const root = createMockRootContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
      );

      assertEquals(result.logger, root.logger);
      assertEquals(result.pickLatest, root.pickLatest);
      assertEquals(result.downloadFromStorage, root.downloadFromStorage);
      assertEquals(result.applyInputsRequiredScope, root.applyInputsRequiredScope);
      assertEquals(result.countTokens, root.countTokens);
      assertEquals(result.tokenWalletService, root.tokenWalletService);
      assertEquals(result.validateWalletBalance, root.validateWalletBalance);
      assertEquals(result.validateModelCostRates, root.validateModelCostRates);
      assertEquals(result.ragService, root.ragService);
      assertEquals(result.embeddingClient, root.embeddingClient);
      assertEquals(result.executeModelCallAndSave, boundExecuteModelCallAndSave);
      assertEquals(result.enqueueRenderJob, boundEnqueueRenderJob);
    });

    it('result does NOT include fileManager, continueJob, retryJob, getAiProviderAdapter, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens, notificationService, prepareModelJob', () => {
      const root = createMockRootContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
      );

      assertEquals('fileManager' in result, false);
      assertEquals('continueJob' in result, false);
      assertEquals('retryJob' in result, false);
      assertEquals('getAiProviderAdapter' in result, false);
      assertEquals('resolveFinishReason' in result, false);
      assertEquals('isIntermediateChunk' in result, false);
      assertEquals('determineContinuation' in result, false);
      assertEquals('buildUploadContext' in result, false);
      assertEquals('debitTokens' in result, false);
      assertEquals('notificationService' in result, false);
      assertEquals('prepareModelJob' in result, false);
    });
  });

  describe('createPlanJobContext', () => {
    it('still works unchanged and passes isIPlanJobContext', () => {
      const root = createMockRootContext();
      const result = createPlanJobContext(root);

      assertEquals(isIPlanJobContext(result), true);
    });
  });

  describe('createRenderJobContext', () => {
    it('still works unchanged and passes isIRenderJobContext', () => {
      const root = createMockRootContext();
      const result = createRenderJobContext(root);

      assertEquals(isIRenderJobContext(result), true);
    });
  });
});
