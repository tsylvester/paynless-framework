// supabase/functions/dialectic-worker/createJobContext.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
  createJobContext,
  createPrepareModelJobContext,
  createPlanJobContext,
  createRenderJobContext,
} from './createJobContext.ts';
import {
  isIJobContext,
  isIPlanJobContext,
  isIRenderJobContext,
} from './JobContext.guard.ts';
import {
  buildJobContextParams,
  buildIJobContext,
} from './JobContext.mock.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';

import type {
  PrepareModelJobFn,
  PrepareModelJobDeps,
} from '../prepareModelJob/prepareModelJob.interface.ts';
import type {
  CompressPromptFn,
  CompressPromptDeps,
} from '../compressPrompt/compressPrompt.interface.ts';
import type {
  CalculateAffordabilityFn,
  CalculateAffordabilityDeps,
} from '../calculateAffordability/calculateAffordability.interface.ts';
import type {
  GatherArtifactsFn,
  GatherArtifactsDeps,
} from '../gatherArtifacts/gatherArtifacts.interface.ts';
import type {
  EnqueueModelCallFn,
  EnqueueModelCallDeps,
} from '../enqueueModelCall/enqueueModelCall.interface.ts';
import type {
  RetryJobFn,
  RetryJobDeps,
} from '../retryJob/retryJob.interface.ts';
import type {
  GetSortedCompressionCandidatesFn,
  GetSortedCompressionCandidatesDeps,
} from '../../_shared/utils/vector_utils/vector_utils.interface.ts';
import type {
  enqueueCompressJobsFn,
  enqueueCompressJobsDeps,
} from '../enqueueCompressJobs/enqueueCompressJobs.interface.ts';
import type {
  ApplyCompressionOverlayFn,
  ApplyCompressionOverlayDeps,
} from '../applyCompressionOverlay/applyCompressionOverlay.interface.ts';
import type { CountTokensFn, CountTokensDeps, CountableChatPayload } from '../../_shared/types/tokenizer.types.ts';
import type { AiModelExtendedConfig } from '../../_shared/types.ts';

import {
  buildPrepareModelJobParams,
  buildPrepareModelJobPayload,
} from '../prepareModelJob/prepareModelJob.mock.ts';
import {
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
} from '../gatherArtifacts/gatherArtifacts.mock.ts';
import {
  createMockEnqueueModelCallParams,
  createMockEnqueueModelCallPayload,
} from '../enqueueModelCall/enqueueModelCall.mock.ts';
import {
  buildRetryJobParams,
  buildRetryJobPayload,
} from '../retryJob/retryJob.mock.ts';
import {
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
} from '../calculateAffordability/calculateAffordability.mock.ts';
import {
  buildCompressPromptParams,
  buildCompressPromptPayload,
} from '../compressPrompt/compressPrompt.mock.ts';
import {
  buildGetSortedCompressionCandidatesParams,
  buildGetSortedCompressionCandidatesPayload,
} from '../../_shared/utils/vector_utils/vector_utils.mock.ts';
import {
  buildenqueueCompressJobsParams,
  buildenqueueCompressJobsPayload,
} from '../enqueueCompressJobs/enqueueCompressJobs.mock.ts';
import {
  buildApplyCompressionOverlayParams,
  buildApplyCompressionOverlayPayload,
} from '../applyCompressionOverlay/applyCompressionOverlay.mock.ts';

