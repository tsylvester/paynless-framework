import {
  isAiModelExtendedConfig,
  isDialecticExecuteJobPayload,
  isApiChatMessage,
  isRecord,
} from '../../_shared/utils/type_guards.ts';
import {
  AiModelExtendedConfig,
  ChatApiRequest,
  Messages,
  ResourceDocuments,
} from '../../_shared/types.ts';
import { isResourceDocument } from '../../_shared/utils/type-guards/type_guards.chat.ts';
import {
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityCompressedReturn,
} from '../calculateAffordability/calculateAffordability.guard.ts';
import type { CalculateAffordabilityParams, CalculateAffordabilityPayload } from '../calculateAffordability/calculateAffordability.interface.ts';
import type { EnqueueModelCallParams } from '../enqueueModelCall/enqueueModelCall.interface.ts';
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
    const { job, projectOwnerUserId, providerRow } = params;
    const {
      promptConstructionPayload,
      compressionStrategy,
      inputsRelevance,
      inputsRequired,
    } = payload;

    const {
      id: jobId,
    } = job;

    let userAuthTokenEarly: string | undefined = undefined;
    {
      const desc = Object.getOwnPropertyDescriptor(job.payload, 'user_jwt');
      if (desc) {
        const potential = desc.value;
        if (typeof potential === 'string' && potential.length > 0) {
          userAuthTokenEarly = potential;
        }
      }
    }
    if (!userAuthTokenEarly) {
      throw new Error('payload.user_jwt required');
    }

    if (!isDialecticExecuteJobPayload(job.payload)) {
      throw new Error(`Job ${job.id} does not have a valid 'execute' payload.`);
    }

    const {
      iterationNumber: iterationNumberRaw,
      stageSlug: stageSlugRaw,
      projectId: projectIdRaw,
      model_id: model_idRaw,
      sessionId: sessionIdRaw,
      walletId: walletIdRaw,
      output_type,
    } = job.payload;

    deps.logger.info('[executeModelCallAndSave] Validating payload fields', {
      jobId,
      hasStageSlug: !!stageSlugRaw,
      stageSlugType: typeof stageSlugRaw,
      hasWalletId: !!walletIdRaw,
      walletIdType: typeof walletIdRaw,
      hasIterationNumber: iterationNumberRaw !== undefined,
      iterationNumberType: typeof iterationNumberRaw,
      hasProjectId: !!projectIdRaw,
      projectIdType: typeof projectIdRaw,
      hasSessionId: !!sessionIdRaw,
      sessionIdType: typeof sessionIdRaw,
      hasModelId: !!model_idRaw,
      modelIdType: typeof model_idRaw,
    });

    if (!stageSlugRaw || typeof stageSlugRaw !== 'string' || stageSlugRaw.trim() === '') {
      throw new Error(`Job ${jobId} is missing required stageSlug in its payload.`);
    }
    const stageSlug: string = stageSlugRaw;

    if (typeof walletIdRaw !== 'string' || walletIdRaw.trim() === '') {
      throw new Error('Wallet is required to process model calls.');
    }
    const walletId: string = walletIdRaw;

    if (typeof iterationNumberRaw !== 'number' || iterationNumberRaw <= 0) {
      deps.logger.error('[prepareModelJob] iterationNumber validation failed', {
        jobId,
        iterationNumberRaw,
        iterationNumberType: typeof iterationNumberRaw,
      });
      throw new Error(`Job ${jobId} is missing required iterationNumber in its payload.`);
    }

    if (typeof projectIdRaw !== 'string' || projectIdRaw.trim() === '') {
      deps.logger.error('[prepareModelJob] projectId validation failed', {
        jobId,
        projectIdRaw,
        projectIdType: typeof projectIdRaw,
      });
      throw new Error(`Job ${jobId} is missing required projectId in its payload.`);
    }

    let sessionId: string;
    if (typeof sessionIdRaw === 'string' && sessionIdRaw.trim() !== '') {
      sessionId = sessionIdRaw;
    } else {
      deps.logger.error('[prepareModelJob] sessionId validation failed', {
        jobId,
        sessionIdRaw,
        sessionIdType: typeof sessionIdRaw,
      });
      throw new Error(`Job ${jobId} is missing required sessionId in its payload.`);
    }

    if (typeof model_idRaw !== 'string' || model_idRaw.trim() === '') {
      deps.logger.error('[prepareModelJob] model_id validation failed', {
        jobId,
        model_idRaw,
        modelIdType: typeof model_idRaw,
      });
      throw new Error(`Job ${jobId} is missing required model_id in its payload.`);
    }

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Executing model call for job ID: ${jobId}`);

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

    const isContinuationFlowInitial = Boolean(job.target_contribution_id || job.payload.target_contribution_id);

    const initialAssembledMessages: Messages[] = conversationHistory
      .filter(msg => msg.role !== 'function');

    if (!deps.tokenWalletService) {
      throw new Error('Token wallet service is required for affordability preflight');
    }

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
        .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
      providerId: providerRow.id,
      promptId: '__none__',
      systemInstruction: systemInstruction,
      walletId: walletId,
      resourceDocuments,
      continue_until_complete: job.payload.continueUntilComplete,
      isDialectic: true,
    };

    const affordParams: CalculateAffordabilityParams = {
      dbClient,
      jobId,
      projectOwnerUserId,
      sessionId,
      stageSlug,
      walletId,
      walletBalance,
      extendedModelConfig,
      inputRate,
      outputRate,
      isContinuationFlowInitial,
      inputsRelevance: inputsRelevance,
    };

    const affordPayload: CalculateAffordabilityPayload = {
      compressionStrategy,
      resourceDocuments,
      conversationHistory,
      currentUserPrompt,
      systemInstruction: systemInstruction ?? '',
      chatApiRequest: baseChatApiRequest,
    };

    const affordResult = await deps.calculateAffordability(affordParams, affordPayload);

    if (isCalculateAffordabilityErrorReturn(affordResult)) {
      return { error: affordResult.error, retriable: affordResult.retriable };
    }

    let chatApiRequest: ChatApiRequest;
    let resolvedInputTokenCount: number;

    if (isCalculateAffordabilityCompressedReturn(affordResult)) {
      chatApiRequest = affordResult.chatApiRequest;
      resolvedInputTokenCount = affordResult.resolvedInputTokenCount;
    } else {
      chatApiRequest = {
        ...baseChatApiRequest,
        max_tokens_to_generate: affordResult.maxOutputTokens,
      };
      resolvedInputTokenCount = affordResult.resolvedInputTokenCount;
    }

    {
      const p = job && job.payload;
      let hasJwtKey = false;
      let jwtType: string = 'undefined';
      let jwtLen = 0;
      if (isRecord(p) && 'user_jwt' in p) {
        const v = p['user_jwt'];
        jwtType = typeof v;
        if (typeof v === 'string') {
          jwtLen = v.length;
        }
        hasJwtKey = true;
      }
      deps.logger.info('[executeModelCallAndSave] DIAGNOSTIC: payload user_jwt presence before guard', {
        jobId,
        hasJwtKey,
        jwtType,
        jwtLen,
        continueUntilComplete: job.payload.continueUntilComplete,
        target_contribution_id: job.payload.target_contribution_id,
      });
    }
    const userAuthTokenStrict: string = userAuthTokenEarly;

    if (typeof promptConstructionPayload.source_prompt_resource_id !== 'string' ||
        promptConstructionPayload.source_prompt_resource_id.trim() === '') {
      throw new Error('source_prompt_resource_id is required on promptConstructionPayload');
    }

    const enqueueModelCallParams: EnqueueModelCallParams = {
      dbClient,
      job,
      providerRow,
      userAuthToken: userAuthTokenStrict,
      output_type,
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