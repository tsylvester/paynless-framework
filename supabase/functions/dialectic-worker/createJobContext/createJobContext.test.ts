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
} from './JobContext.guard.ts';
import {
  buildGuardTestIJobContext,
  createMockJobContextParams,
  createMockBoundExecuteModelCallAndSave,
  createMockBoundEnqueueRenderJob,
  createRecordingCompressPromptFnForPrepareContextContract,
  createRecordingCalculateAffordabilityFnForPrepareContextContract,
} from './JobContext.mock.ts';
import type { BoundPrepareModelJobFn, IPrepareModelJobContext } from './JobContext.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import {
  buildGatherArtifactsPayload,
  buildGatherArtifactsParams,
} from '../gatherArtifacts/gatherArtifacts.mock.ts';
import type {
  GatherArtifactsParams,
  GatherArtifactsPayload,
} from '../gatherArtifacts/gatherArtifacts.interface.ts';
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import {
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
  buildMockBoundCalculateAffordabilityFn,
} from '../calculateAffordability/calculateAffordability.mock.ts';
import {
  buildCompressPromptParams,
  buildCompressPromptPayload,
  DbClient,
} from '../compressPrompt/compressPrompt.mock.ts';
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

    it('has gatherArtifacts present and callable', async () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);
      const { client: dbClient } = createMockSupabaseClient();
      const gatherParams = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
      const gatherPayload = buildGatherArtifactsPayload();

      assertEquals(typeof result.gatherArtifacts, 'function');
      await result.gatherArtifacts(gatherParams, gatherPayload);
    });

    it('ctx.gatherArtifacts delegates to the bound gatherArtifacts closure', async () => {
      const calls: {
        params: GatherArtifactsParams;
        payload: GatherArtifactsPayload;
      }[] = [];
      const gatherArtifacts = async (
        paramsArg: GatherArtifactsParams,
        payloadArg: GatherArtifactsPayload,
      ) => {
        calls.push({ params: paramsArg, payload: payloadArg });
        return { artifacts: [] };
      };
      const params = createMockJobContextParams({ gatherArtifacts });
      const result = createJobContext(params);
      const { client: dbClient } = createMockSupabaseClient();
      const gatherParams = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
      const gatherPayload = buildGatherArtifactsPayload();

      await result.gatherArtifacts(gatherParams, gatherPayload);

      assertEquals(calls.length, 1);
      assertEquals(calls[0].params, gatherParams);
      assertEquals(calls[0].payload, gatherPayload);
    });
  });

  describe('createExecuteModelCallContext', () => {
    it('extracts only the 12 IExecuteModelCallContext fields from root IJobContext', () => {
      const root = buildGuardTestIJobContext();
      const result = createExecuteModelCallContext(root);

      assertEquals(isIExecuteModelCallContext(result), true);
    });

    it('result passes isIExecuteModelCallContext guard', () => {
      const root = buildGuardTestIJobContext();
      const result = createExecuteModelCallContext(root);

      assertEquals(isIExecuteModelCallContext(result), true);
    });

    it('result includes logger, fileManager, getAiProviderAdapter, tokenWalletService, notificationService, continueJob, retryJob, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens', () => {
      const root = buildGuardTestIJobContext();
      const result = createExecuteModelCallContext(root);

      assertEquals(result.logger, root.logger);
      assertEquals(result.fileManager, root.fileManager);
      assertEquals(result.getAiProviderAdapter, root.getAiProviderAdapter);
      assertEquals(result.userTokenWalletService, root.userTokenWalletService);
      assertEquals(result.notificationService, root.notificationService);
      assertEquals(result.continueJob, root.continueJob);
      assertEquals(result.retryJob, root.retryJob);
      assertEquals(result.resolveFinishReason, root.resolveFinishReason);
      assertEquals(result.isIntermediateChunk, root.isIntermediateChunk);
      assertEquals(result.determineContinuation, root.determineContinuation);
      assertEquals(result.buildUploadContext, root.buildUploadContext);
      assertEquals(typeof result.debitTokens, 'function');
    });

    it('result does NOT include ragService, countTokens, pickLatest, applyInputsRequiredScope, validateWalletBalance, validateModelCostRates, downloadFromStorage, embeddingClient, prepareModelJob', () => {
      const root = buildGuardTestIJobContext();
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
    it('extracts 8 raw fields from root IJobContext and receives 2 pre-bound closures plus compress and calculateAffordability factories as arguments', () => {
      const root = buildGuardTestIJobContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const { compressPromptFn } = createRecordingCompressPromptFnForPrepareContextContract();
      const { calculateAffordabilityFn } = createRecordingCalculateAffordabilityFnForPrepareContextContract();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals(isIPrepareModelJobContext(result), true);
    });

    it('result passes isIPrepareModelJobContext guard', () => {
      const root = buildGuardTestIJobContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const { compressPromptFn } = createRecordingCompressPromptFnForPrepareContextContract();
      const { calculateAffordabilityFn } = createRecordingCalculateAffordabilityFnForPrepareContextContract();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals(isIPrepareModelJobContext(result), true);
    });

    it('result includes logger, applyInputsRequiredScope, countTokens, tokenWalletService, validateWalletBalance, validateModelCostRates, ragService, embeddingClient, executeModelCallAndSave, enqueueRenderJob, calculateAffordability', () => {
      const root = buildGuardTestIJobContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const { compressPromptFn } = createRecordingCompressPromptFnForPrepareContextContract();
      const { calculateAffordabilityFn } = createRecordingCalculateAffordabilityFnForPrepareContextContract();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals(result.logger, root.logger);
      assertEquals(result.applyInputsRequiredScope, root.applyInputsRequiredScope);
      assertEquals(result.countTokens, root.countTokens);
      assertEquals(result.adminTokenWalletService, root.adminTokenWalletService);
      assertEquals(result.validateWalletBalance, root.validateWalletBalance);
      assertEquals(result.validateModelCostRates, root.validateModelCostRates);
      assertEquals(result.ragService, root.ragService);
      assertEquals(result.embeddingClient, root.embeddingClient);
      assertEquals(result.executeModelCallAndSave, boundExecuteModelCallAndSave);
      assertEquals(result.enqueueRenderJob, boundEnqueueRenderJob);
      assertEquals(typeof result.calculateAffordability, 'function');
    });

    it('result does NOT include pickLatest, downloadFromStorage, fileManager, continueJob, retryJob, getAiProviderAdapter, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens, notificationService, prepareModelJob', () => {
      const root = buildGuardTestIJobContext();
      const boundExecuteModelCallAndSave = createMockBoundExecuteModelCallAndSave();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const { compressPromptFn } = createRecordingCompressPromptFnForPrepareContextContract();
      const { calculateAffordabilityFn } = createRecordingCalculateAffordabilityFnForPrepareContextContract();
      const result = createPrepareModelJobContext(
        root,
        boundExecuteModelCallAndSave,
        boundEnqueueRenderJob,
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals('pickLatest' in result, false);
      assertEquals('downloadFromStorage' in result, false);
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

    it('TypeScript assignment fails if pickLatest or downloadFromStorage are supplied to IPrepareModelJobContext', () => {
      const root = buildGuardTestIJobContext();
      const validPrepareContext: IPrepareModelJobContext = {
        logger: root.logger,
        applyInputsRequiredScope: root.applyInputsRequiredScope,
        countTokens: root.countTokens,
        adminTokenWalletService: root.adminTokenWalletService,
        validateWalletBalance: root.validateWalletBalance,
        validateModelCostRates: root.validateModelCostRates,
        ragService: root.ragService,
        embeddingClient: root.embeddingClient,
        executeModelCallAndSave: async () => ({ error: new Error('mock'), retriable: false }),
        enqueueRenderJob: async () => ({ error: new Error('mock'), retriable: false }),
        calculateAffordability: buildMockBoundCalculateAffordabilityFn(),
      };

      assertEquals(typeof validPrepareContext.logger, 'object');

      const invalidWithPickLatest: IPrepareModelJobContext = {
        ...validPrepareContext,
        pickLatest: root.pickLatest,
      } as unknown as IPrepareModelJobContext;
      
      assertEquals(typeof invalidWithPickLatest, 'object');

      const invalidWithDownloadFromStorage: IPrepareModelJobContext = {
        ...validPrepareContext,
        downloadFromStorage: root.downloadFromStorage,
      } as unknown as IPrepareModelJobContext;

      assertEquals(typeof invalidWithDownloadFromStorage, 'object');
    });

    it('returned IPrepareModelJobContext has calculateAffordability present and callable', () => {
      const root = buildGuardTestIJobContext();
      const { compressPromptFn } = createRecordingCompressPromptFnForPrepareContextContract();
      const { calculateAffordabilityFn } = createRecordingCalculateAffordabilityFnForPrepareContextContract();
      const result = createPrepareModelJobContext(
        root,
        createMockBoundExecuteModelCallAndSave(),
        createMockBoundEnqueueRenderJob(),
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals(typeof result.calculateAffordability, 'function');
    });

    it('calculateAffordability delegates to calculateAffordabilityFn with logger, countTokens, and compressPrompt bound from root and compressPromptFn', async () => {
      const root = buildGuardTestIJobContext();
      const { compressPromptFn, recordedCompressDeps } =
        createRecordingCompressPromptFnForPrepareContextContract();
      const { calculateAffordabilityFn, recordedAffordabilityDeps } =
        createRecordingCalculateAffordabilityFnForPrepareContextContract();
      const result = createPrepareModelJobContext(
        root,
        createMockBoundExecuteModelCallAndSave(),
        createMockBoundEnqueueRenderJob(),
        compressPromptFn,
        calculateAffordabilityFn,
      );
      const { client } = createMockSupabaseClient();
      const dbClient: SupabaseClient<Database> = DbClient(client);
      const params = buildCalculateAffordabilityParams(dbClient);
      const payload = buildCalculateAffordabilityPayload();

      await result.calculateAffordability(params, payload);

      assertEquals(recordedAffordabilityDeps.length, 1);
      assertEquals(recordedAffordabilityDeps[0].logger, root.logger);
      assertEquals(recordedAffordabilityDeps[0].countTokens, root.countTokens);
      await recordedAffordabilityDeps[0].compressPrompt(
        buildCompressPromptParams(dbClient),
        buildCompressPromptPayload(),
      );
      assertEquals(recordedCompressDeps.length, 1);
      assertEquals(recordedCompressDeps[0].logger, root.logger);
      assertEquals(recordedCompressDeps[0].ragService, root.ragService);
      assertEquals(recordedCompressDeps[0].embeddingClient, root.embeddingClient);
      assertEquals(recordedCompressDeps[0].tokenWalletService, root.adminTokenWalletService);
      assertEquals(recordedCompressDeps[0].countTokens, root.countTokens);
    });
  });

  describe('createPlanJobContext', () => {
    it('still works unchanged and passes isIPlanJobContext', () => {
      const root = buildGuardTestIJobContext();
      const result = createPlanJobContext(root);

      assertEquals(isIPlanJobContext(result), true);
    });
  });

  describe('createRenderJobContext', () => {
    it('still works unchanged and passes isIRenderJobContext', () => {
      const root = buildGuardTestIJobContext();
      const result = createRenderJobContext(root);

      assertEquals(isIRenderJobContext(result), true);
    });
  });
});
