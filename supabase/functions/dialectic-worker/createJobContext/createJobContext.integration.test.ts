// supabase/functions/dialectic-worker/createJobContext/createJobContext.integration.test.ts

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  createJobContext,
  createPrepareModelJobContext,
  createPlanJobContext,
  createRenderJobContext,
} from './createJobContext.ts';
import { buildJobContextParams } from './JobContext.mock.ts';
import type {
  IJobContext,
  IPlanJobContext,
  IRenderJobContext,
} from './JobContext.interface.ts';
import type { PrepareModelJobDeps } from '../prepareModelJob/prepareModelJob.interface.ts';
import { prepareModelJob } from '../prepareModelJob/prepareModelJob.provides.ts';
import { compressPrompt } from '../compressPrompt/compressPrompt.provides.ts';
import { calculateAffordability } from '../calculateAffordability/calculateAffordability.provides.ts';
import { enqueueModelCall } from '../enqueueModelCall/enqueueModelCall.provides.ts';
import { enqueueCompressJobs } from '../enqueueCompressJobs/enqueueCompressJobs.provides.ts';
import { getSortedCompressionCandidates } from '../../_shared/utils/vector_utils/vector_utils.provides.ts';
import type { Database, Tables } from '../../types_db.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { createMockDownloadFromStorage } from '../../_shared/supabase_storage_utils.mock.ts';
import { getMaxOutputTokens } from '../../_shared/utils/affordability_utils.ts';
import { countTokens } from '../../_shared/utils/tokenizer_utils.ts';
import { buildCountTokensDeps } from '../../_shared/utils/tokenizer_utils.mock.ts';
import { buildDialecticJobRow, buildDialecticExecuteJobPayload, buildPromptConstructionPayload, buildInputRule } from '../../_shared/dialectic.mock.ts';
import { buildMockProvider, buildExtendedModelConfig } from '../../_shared/ai_service/ai_provider.mock.ts';
import { buildPrepareModelJobPayload } from '../prepareModelJob/prepareModelJob.mock.ts';
import { buildResourceDocument } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.mock.ts';
import type { DialecticJobRow } from '../../dialectic-service/dialectic.interface.ts';
import { isJson } from '../../_shared/utils/type-guards/type_guards.common.ts';

Deno.test('Integration: constructed context passes structural check against IJobContext and slicers build expected objects', () => {
  // Boundary: none — this block exercises the factory's structural assembly only.
  // Mocked: nothing — all values come from buildJobContextParams defaults.
  const params = buildJobContextParams();
  const rootContext: IJobContext = createJobContext(params);

  assertEquals(rootContext.logger, params.logger);
  assertEquals(rootContext.fileManager, params.fileManager);
  assertEquals(rootContext.downloadFromStorage, params.downloadFromStorage);
  assertEquals(rootContext.deleteFromStorage, params.deleteFromStorage);
  assertEquals(rootContext.getAiProviderAdapter, params.getAiProviderAdapter);
  assertEquals(rootContext.getAiProviderConfig, params.getAiProviderConfig);
  assertEquals(rootContext.countTokens, params.countTokens);
  assertEquals(rootContext.adminTokenWalletService, params.adminTokenWalletService);
  assertEquals(rootContext.userTokenWalletService, params.userTokenWalletService);
  assertEquals(rootContext.notificationService, params.notificationService);
  assertEquals(rootContext.promptAssembler, params.promptAssembler);
  assertEquals(rootContext.getSeedPromptForStage, params.getSeedPromptForStage);
  assertEquals(rootContext.pickLatest, params.pickLatest);
  assertEquals(rootContext.applyInputsRequiredScope, params.applyInputsRequiredScope);
  assertEquals(rootContext.validateWalletBalance, params.validateWalletBalance);
  assertEquals(rootContext.validateModelCostRates, params.validateModelCostRates);
  assertEquals(rootContext.getMaxOutputTokens, params.getMaxOutputTokens);
  assertEquals(rootContext.getGranularityPlanner, params.getGranularityPlanner);
  assertEquals(rootContext.planComplexStage, params.planComplexStage);
  assertEquals(rootContext.findSourceDocuments, params.findSourceDocuments);
  assertEquals(rootContext.documentRenderer, params.documentRenderer);
  assertEquals(rootContext.assembleContributionChain, params.assembleContributionChain);
  assertEquals(rootContext.loadDocumentTemplate, params.loadDocumentTemplate);
  assertEquals(rootContext.mergeChunkContent, params.mergeChunkContent);
  assertEquals(rootContext.computeJobSig, params.computeJobSig);
  // Bound closures — identity differs from params (factory bound them)
  assertEquals(Object.is(params.prepareModelJob, rootContext.prepareModelJob), false);
  assertEquals(Object.is(params.enqueueModelCall, rootContext.enqueueModelCall), false);
  assertEquals(Object.is(params.gatherArtifacts, rootContext.gatherArtifacts), false);
  assertEquals(Object.is(params.retryJob, rootContext.retryJob), false);
  assertEquals(Object.is(params.compressPrompt, rootContext.compressPrompt), false);
  assertEquals(Object.is(params.calculateAffordability, rootContext.calculateAffordability), false);
  // Retired members absent
  assertEquals('ragService' in rootContext, false);
  assertEquals('indexingService' in rootContext, false);
  assertEquals('embeddingClient' in rootContext, false);
  assertEquals('continueJob' in rootContext, false);
  assertEquals('debitTokens' in rootContext, false);
  assertEquals('sanitizeJsonContent' in rootContext, false);

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
  assertEquals(renderContext.assembleContributionChain, rootContext.assembleContributionChain);
  assertEquals(renderContext.loadDocumentTemplate, rootContext.loadDocumentTemplate);
  assertEquals(renderContext.mergeChunkContent, rootContext.mergeChunkContent);
  assertEquals('prepareModelJob' in renderContext, false);
  assertEquals('getAiProviderAdapter' in renderContext, false);
});

