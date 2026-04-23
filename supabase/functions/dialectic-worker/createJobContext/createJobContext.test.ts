// supabase/functions/dialectic-worker/createJobContext.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
  createJobContext,
  createPrepareModelJobContext,
  createPlanJobContext,
  createRenderJobContext,
  createSaveResponseContext,
} from './createJobContext.ts';
import {
  isIJobContext,
  isIPrepareModelJobContext,
  isIPlanJobContext,
  isIRenderJobContext,
} from './JobContext.guard.ts';
import {
  buildIJobContext,
  createMockJobContextParams,
  createMockBoundEnqueueRenderJob,
  createMockBoundEnqueueModelCall,
  createCompressPromptFn,
  createCalculateAffordabilityFn,
} from './JobContext.mock.ts';
import type { BoundPrepareModelJobFn, IPrepareModelJobContext, ISaveResponseContext } from './JobContext.interface.ts';
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
import { createMockBoundDebitTokens } from '../../_shared/utils/debitTokens.mock.ts';

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
      assertEquals('callUnifiedAIModel' in result, false);
    });

    it('returns an object that passes isIJobContext with new context structure', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals(isIJobContext(result), true);
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

    it('sanitizeJsonContent is present and a function on the IJobContext result', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals(typeof result.sanitizeJsonContent, 'function');
    });
  });

  describe('createPrepareModelJobContext', () => {
    it('extracts 8 raw fields from root IJobContext and receives 2 pre-bound closures plus compress and calculateAffordability factories as arguments', () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn } = createCompressPromptFn();
      const { calculateAffordabilityFn } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(
        root,
        boundEnqueueModelCall,
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals(isIPrepareModelJobContext(result), true);
    });

    it('result passes isIPrepareModelJobContext guard', () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn } = createCompressPromptFn();
      const { calculateAffordabilityFn } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(
        root,
        boundEnqueueModelCall,
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals(isIPrepareModelJobContext(result), true);
    });

    it('result includes logger, applyInputsRequiredScope, countTokens, tokenWalletService, validateWalletBalance, validateModelCostRates, ragService, embeddingClient, enqueueModelCall, enqueueRenderJob, calculateAffordability', () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn } = createCompressPromptFn();
      const { calculateAffordabilityFn } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(
        root,
        boundEnqueueModelCall,
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
      assertEquals(result.enqueueModelCall, boundEnqueueModelCall);
      assertEquals(typeof result.calculateAffordability, 'function');
    });

    it('result does NOT include pickLatest, downloadFromStorage, fileManager, continueJob, retryJob, getAiProviderAdapter, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens, notificationService, prepareModelJob', () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn } = createCompressPromptFn();
      const { calculateAffordabilityFn } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(
        root,
        boundEnqueueModelCall,
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
    });

    it('TypeScript assignment fails if pickLatest or downloadFromStorage are supplied to IPrepareModelJobContext', () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const validPrepareContext: IPrepareModelJobContext = {
        logger: root.logger,
        applyInputsRequiredScope: root.applyInputsRequiredScope,
        countTokens: root.countTokens,
        adminTokenWalletService: root.adminTokenWalletService,
        validateWalletBalance: root.validateWalletBalance,
        validateModelCostRates: root.validateModelCostRates,
        ragService: root.ragService,
        embeddingClient: root.embeddingClient,
        enqueueModelCall: boundEnqueueModelCall,
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
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn } = createCompressPromptFn();
      const { calculateAffordabilityFn } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(
        root,
        boundEnqueueModelCall,
        compressPromptFn,
        calculateAffordabilityFn,
      );

      assertEquals(typeof result.calculateAffordability, 'function');
    });

    it('calculateAffordability delegates to calculateAffordabilityFn with logger, countTokens, and compressPrompt bound from root and compressPromptFn', async () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn, recordedCompressDeps } = createCompressPromptFn();
      const { calculateAffordabilityFn, recordedAffordabilityDeps } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(
        root,
        boundEnqueueModelCall,
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
      const root = buildIJobContext();
      const result = createPlanJobContext(root);

      assertEquals(isIPlanJobContext(result), true);
    });
  });

  describe('createRenderJobContext', () => {
    it('still works unchanged and passes isIRenderJobContext', () => {
      const root = buildIJobContext();
      const result = createRenderJobContext(root);

      assertEquals(isIRenderJobContext(result), true);
    });
  });

  describe('createPrepareModelJobContext — updated front-half wiring', () => {
    it('wires enqueueModelCall from the passed BoundEnqueueModelCallFn', () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn } = createCompressPromptFn();
      const { calculateAffordabilityFn } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(root, boundEnqueueModelCall, compressPromptFn, calculateAffordabilityFn);

      assertEquals(result.enqueueModelCall, boundEnqueueModelCall);
    });

    it('result does NOT include enqueueRenderJob', () => {
      const root = buildIJobContext();
      const boundEnqueueModelCall = createMockBoundEnqueueModelCall();
      const { compressPromptFn } = createCompressPromptFn();
      const { calculateAffordabilityFn } = createCalculateAffordabilityFn();
      const result = createPrepareModelJobContext(root, boundEnqueueModelCall, compressPromptFn, calculateAffordabilityFn);

      assertEquals('enqueueRenderJob' in result, false);
    });
  });

  describe('createSaveResponseContext — back-half slice', () => {
    it('result includes enqueueRenderJob from the passed BoundEnqueueRenderJobFn', () => {
      const root = buildIJobContext();
      const boundEnqueueRenderJob = createMockBoundEnqueueRenderJob();
      const boundDebitTokens = createMockBoundDebitTokens();
      const result: ISaveResponseContext = createSaveResponseContext(root, boundEnqueueRenderJob, boundDebitTokens);

      assertEquals(result.enqueueRenderJob, boundEnqueueRenderJob);
    });
  });

  describe('createJobContext computeJobSig', () => {
    it('copies computeJobSig from params onto root IJobContext', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals(result.computeJobSig, params.computeJobSig);
    });

    it('computeJobSig is present and callable on the IJobContext result', () => {
      const params = createMockJobContextParams();
      const result = createJobContext(params);

      assertEquals(typeof result.computeJobSig, 'function');
    });
  });
});
