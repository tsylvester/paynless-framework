import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  createJobContext,
  createExecuteModelCallContext,
  createPrepareModelJobContext,
  createPlanJobContext,
  createRenderJobContext,
} from './createJobContext.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';
import type {
  BoundPrepareModelJobFn,
  IExecuteModelCallContext,
  IJobContext,
  IPlanJobContext,
  IPrepareModelJobContext,
  IRenderJobContext,
} from './JobContext.interface.ts';
import { compressPrompt } from '../compressPrompt/compressPrompt.ts';
import { calculateAffordability } from '../calculateAffordability/calculateAffordability.ts';
import { BoundExecuteModelCallAndSaveFn } from '../executeModelCallAndSave/executeModelCallAndSave.interface.ts';
import { BoundEnqueueRenderJobFn } from '../enqueueRenderJob/enqueueRenderJob.interface.ts';
import { BoundEnqueueModelCallFn } from '../enqueueModelCall/enqueueModelCall.interface.ts';
import { enqueueModelCall } from '../enqueueModelCall/enqueueModelCall.ts';
import { prepareModelJob } from '../prepareModelJob/prepareModelJob.ts';
import type {
  PrepareModelJobDeps,
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from '../prepareModelJob/prepareModelJob.interface.ts';
import type {
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
} from '../../dialectic-service/dialectic.interface.ts';
import type { ApiKeyForProviderFn } from '../../_shared/types.ts';
import type { Database, Tables } from '../../types_db.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { MockLogger } from '../../_shared/logger.mock.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { isRecord, isJson } from '../../_shared/utils/type-guards/type_guards.common.ts';
import { getSortedCompressionCandidates } from '../../_shared/utils/vector_utils.ts';

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
  assertEquals(rootContext.adminTokenWalletService, params.adminTokenWalletService);
  assertEquals(rootContext.userTokenWalletService, params.userTokenWalletService);
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
  assertEquals(executeContext.userTokenWalletService, rootContext.userTokenWalletService);
  assertEquals(executeContext.notificationService, rootContext.notificationService);
  assertEquals(executeContext.continueJob, rootContext.continueJob);
  assertEquals(executeContext.retryJob, rootContext.retryJob);
  assertEquals(executeContext.resolveFinishReason, rootContext.resolveFinishReason);
  assertEquals(executeContext.isIntermediateChunk, rootContext.isIntermediateChunk);
  assertEquals(executeContext.determineContinuation, rootContext.determineContinuation);
  assertEquals(executeContext.buildUploadContext, rootContext.buildUploadContext);
  assertEquals(typeof executeContext.debitTokens, 'function');
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
  const boundEnqueueModelCall: BoundEnqueueModelCallFn = async () => ({
    error: new Error('integration boundary stub render'),
    retriable: false,
  });

  const prepareContext: IPrepareModelJobContext = createPrepareModelJobContext(
    rootContext,
    boundEnqueueModelCall,
    compressPrompt,
    calculateAffordability,
  );

  assertEquals(prepareContext.logger, rootContext.logger);
  assertEquals(prepareContext.applyInputsRequiredScope, rootContext.applyInputsRequiredScope);
  assertEquals(prepareContext.countTokens, rootContext.countTokens);
  assertEquals(prepareContext.adminTokenWalletService, rootContext.adminTokenWalletService);
  assertEquals(prepareContext.validateWalletBalance, rootContext.validateWalletBalance);
  assertEquals(prepareContext.validateModelCostRates, rootContext.validateModelCostRates);
  assertEquals(prepareContext.ragService, rootContext.ragService);
  assertEquals(prepareContext.embeddingClient, rootContext.embeddingClient);
  assertEquals(prepareContext.enqueueModelCall, boundEnqueueModelCall);
  assertEquals(typeof prepareContext.calculateAffordability, 'function');
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

Deno.test('Integration: Phase 1 chain — ctx.prepareModelJob wired through createPrepareModelJobContext calls enqueueModelCall, writes queued to DB, POSTs to Netlify, returns { queued: true }', async () => {
  // Netlify boundary constants
  const netlifyQueueUrl = 'https://integration-test.netlify/.netlify/functions/async-workloads-router';
  const netlifyApiKey = 'integration-test-awl-key';
  const apiIdentifier = 'contract-api-v1';
  const apiKeyForProvider: ApiKeyForProviderFn = (_id: string) => 'integration-provider-api-key';

  // Mock DB client — boundary; provides dialectic_generation_jobs update for enqueueModelCall
  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{}], error: null },
      },
    },
  });
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

  // Valid provider row — boundary data with full AiModelExtendedConfig
  const providerRow: Tables<'ai_providers'> = {
    id: 'integration-model-id',
    provider: 'integration-provider',
    name: 'Integration AI',
    api_identifier: apiIdentifier,
    config: {
      api_identifier: apiIdentifier,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      tokenization_strategy: { type: 'rough_char_count' },
      context_window_tokens: 128000,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 500,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: null,
    is_active: true,
    is_enabled: true,
    is_default_embedding: false,
    is_default_generation: false,
  };

  // Stub fetch — boundary; returns 200 OK for the Netlify queue POST
  const fetchStub = stub(globalThis, 'fetch', (): Promise<Response> =>
    Promise.resolve(new Response('{}', { status: 200 })));

  try {
    // Wire real enqueueModelCall as BoundEnqueueModelCallFn (dep boundary: logger, urls)
    const boundEnqueueModelCall: BoundEnqueueModelCallFn = (params, payload) =>
      enqueueModelCall(
        {
          logger: new MockLogger(),
          netlifyQueueUrl,
          netlifyApiKey,
          apiKeyForProvider,
        },
        params,
        payload,
      );

    // Extract shared mock deps (wallet service, logger, etc.) via mock params
    const sharedParams = createMockJobContextParams();
    const tempRoot: IJobContext = createJobContext(sharedParams);

    // Create IPrepareModelJobContext via the real slicer being tested
    const prepCtx: IPrepareModelJobContext = createPrepareModelJobContext(
      tempRoot,
      boundEnqueueModelCall,
      compressPrompt,
      calculateAffordability,
    );

    // Build PrepareModelJobDeps — tokenWalletService is a boundary dep (IUserTokenWalletService)
    const prepDeps: PrepareModelJobDeps = {
      logger: prepCtx.logger,
      applyInputsRequiredScope: prepCtx.applyInputsRequiredScope,
      tokenWalletService: sharedParams.userTokenWalletService,
      validateWalletBalance: prepCtx.validateWalletBalance,
      validateModelCostRates: prepCtx.validateModelCostRates,
      calculateAffordability: prepCtx.calculateAffordability,
      enqueueModelCall: prepCtx.enqueueModelCall,
    };

    // Bind real prepareModelJob as BoundPrepareModelJobFn
    const boundPrepareModelJob: BoundPrepareModelJobFn = (params, payload) =>
      prepareModelJob(prepDeps, params, payload);

    // Wire final IJobContext with the real BoundPrepareModelJobFn
    const ctx: IJobContext = createJobContext(createMockJobContextParams({ prepareModelJob: boundPrepareModelJob }));

    // Build the execute job payload (must pass isDialecticExecuteJobPayload)
    const executePayload: DialecticExecuteJobPayload = {
      sessionId: 'phase1-session-id',
      projectId: 'phase1-project-id',
      stageSlug: 'thesis',
      model_id: 'integration-model-id',
      iterationNumber: 1,
      continueUntilComplete: false,
      walletId: 'phase1-wallet-id',
      user_jwt: 'integration-user-jwt',
      prompt_template_id: 'phase1-prompt-template-id',
      output_type: FileType.HeaderContext,
      canonicalPathParams: { contributionType: 'thesis', stageSlug: 'thesis' },
      inputs: {},
      idempotencyKey: 'phase1-idem',
    };

    if (!isJson(executePayload)) {
      throw new Error('Execute payload is not a valid JSON object');
    }
    const job: DialecticJobRow = {
      id: 'integration-job-id',
      session_id: 'phase1-session-id',
      stage_slug: 'thesis',
      iteration_number: 1,
      status: 'pending',
      user_id: 'integration-user-id',
      attempt_count: 0,
      completed_at: null,
      created_at: new Date().toISOString(),
      error_details: null,
      max_retries: 3,
      parent_job_id: null,
      payload: executePayload,
      prerequisite_job_id: null,
      results: null,
      started_at: null,
      target_contribution_id: null,
      is_test_job: false,
      job_type: 'EXECUTE',
      idempotency_key: 'phase1-idem',
    };

    const sessionData: DialecticSessionRow = {
      id: 'phase1-session-id',
      project_id: 'phase1-project-id',
      session_description: 'phase1 integration test session',
      user_input_reference_url: null,
      iteration_count: 1,
      selected_model_ids: ['integration-model-id'],
      status: 'in-progress',
      associated_chat_id: null,
      current_stage_id: 'integration-stage-id',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      viewing_stage_id: null,
      idempotency_key: null,
    };

    const prepParams: PrepareModelJobParams = {
      dbClient,
      authToken: 'integration-user-jwt',
      job,
      projectOwnerUserId: 'integration-owner-id',
      providerRow,
      sessionData,
    };

    const prepPayload: PrepareModelJobPayload = {
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: 'integration test user prompt',
        source_prompt_resource_id: 'integration-source-prompt-id',
      },
      compressionStrategy: getSortedCompressionCandidates,
    };

    // Invoke ctx.prepareModelJob — this is the call processSimpleJob makes in Phase 1
    const result = await ctx.prepareModelJob(prepParams, prepPayload);

    // Assert: returns { queued: true } — processSimpleJob would receive this and exit cleanly
    assertEquals(result, { queued: true });

    // Assert: fetch was called once to the Netlify queue URL
    assertEquals(fetchStub.calls.length, 1);
    const callUrl: string = String(fetchStub.calls[0].args[0]);
    assertEquals(callUrl, netlifyQueueUrl);

    // Assert: dialectic_generation_jobs was updated with status queued before the Netlify POST
    const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assert(updateSpy.callCount >= 1);
    const updatePayload: unknown = updateSpy.callsArgs[0][0];
    assert(isRecord(updatePayload));
    assertEquals(updatePayload.status, 'queued');

  } finally {
    fetchStub.restore();
  }
});