Deno.test('Integration: createPrepareModelJobContext returns PrepareModelJobDeps mapped from root', () => {
  // Boundary: none — slicer is a pure projection.
  // Mocked: nothing.
  const params = buildJobContextParams();
  const root: IJobContext = createJobContext(params);
  const deps: PrepareModelJobDeps = createPrepareModelJobContext(root);

  assertEquals(deps.logger, root.logger);
  assertEquals(deps.applyInputsRequiredScope, root.applyInputsRequiredScope);
  assertEquals(deps.tokenWalletService, root.userTokenWalletService);
  assertEquals(deps.validateWalletBalance, root.validateWalletBalance);
  assertEquals(deps.validateModelCostRates, root.validateModelCostRates);
  assertEquals(deps.calculateAffordability, root.calculateAffordability);
  assertEquals(deps.enqueueModelCall, root.enqueueModelCall);
  assertEquals(deps.compressPrompt, root.compressPrompt);
  // Members PrepareModelJobDeps does not declare are absent
  assertEquals('ragService' in deps, false);
  assertEquals('embeddingClient' in deps, false);
  assertEquals('countTokens' in deps, false);
  assertEquals('pickLatest' in deps, false);
  assertEquals('downloadFromStorage' in deps, false);
  assertEquals('fileManager' in deps, false);
  assertEquals('continueJob' in deps, false);
  assertEquals('retryJob' in deps, false);
  assertEquals('notificationService' in deps, false);
  assertEquals('prepareModelJob' in deps, false);
});

