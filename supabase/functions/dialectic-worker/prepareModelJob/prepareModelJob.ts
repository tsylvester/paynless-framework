import {
  isAiModelExtendedConfig,
  isDialecticExecuteJobPayload,
  isApiChatMessage,
  isJson,
  isRecord,
} from '../../_shared/utils/type_guards.ts';
import {
  AiModelExtendedConfig,
  ChatApiRequest,
  ChatMessageRole,
  Messages,
} from '../../_shared/types.ts';
import { ResourceDocuments } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts';
import { isResourceDocument } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.guard.ts';
import {
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityOverBudgetReturn,
  isCalculateAffordabilityWithinBudgetReturn,
} from '../calculateAffordability/calculateAffordability.guard.ts';
import { isDialecticCompressJobPayload } from '../enqueueCompressJobs/enqueueCompressJobs.guard.ts';
import { isCompressPromptErrorReturn } from '../compressPrompt/compressPrompt.guard.ts';
import type {
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  TierOutputCapTokens,
  UserConfig,
} from '../calculateAffordability/calculateAffordability.interface.ts';
import type { CompressPromptParams, CompressPromptPayload } from '../compressPrompt/compressPrompt.interface.ts';
import type { EnqueueModelCallParams } from '../enqueueModelCall/enqueueModelCall.interface.ts';
import type { PostgrestError } from 'npm:@supabase/supabase-js@2';
import type { DialecticExecuteJobPayload } from '../../dialectic-service/dialectic.interface.ts';
import type { DialecticCompressJobPayload } from '../enqueueCompressJobs/enqueueCompressJobs.interface.ts';
import type {
  PrepareModelJobDeps,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
} from './prepareModelJob.interface.ts';