describe('createJobContext Factory and Slicers', () => {

  describe('createJobContext', () => {

    /**
     * Contract: createJobContext returns an object satisfying isIJobContext.
     * Arrange: default params from buildJobContextParams.
     * Act:     createJobContext(params).
     * Assert:  result passes isIJobContext.
     */
    it('returns an object that passes isIJobContext', () => {
      // Arrange
      const params = buildJobContextParams();

      // Act
      const result = createJobContext(params);

      // Assert
      assertEquals(isIJobContext(result), true);
    });

    /**
     * Contract: createJobContext copies getSeedPromptForStage from params onto the root.
     * Arrange: default params from buildJobContextParams.
     * Act:     createJobContext(params).
     * Assert:  result.getSeedPromptForStage is params.getSeedPromptForStage.
     */
    it('copies getSeedPromptForStage from params onto root IJobContext', () => {
      // Arrange
      const params = buildJobContextParams();

      // Act
      const result = createJobContext(params);

      // Assert
      assertEquals(result.getSeedPromptForStage, params.getSeedPromptForStage);
    });

    /**
     * Contract: createJobContext copies computeJobSig from params onto the root.
     * Arrange: default params from buildJobContextParams.
     * Act:     createJobContext(params).
     * Assert:  result.computeJobSig is params.computeJobSig.
     */
    it('copies computeJobSig from params onto root IJobContext', () => {
      // Arrange
      const params = buildJobContextParams();

      // Act
      const result = createJobContext(params);

      // Assert
      assertEquals(result.computeJobSig, params.computeJobSig);
    });

    /**
     * Contract: computeJobSig is present and callable on the IJobContext result.
     * Arrange: default params from buildJobContextParams.
     * Act:     createJobContext(params).
     * Assert:  typeof result.computeJobSig is 'function'.
     */
    it('computeJobSig is present and callable on the IJobContext result', () => {
      // Arrange
      const params = buildJobContextParams();

      // Act
      const result = createJobContext(params);

      // Assert
      assertEquals(typeof result.computeJobSig, 'function');
    });

    /**
     * Contract: createJobContext returns a prepareModelJob that is not the params.prepareModelJob
     *   it was given — the factory bound it — and invoking it passes the unbound implementation
     *   a deps object carrying exactly the eight PrepareModelJobDeps members.
     * Arrange: a production-typed PrepareModelJobFn declared in the case and wrapped in a spy,
     *   passed via buildJobContextParams({ prepareModelJob }).
     * Act:     createJobContext(params); invoke result.prepareModelJob with built params and payload.
     * Assert:  result.prepareModelJob is not params.prepareModelJob; the spy received one call;
     *   deps carries logger, applyInputsRequiredScope, tokenWalletService (from userTokenWalletService),
     *   validateWalletBalance, validateModelCostRates, and function-typed calculateAffordability,
     *   enqueueModelCall, compressPrompt.
     */
    it('prepareModelJob is bound, not copied, and invoking it passes the unbound implementation a deps object carrying exactly the eight PrepareModelJobDeps members', async () => {
      // Arrange
      const calls: { deps: PrepareModelJobDeps }[] = [];
      const prepareModelJob: PrepareModelJobFn = async (deps) => {
        calls.push({ deps });
        return { queued: true };
      };
      const params = buildJobContextParams({ prepareModelJob });

      // Act
      const result = createJobContext(params);
      await result.prepareModelJob(buildPrepareModelJobParams(), buildPrepareModelJobPayload());

      // Assert
      assertEquals(Object.is(params.prepareModelJob, result.prepareModelJob), false);
      assertEquals(calls.length, 1);
      const deps = calls[0].deps;
      assertEquals(deps.logger, params.logger);
      assertEquals(deps.applyInputsRequiredScope, params.applyInputsRequiredScope);
      assertEquals(deps.tokenWalletService, params.userTokenWalletService);
      assertEquals(deps.validateWalletBalance, params.validateWalletBalance);
      assertEquals(deps.validateModelCostRates, params.validateModelCostRates);
      assertEquals(typeof deps.calculateAffordability, 'function');
      assertEquals(typeof deps.enqueueModelCall, 'function');
      assertEquals(typeof deps.compressPrompt, 'function');
    });

    /**
     * Contract: invoking root.prepareModelJob reaches params.calculateAffordability with a deps
     *   carrying logger, countTokens and getMaxOutputTokens and no compressPrompt, and reaches
     *   params.compressPrompt with a deps carrying logger, getSortedCompressionCandidates,
     *   enqueueCompressJobs, constructStoragePath, downloadFromStorage and countTokens and no
     *   ragService, embeddingClient or tokenWalletService.
     * Arrange: production-typed PrepareModelJobFn, CalculateAffordabilityFn, and CompressPromptFn
     *   declared in the case and spied, passed via buildJobContextParams overrides.
     * Act:     createJobContext(params); invoke result.prepareModelJob; invoke the deps'
     *   calculateAffordability and compressPrompt with built params and payload.
     * Assert:  affordability spy received logger, countTokens, getMaxOutputTokens, no compressPrompt;
     *   compress spy received logger, function-typed getSortedCompressionCandidates and
     *   enqueueCompressJobs, constructStoragePath, downloadFromStorage, countTokens, no ragService,
     *   embeddingClient or tokenWalletService.
     */
    it('invoking root.prepareModelJob reaches params.calculateAffordability with a three-member deps and params.compressPrompt with a six-member deps', async () => {
      // Arrange
      const prepareModelJobCalls: { deps: PrepareModelJobDeps }[] = [];
      const prepareModelJob: PrepareModelJobFn = async (deps) => {
        prepareModelJobCalls.push({ deps });
        return { queued: true };
      };
      const affordabilityCalls: { deps: CalculateAffordabilityDeps }[] = [];
      const calculateAffordability: CalculateAffordabilityFn = async (deps) => {
        affordabilityCalls.push({ deps });
        return { overBudget: false, maxOutputTokens: 1024, resolvedInputTokenCount: 0 };
      };
      const compressCalls: { deps: CompressPromptDeps }[] = [];
      const compressPrompt: CompressPromptFn = async (deps) => {
        compressCalls.push({ deps });
        return { fits: true, resourceDocuments: [], conversationHistory: [], resolvedInputTokenCount: 0 };
      };
      const params = buildJobContextParams({ prepareModelJob, calculateAffordability, compressPrompt });
      const { client } = createMockSupabaseClient();
      const dbClient = client as unknown as SupabaseClient<Database>;

      // Act
      const result = createJobContext(params);
      await result.prepareModelJob(buildPrepareModelJobParams(), buildPrepareModelJobPayload());
      const prepareDeps = prepareModelJobCalls[0].deps;
      await prepareDeps.calculateAffordability(
        buildCalculateAffordabilityParams({ userConfig: { tier_output_cap_tokens: null } }),
        buildCalculateAffordabilityPayload(),
      );
      await prepareDeps.compressPrompt(
        buildCompressPromptParams({ dbClient }),
        buildCompressPromptPayload(),
      );

      // Assert
      assertEquals(affordabilityCalls.length, 1);
      assertEquals(affordabilityCalls[0].deps.logger, params.logger);
      assertEquals(affordabilityCalls[0].deps.countTokens, params.countTokens);
      assertEquals(affordabilityCalls[0].deps.getMaxOutputTokens, params.getMaxOutputTokens);
      assertEquals('compressPrompt' in affordabilityCalls[0].deps, false);

      assertEquals(compressCalls.length, 1);
      assertEquals(compressCalls[0].deps.logger, params.logger);
      assertEquals(typeof compressCalls[0].deps.getSortedCompressionCandidates, 'function');
      assertEquals(typeof compressCalls[0].deps.enqueueCompressJobs, 'function');
      assertEquals(compressCalls[0].deps.constructStoragePath, params.constructStoragePath);
      assertEquals(compressCalls[0].deps.downloadFromStorage, params.downloadFromStorage);
      assertEquals(compressCalls[0].deps.countTokens, params.countTokens);
      assertEquals('ragService' in compressCalls[0].deps, false);
      assertEquals('embeddingClient' in compressCalls[0].deps, false);
      assertEquals('tokenWalletService' in compressCalls[0].deps, false);
    });

    /**
     * Contract: the deps object reaching params.compressPrompt carries a getSortedCompressionCandidates
     *   that, when invoked, calls params.getSortedCompressionCandidates with a deps whose countTokens
     *   is the bound two-argument form — invoking it with a payload and a model config reaches
     *   params.countTokens with params.tokenizerDeps as its first argument.
     * Arrange: production-typed PrepareModelJobFn, CompressPromptFn, GetSortedCompressionCandidatesFn,
     *   and CountTokensFn declared in the case and spied, passed via buildJobContextParams overrides.
     * Act:     createJobContext(params); invoke result.prepareModelJob; invoke compressDeps'
     *   getSortedCompressionCandidates; invoke the bound countTokens with a payload and model config.
     * Assert:  getSortedCompressionCandidates spy received logger; countTokens spy received
     *   params.tokenizerDeps as deps.
     */
    it('the deps object reaching params.compressPrompt carries a getSortedCompressionCandidates that, when invoked, calls params.getSortedCompressionCandidates with a deps whose countTokens is the bound two-argument form', async () => {
      // Arrange
      const prepareModelJobCalls: { deps: PrepareModelJobDeps }[] = [];
      const prepareModelJob: PrepareModelJobFn = async (deps) => {
        prepareModelJobCalls.push({ deps });
        return { queued: true };
      };
      const compressCalls: { deps: CompressPromptDeps }[] = [];
      const compressPrompt: CompressPromptFn = async (deps) => {
        compressCalls.push({ deps });
        return { fits: true, resourceDocuments: [], conversationHistory: [], resolvedInputTokenCount: 0 };
      };
      const gscCalls: { deps: GetSortedCompressionCandidatesDeps }[] = [];
      const getSortedCompressionCandidates: GetSortedCompressionCandidatesFn = async (deps) => {
        gscCalls.push({ deps });
        return { candidates: [] };
      };
      const countTokensCalls: { deps: CountTokensDeps; payload: CountableChatPayload; modelConfig: AiModelExtendedConfig }[] = [];
      const countTokens: CountTokensFn = (deps, payload, modelConfig) => {
        countTokensCalls.push({ deps, payload, modelConfig });
        return 0;
      };
      const params = buildJobContextParams({ prepareModelJob, compressPrompt, getSortedCompressionCandidates, countTokens });
      const { client } = createMockSupabaseClient();
      const dbClient = client as unknown as SupabaseClient<Database>;

      // Act
      const result = createJobContext(params);
      await result.prepareModelJob(buildPrepareModelJobParams(), buildPrepareModelJobPayload());
      const prepareDeps = prepareModelJobCalls[0].deps;
      await prepareDeps.compressPrompt(
        buildCompressPromptParams({ dbClient }),
        buildCompressPromptPayload(),
      );
      const compressDeps = compressCalls[0].deps;
      await compressDeps.getSortedCompressionCandidates(
        buildGetSortedCompressionCandidatesParams(),
        buildGetSortedCompressionCandidatesPayload(),
      );
      const boundCountTokens = gscCalls[0].deps.countTokens;
      const payload: CountableChatPayload = {};
      const modelConfig = buildCalculateAffordabilityPayload().extendedModelConfig;
      boundCountTokens(payload, modelConfig);

      // Assert
      assertEquals(gscCalls.length, 1);
      assertEquals(gscCalls[0].deps.logger, params.logger);
      assertEquals(typeof boundCountTokens, 'function');
      assertEquals(countTokensCalls.length, 1);
      assertEquals(countTokensCalls[0].deps, params.tokenizerDeps);
    });

    /**
     * Contract: the deps object reaching params.compressPrompt carries an enqueueCompressJobs that,
     *   when invoked, calls params.enqueueCompressJobs with a deps carrying logger, textSplitter,
     *   countTokens and constructStoragePath.
     * Arrange: production-typed PrepareModelJobFn, CompressPromptFn, and enqueueCompressJobsFn
     *   declared in the case and spied, passed via buildJobContextParams overrides.
     * Act:     createJobContext(params); invoke result.prepareModelJob; invoke compressDeps'
     *   enqueueCompressJobs with built params and payload.
     * Assert:  enqueueCompressJobs spy received logger, textSplitter, countTokens, constructStoragePath.
     */
    it('the deps object reaching params.compressPrompt carries an enqueueCompressJobs that, when invoked, calls params.enqueueCompressJobs with a deps carrying logger, textSplitter, countTokens and constructStoragePath', async () => {
      // Arrange
      const prepareModelJobCalls: { deps: PrepareModelJobDeps }[] = [];
      const prepareModelJob: PrepareModelJobFn = async (deps) => {
        prepareModelJobCalls.push({ deps });
        return { queued: true };
      };
      const compressCalls: { deps: CompressPromptDeps }[] = [];
      const compressPrompt: CompressPromptFn = async (deps) => {
        compressCalls.push({ deps });
        return { fits: true, resourceDocuments: [], conversationHistory: [], resolvedInputTokenCount: 0 };
      };
      const enqueueCalls: { deps: enqueueCompressJobsDeps }[] = [];
      const enqueueCompressJobs: enqueueCompressJobsFn = async (deps) => {
        enqueueCalls.push({ deps });
        return { createdCount: 0 };
      };
      const params = buildJobContextParams({ prepareModelJob, compressPrompt, enqueueCompressJobs });

      // Act
      const result = createJobContext(params);
      await result.prepareModelJob(buildPrepareModelJobParams(), buildPrepareModelJobPayload());
      const prepareDeps = prepareModelJobCalls[0].deps;
      await prepareDeps.compressPrompt(
        buildCompressPromptParams(),
        buildCompressPromptPayload(),
      );
      const compressDeps = compressCalls[0].deps;
      await compressDeps.enqueueCompressJobs(
        buildenqueueCompressJobsParams(),
        buildenqueueCompressJobsPayload(),
      );

      // Assert
      assertEquals(enqueueCalls.length, 1);
      assertEquals(enqueueCalls[0].deps.logger, params.logger);
      assertEquals(enqueueCalls[0].deps.textSplitter, params.textSplitter);
      assertEquals(enqueueCalls[0].deps.countTokens, params.countTokens);
      assertEquals(enqueueCalls[0].deps.constructStoragePath, params.constructStoragePath);
    });

    /**
     * Contract: two calls to root.prepareModelJob reach params.compressPrompt with the same
     *   getSortedCompressionCandidates and enqueueCompressJobs function identities — the graph
     *   is constructed once per root, not once per invocation.
     * Arrange: production-typed PrepareModelJobFn and CompressPromptFn declared in the case and
     *   spied, passed via buildJobContextParams overrides.
     * Act:     createJobContext(params); invoke result.prepareModelJob twice; invoke each call's
     *   deps.compressPrompt with built params and payload.
     * Assert:  compress spy received two calls; both calls' deps share the same
     *   getSortedCompressionCandidates and enqueueCompressJobs identities.
     */
    it('two calls to root.prepareModelJob reach params.compressPrompt with the same getSortedCompressionCandidates and enqueueCompressJobs function identities', async () => {
      // Arrange
      const prepareModelJobCalls: { deps: PrepareModelJobDeps }[] = [];
      const prepareModelJob: PrepareModelJobFn = async (deps) => {
        prepareModelJobCalls.push({ deps });
        return { queued: true };
      };
      const compressCalls: { deps: CompressPromptDeps }[] = [];
      const compressPrompt: CompressPromptFn = async (deps) => {
        compressCalls.push({ deps });
        return { fits: true, resourceDocuments: [], conversationHistory: [], resolvedInputTokenCount: 0 };
      };
      const params = buildJobContextParams({ prepareModelJob, compressPrompt });
      const { client } = createMockSupabaseClient();
      const dbClient = client as unknown as SupabaseClient<Database>;

      // Act
      const result = createJobContext(params);
      await result.prepareModelJob(buildPrepareModelJobParams(), buildPrepareModelJobPayload());
      await result.prepareModelJob(buildPrepareModelJobParams(), buildPrepareModelJobPayload());
      await prepareModelJobCalls[0].deps.compressPrompt(
        buildCompressPromptParams({ dbClient }),
        buildCompressPromptPayload(),
      );
      await prepareModelJobCalls[1].deps.compressPrompt(
        buildCompressPromptParams({ dbClient }),
        buildCompressPromptPayload(),
      );

      // Assert
      assertEquals(compressCalls.length, 2);
      assertEquals(
        compressCalls[0].deps.getSortedCompressionCandidates,
        compressCalls[1].deps.getSortedCompressionCandidates,
      );
      assertEquals(
        compressCalls[0].deps.enqueueCompressJobs,
        compressCalls[1].deps.enqueueCompressJobs,
      );
    });

    /**
     * Contract: createJobContext(buildJobContextParams()) returns an object on which 'ragService'
     *   in result, 'indexingService' in result and 'embeddingClient' in result are each false.
     * Arrange: default params from buildJobContextParams.
     * Act:     createJobContext(params).
     * Assert:  'ragService', 'indexingService', 'embeddingClient' are each absent from result.
     */
    it('createJobContext(buildJobContextParams()) returns an object on which ragService, indexingService and embeddingClient are each absent', () => {
      // Arrange
      const params = buildJobContextParams();

      // Act
      const result = createJobContext(params);

      // Assert
      assertEquals('ragService' in result, false);
      assertEquals('indexingService' in result, false);
      assertEquals('embeddingClient' in result, false);
    });

    /**
     * Contract: root.gatherArtifacts is bound, not copied, and invoking it passes params.gatherArtifacts
     *   a deps carrying logger, pickLatest, downloadFromStorage and an applyCompressionOverlay that
     *   delegates to params.applyCompressionOverlay with a logger and downloadFromStorage deps object.
     * Arrange: production-typed GatherArtifactsFn and ApplyCompressionOverlayFn declared in the case
     *   and spied, passed via buildJobContextParams overrides.
     * Act:     createJobContext(params); invoke result.gatherArtifacts with built params and payload;
     *   invoke the bound applyCompressionOverlay with built params and payload.
     * Assert:  result.gatherArtifacts is not params.gatherArtifacts; gather spy received logger,
     *   pickLatest, downloadFromStorage; overlay spy received logger, downloadFromStorage.
     */
    it('root.gatherArtifacts is bound, not copied, and invoking it passes params.gatherArtifacts a deps carrying logger, pickLatest, downloadFromStorage and an applyCompressionOverlay that delegates to params.applyCompressionOverlay', async () => {
      // Arrange
      const gatherCalls: { deps: GatherArtifactsDeps }[] = [];
      const gatherArtifacts: GatherArtifactsFn = async (deps) => {
        gatherCalls.push({ deps });
        return { artifacts: [] };
      };
      const overlayCalls: { deps: ApplyCompressionOverlayDeps }[] = [];
      const applyCompressionOverlay: ApplyCompressionOverlayFn = async (deps) => {
        overlayCalls.push({ deps });
        return { resourceDocuments: [], conversationHistory: [], overlaidCount: 0 };
      };
      const params = buildJobContextParams({ gatherArtifacts, applyCompressionOverlay });
      const { client } = createMockSupabaseClient();
      const dbClient = client as unknown as SupabaseClient<Database>;

      // Act
      const result = createJobContext(params);
      await result.gatherArtifacts(
        buildGatherArtifactsParams({ dbClient }),
        buildGatherArtifactsPayload(),
      );
      const boundOverlay = gatherCalls[0].deps.applyCompressionOverlay;
      await boundOverlay(
        buildApplyCompressionOverlayParams(),
        buildApplyCompressionOverlayPayload(),
      );

      // Assert
      assertEquals(Object.is(params.gatherArtifacts, result.gatherArtifacts), false);
      assertEquals(gatherCalls.length, 1);
      assertEquals(gatherCalls[0].deps.logger, params.logger);
      assertEquals(gatherCalls[0].deps.pickLatest, params.pickLatest);
      assertEquals(gatherCalls[0].deps.downloadFromStorage, params.downloadFromStorage);
      assertEquals(typeof boundOverlay, 'function');
      assertEquals(overlayCalls.length, 1);
      assertEquals(overlayCalls[0].deps.logger, params.logger);
      assertEquals(overlayCalls[0].deps.downloadFromStorage, params.downloadFromStorage);
    });

    /**
     * Contract: root.enqueueModelCall is bound, not copied, and invoking it passes params.enqueueModelCall
     *   a deps carrying logger, netlifyQueueUrl, netlifyApiKey, apiKeyForProvider and computeJobSig.
     * Arrange: production-typed EnqueueModelCallFn declared in the case and spied, passed via
     *   buildJobContextParams overrides.
     * Act:     createJobContext(params); invoke result.enqueueModelCall with built params and payload.
     * Assert:  result.enqueueModelCall is not params.enqueueModelCall; enqueue spy received logger,
     *   netlifyQueueUrl, netlifyApiKey, apiKeyForProvider, computeJobSig.
     */
    it('root.enqueueModelCall is bound, not copied, and invoking it passes params.enqueueModelCall a deps carrying logger, netlifyQueueUrl, netlifyApiKey, apiKeyForProvider and computeJobSig', async () => {
      // Arrange
      const enqueueCalls: { deps: EnqueueModelCallDeps }[] = [];
      const enqueueModelCall: EnqueueModelCallFn = async (deps) => {
        enqueueCalls.push({ deps });
        return { queued: true };
      };
      const params = buildJobContextParams({ enqueueModelCall });

      // Act
      const result = createJobContext(params);
      await result.enqueueModelCall(
        createMockEnqueueModelCallParams(),
        createMockEnqueueModelCallPayload(),
      );

      // Assert
      assertEquals(Object.is(params.enqueueModelCall, result.enqueueModelCall), false);
      assertEquals(enqueueCalls.length, 1);
      assertEquals(enqueueCalls[0].deps.logger, params.logger);
      assertEquals(enqueueCalls[0].deps.netlifyQueueUrl, params.netlifyQueueUrl);
      assertEquals(enqueueCalls[0].deps.netlifyApiKey, params.netlifyApiKey);
      assertEquals(enqueueCalls[0].deps.apiKeyForProvider, params.apiKeyForProvider);
      assertEquals(enqueueCalls[0].deps.computeJobSig, params.computeJobSig);
    });

    /**
     * Contract: root.retryJob is bound, not copied, and invoking it passes params.retryJob a deps
     *   carrying logger and notificationService.
     * Arrange: production-typed RetryJobFn declared in the case and spied, passed via
     *   buildJobContextParams overrides.
     * Act:     createJobContext(params); invoke result.retryJob with built params and payload.
     * Assert:  result.retryJob is not params.retryJob; retry spy received logger, notificationService.
     */
    it('root.retryJob is bound, not copied, and invoking it passes params.retryJob a deps carrying logger and notificationService', async () => {
      // Arrange
      const retryCalls: { deps: RetryJobDeps }[] = [];
      const retryJob: RetryJobFn = async (deps) => {
        retryCalls.push({ deps });
        return { notified: true };
      };
      const params = buildJobContextParams({ retryJob });

      // Act
      const result = createJobContext(params);
      await result.retryJob(buildRetryJobParams(), buildRetryJobPayload());

      // Assert
      assertEquals(Object.is(params.retryJob, result.retryJob), false);
      assertEquals(retryCalls.length, 1);
      assertEquals(retryCalls[0].deps.logger, params.logger);
      assertEquals(retryCalls[0].deps.notificationService, params.notificationService);
    });
  });

  describe('createPrepareModelJobContext', () => {

    /**
     * Contract: createPrepareModelJobContext returns an object carrying each PrepareModelJobDeps
     *   member mapped from the root member of the same name, with tokenWalletService from
     *   root.userTokenWalletService.
     * Arrange: a root built by buildIJobContext.
     * Act:     createPrepareModelJobContext(root).
     * Assert:  result carries logger, applyInputsRequiredScope, tokenWalletService (from
     *   root.userTokenWalletService), validateWalletBalance, validateModelCostRates, and
     *   function-typed calculateAffordability, enqueueModelCall, compressPrompt.
     */
    it('returns an object carrying the eight PrepareModelJobDeps members mapped from the root', () => {
      // Arrange
      const root = buildIJobContext();

      // Act
      const result = createPrepareModelJobContext(root);

      // Assert
      assertEquals(result.logger, root.logger);
      assertEquals(result.applyInputsRequiredScope, root.applyInputsRequiredScope);
      assertEquals(result.tokenWalletService, root.userTokenWalletService);
      assertEquals(result.validateWalletBalance, root.validateWalletBalance);
      assertEquals(result.validateModelCostRates, root.validateModelCostRates);
      assertEquals(typeof result.calculateAffordability, 'function');
      assertEquals(typeof result.enqueueModelCall, 'function');
      assertEquals(typeof result.compressPrompt, 'function');
    });

    /**
     * Contract: the returned object does not carry a root member PrepareModelJobDeps does not declare.
     * Arrange: a root built by buildIJobContext.
     * Act:     createPrepareModelJobContext(root).
     * Assert:  ragService, embeddingClient, countTokens, pickLatest, downloadFromStorage, fileManager,
     *   continueJob, retryJob, notificationService, prepareModelJob are each absent.
     */
    it('the returned object does not carry ragService, embeddingClient, countTokens, pickLatest, downloadFromStorage, fileManager, continueJob, retryJob, notificationService or prepareModelJob', () => {
      // Arrange
      const root = buildIJobContext();

      // Act
      const result = createPrepareModelJobContext(root);

      // Assert
      assertEquals('ragService' in result, false);
      assertEquals('embeddingClient' in result, false);
      assertEquals('countTokens' in result, false);
      assertEquals('pickLatest' in result, false);
      assertEquals('downloadFromStorage' in result, false);
      assertEquals('fileManager' in result, false);
      assertEquals('continueJob' in result, false);
      assertEquals('retryJob' in result, false);
      assertEquals('notificationService' in result, false);
      assertEquals('prepareModelJob' in result, false);
    });
  });

  describe('createPlanJobContext', () => {

    /**
     * Contract: createPlanJobContext returns an object that passes isIPlanJobContext.
     * Arrange: a root built by buildIJobContext.
     * Act:     createPlanJobContext(root).
     * Assert:  result passes isIPlanJobContext.
     */
    it('returns an object that passes isIPlanJobContext', () => {
      // Arrange
      const root = buildIJobContext();

      // Act
      const result = createPlanJobContext(root);

      // Assert
      assertEquals(isIPlanJobContext(result), true);
    });
  });

  describe('createRenderJobContext', () => {

    /**
     * Contract: createRenderJobContext returns an object that passes isIRenderJobContext.
     * Arrange: a root built by buildIJobContext.
     * Act:     createRenderJobContext(root).
     * Assert:  result passes isIRenderJobContext.
     */
    it('returns an object that passes isIRenderJobContext', () => {
      // Arrange
      const root = buildIJobContext();

      // Act
      const result = createRenderJobContext(root);

      // Assert
      assertEquals(isIRenderJobContext(result), true);
    });
  });
});