Deno.test('Integration: within-budget EXECUTE chain — real createJobContext → real prepareModelJob → real calculateAffordability → real enqueueModelCall → one Netlify POST', async () => {
  // Boundary: Supabase client (mock) and fetch (stubbed Netlify queue POST).
  // Mocked: dbClient, fetch. This test does not prove the DB layer or the Netlify POST itself.
  // Chain: real createJobContext → real prepareModelJob → real calculateAffordability (within-budget) → real enqueueModelCall → fetch stub.

  const netlifyQueueUrl = 'https://integration-test.netlify/.netlify/functions/async-workloads-router';
  const netlifyApiKey = 'integration-test-awl-key';

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{}], error: null },
      },
      user_subscriptions: {
        select: { data: null, error: null },
      },
    },
  });
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

  const providerRow: Tables<'ai_providers'> = buildMockProvider();

  const fetchStub = stub(globalThis, 'fetch', (): Promise<Response> =>
    Promise.resolve(new Response('{}', { status: 200 })));

  try {
    const params = buildJobContextParams({
      prepareModelJob,
      compressPrompt,
      calculateAffordability,
      enqueueModelCall,
      getSortedCompressionCandidates,
      getMaxOutputTokens,
      netlifyQueueUrl,
      netlifyApiKey,
      apiKeyForProvider: () => 'test-api-key',
    });

    const ctx: IJobContext = createJobContext(params);

    const executePayload = buildDialecticExecuteJobPayload();
    if(!isJson(executePayload)){
      throw new Error ("Payload must be json compatible")
    }
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const payload = buildPrepareModelJobPayload({ job, providerRow });

    const result = await ctx.prepareModelJob({ dbClient }, payload);

    assertEquals(result, { queued: true });
    assertEquals(fetchStub.calls.length, 1);
    const callUrl: string = String(fetchStub.calls[0].args[0]);
    assertEquals(callUrl, netlifyQueueUrl);

    const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assert(updateSpy.callCount >= 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test('Integration: over-budget EXECUTE chain — real createJobContext → real prepareModelJob → real calculateAffordability (over-budget) → real compressPrompt → deferral, no RAG collaborator called', async () => {
  // Boundary: Supabase client (mock).
  // Mocked: dbClient. This test does not prove the DB layer.
  // Chain: real createJobContext → real prepareModelJob → real calculateAffordability (over-budget) → real compressPrompt → real getSortedCompressionCandidates + real enqueueCompressJobs.
  // Asserts the dispatcher returns the deferral ({ waiting_for_children: true }) and COMPRESS rows are inserted.

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        update: { data: [{}], error: null },
        insert: { data: [{}], error: null },
      },
      user_subscriptions: {
        select: { data: null, error: null },
      },
    },
  });
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

  // Tiny context window so the prompt exceeds it and triggers the over-budget path
  const config = buildExtendedModelConfig({ context_window_tokens: 1 });
  if(!isJson(config)){
    throw new Error ("Config must be json compatible")
  }
  const providerRow: Tables<'ai_providers'> = buildMockProvider({
    config: config,
  });

  const params = buildJobContextParams({
    prepareModelJob,
    compressPrompt,
    calculateAffordability,
    enqueueModelCall,
    enqueueCompressJobs,
    getSortedCompressionCandidates,
    getMaxOutputTokens,
    // Real countTokens so calculateAffordability measures the actual prompt size
    // and the over-budget condition (initialTokenCount > context_window_tokens) triggers
    countTokens,
    tokenizerDeps: buildCountTokensDeps(),
    // Error mode so resource documents stay eligible as compression candidates
    // (success mode adds their IDs to artifactIds, filtering them out)
    downloadFromStorage: createMockDownloadFromStorage({ mode: 'error', error: new Error('not found') }),
  });

  const ctx: IJobContext = createJobContext(params);

  const executePayload = buildDialecticExecuteJobPayload();
  if(!isJson(executePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
  const payload = buildPrepareModelJobPayload({
    job,
    providerRow,
    promptConstructionPayload: buildPromptConstructionPayload({
      currentUserPrompt: 'integration test user prompt that is long enough to exceed the tiny context window',
      resourceDocuments: [buildResourceDocument()],
    }),
    // inputsRequired must match the resource document so it survives
    // applyInputsRequiredScope and reaches compressPrompt as a compression candidate
    inputsRequired: [buildInputRule()],
  });

  const result = await ctx.prepareModelJob({ dbClient }, payload);

  // Over-budget EXECUTE returns the deferral — compressPrompt was invoked, COMPRESS rows enqueued
  assertEquals('waiting_for_children' in result, true);
  if ('waiting_for_children' in result) {
    assertEquals(result.waiting_for_children, true);
  }

  // COMPRESS rows were inserted via enqueueCompressJobs
  const insertSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
  assertExists(insertSpy);
  assert(insertSpy.callCount >= 1);
});