export async function prepareModelJob(
  deps: PrepareModelJobDeps,
  params: PrepareModelJobParams,
  payload: PrepareModelJobPayload,
): Promise<PrepareModelJobReturn> {
  try {
    const dbClient = params.dbClient;
    const { job, providerRow, promptConstructionPayload, inputsRelevance, inputsRequired } = payload;
    const projectOwnerUserId = job.user_id;

    let tierOutputCapTokens: TierOutputCapTokens = null;
    const tierCapQueryResult = await dbClient
      .from('user_subscriptions')
      .select('tier_definitions(output_cap_tokens)')
      .eq('user_id', projectOwnerUserId)
      .maybeSingle();

    if (tierCapQueryResult.error !== null) {
      const pgErr: PostgrestError = tierCapQueryResult.error;
      deps.logger.warn('[prepareModelJob] Failed to load tier output cap', {
        jobId: job.id,
        projectOwnerUserId,
        message: pgErr.message,
        code: pgErr.code,
      });
      return { error: pgErr, retriable: true };
    }

    if (tierCapQueryResult.data !== null && isRecord(tierCapQueryResult.data)) {
      const data = tierCapQueryResult.data;
      if ('tier_definitions' in data && isRecord(data['tier_definitions'])) {
        const td = data['tier_definitions'];
        if ('output_cap_tokens' in td) {
          const tokenVal = td['output_cap_tokens'];
          if (typeof tokenVal === 'number' || tokenVal === null) {
            tierOutputCapTokens = tokenVal;
          }
        }
      }
    }

    // Arm selection: branch on job_type and narrow with the arm's guard.
    const jobType = job.job_type;
    let armPayload: DialecticExecuteJobPayload | DialecticCompressJobPayload;
    if (jobType === 'EXECUTE') {
      if (!isDialecticExecuteJobPayload(job.payload)) {
        throw new Error('unreachable: isDialecticExecuteJobPayload throws on invalid');
      }
      armPayload = job.payload;
    } else if (jobType === 'COMPRESS') {
      if (!isDialecticCompressJobPayload(job.payload)) {
        throw new Error('unreachable: isDialecticCompressJobPayload throws on invalid');
      }
      armPayload = job.payload;
    } else {
      throw new Error(`Unsupported job_type: ${jobType}`);
    }

    const userAuthToken: string = armPayload.user_jwt;
    const walletId: string = armPayload.walletId;

    let effectiveCap: TierOutputCapTokens = tierOutputCapTokens;
    let userChosenMaxOutputTokens: number | null = null;
    if (typeof armPayload.maxOutputTokens === 'number') {
      userChosenMaxOutputTokens = armPayload.maxOutputTokens;
      if (tierOutputCapTokens === null) {
        effectiveCap = userChosenMaxOutputTokens;
      } else {
        effectiveCap = Math.min(userChosenMaxOutputTokens, tierOutputCapTokens);
      }
    }

    const userConfig: UserConfig = { tier_output_cap_tokens: effectiveCap };

    deps.logger.info('[prepareModelJob] Effective output cap', {
      tierCap: tierOutputCapTokens,
      userChosen: userChosenMaxOutputTokens,
      effective: effectiveCap,
    });

    const {
      id: jobId,
    } = job;

    deps.logger.info(`[dialectic-worker] [prepareModelJob] Executing model call for job ID: ${jobId}`);

    const modelConfig = providerRow.config;
    if (!isAiModelExtendedConfig(modelConfig)) {
      throw new Error(`Model ${providerRow.id} has invalid or missing configuration.`);
    }

    modelConfig.model_id = providerRow.id;
    const extendedModelConfig: AiModelExtendedConfig = modelConfig;

    const {
      systemInstruction,
      conversationHistory,
      currentUserPrompt,
      resourceDocuments: promptConstructionResourceDocuments,
    } = promptConstructionPayload;
    const resourceDocumentsFromPayload: ResourceDocuments = [];
    for (const doc of promptConstructionResourceDocuments) {
      if (!isResourceDocument(doc)) {
        throw new Error('promptConstructionPayload.resourceDocuments contains invalid resource document fields');
      }
      resourceDocumentsFromPayload.push(doc);
    }
    const scopedDocs = deps.applyInputsRequiredScope(resourceDocumentsFromPayload, inputsRequired);

    if (inputsRequired) {
      for (const vRule of inputsRequired) {
        if (vRule.required === false) continue;
        if (!vRule.document_key) continue;
        const found = scopedDocs.some((d) => {
          return vRule.type === d.type && vRule.slug === d.stage_slug && vRule.document_key === d.document_key;
        });
        if (!found) {
          throw new Error(`Required input document missing: document_key=${vRule.document_key}, stage=${vRule.slug}`);
        }
      }
    }

    const resourceDocuments: ResourceDocuments = scopedDocs;

    const isContinuationFlowInitial = Boolean(job.target_contribution_id || armPayload.target_contribution_id);

    const initialAssembledMessages: Messages[] = conversationHistory
      .filter(msg => msg.role !== 'function');

    const walletBalanceStr = await deps.tokenWalletService.getBalance(walletId);
    const walletBalance = deps.validateWalletBalance(walletBalanceStr, walletId);

    const { inputRate, outputRate } = deps.validateModelCostRates(
      extendedModelConfig.input_token_cost_rate,
      extendedModelConfig.output_token_cost_rate,
    );

    const baseChatApiRequest: ChatApiRequest = {
      message: currentUserPrompt,
      messages: initialAssembledMessages
        .filter(isApiChatMessage)
        .filter((m): m is { role: ChatMessageRole; content: string } => m.content !== null),
      providerId: providerRow.id,
      promptId: '__none__',
      systemInstruction: systemInstruction,
      walletId: walletId,
      resourceDocuments,
      continue_until_complete: armPayload.continueUntilComplete,
      isDialectic: true,
    };

    const affordParams: CalculateAffordabilityParams = {
      walletBalance,
      userConfig: userConfig,
    };

    const affordPayload: CalculateAffordabilityPayload = {
      extendedModelConfig,
      resourceDocuments,
      conversationHistory,
      currentUserPrompt,
      systemInstruction: systemInstruction ?? '',
    };

    const affordResult = await deps.calculateAffordability(affordParams, affordPayload);

    if (isCalculateAffordabilityErrorReturn(affordResult)) {
      return { error: affordResult.error, retriable: affordResult.retriable };
    }

    if (isCalculateAffordabilityOverBudgetReturn(affordResult)) {
      if (jobType === 'EXECUTE') {
        const compressParams: CompressPromptParams = {
          dbClient: params.dbClient,
          isContinuationFlowInitial,
          finalTargetThreshold: affordResult.finalTargetThreshold,
          balanceAfterCompression: affordResult.balanceAfterCompression,
          walletBalance,
        };
        const compressPayload: CompressPromptPayload = {
          parentJob: payload.job,
          extendedModelConfig,
          inputsRelevance: payload.inputsRelevance ?? [],
          resourceDocuments,
          conversationHistory,
          currentUserPrompt,
        };
        const compressResult = await deps.compressPrompt(compressParams, compressPayload);
        if (isCompressPromptErrorReturn(compressResult)) {
          return { error: compressResult.error, retriable: compressResult.retriable };
        }
        return { waiting_for_children: true };
      } else {
        // COMPRESS arm: recursion guard — cannot compress a compression job.
        return { error: new Error('Cannot compress a COMPRESS job (recursion guard)'), retriable: false };
      }
    }

    if (!isCalculateAffordabilityWithinBudgetReturn(affordResult)) {
      throw new Error('unreachable: unexpected affordability return shape');
    }

    // Within-budget path
    const chatApiRequest: ChatApiRequest = {
      ...baseChatApiRequest,
      max_tokens_to_generate: affordResult.maxOutputTokens,
    };
    const resolvedInputTokenCount = affordResult.resolvedInputTokenCount;

    if (typeof promptConstructionPayload.source_prompt_resource_id !== 'string' ||
        promptConstructionPayload.source_prompt_resource_id.trim() === '') {
      throw new Error('source_prompt_resource_id is required on promptConstructionPayload');
    }

    // Provenance write: update this job row's payload with source_prompt_resource_id before enqueue.
    const updatedPayload: unknown = { ...armPayload, source_prompt_resource_id: promptConstructionPayload.source_prompt_resource_id };
    if (!isJson(updatedPayload)) {
      throw new Error('Updated payload is not JSON-compatible.');
    }
    const provenanceUpdateResult = await dbClient
      .from('dialectic_generation_jobs')
      .update({ payload: updatedPayload })
      .eq('id', job.id);

    if (provenanceUpdateResult.error !== null) {
      const pgErr: PostgrestError = provenanceUpdateResult.error;
      return { error: pgErr, retriable: true };
    }

    const enqueueModelCallParams: EnqueueModelCallParams = {
      dbClient,
      job,
      providerRow,
      userAuthToken,
      userConfig: userConfig,
    };

    const enqueueResult = await deps.enqueueModelCall(enqueueModelCallParams, { chatApiRequest, preflightInputTokens: resolvedInputTokenCount });

    if ('error' in enqueueResult) {
      return { error: enqueueResult.error, retriable: enqueueResult.retriable };
    }

    return { queued: true };
  } catch (error) {
    const err: Error = error instanceof Error ? error : new Error(String(error));
    return { error: err, retriable: false };
  }
}