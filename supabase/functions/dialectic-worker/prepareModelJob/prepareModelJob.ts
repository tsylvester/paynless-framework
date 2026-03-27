import {
  InputRule,
  DialecticProjectResourceRow,
  DialecticContributionRow,
  DialecticFeedbackRow,
} from '../../dialectic-service/dialectic.interface.ts';
import {
  FileType,
  ModelContributionFileTypes,
  DialecticStageSlug,
} from '../../_shared/types/file_manager.types.ts';
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
import {
  CountTokensDeps,
  CountableChatPayload,
} from '../../_shared/types/tokenizer.types.ts';
import { CompressionCandidate } from '../../_shared/utils/vector_utils.ts';
import { ContextWindowError } from '../../_shared/utils/errors.ts';
import { getMaxOutputTokens } from '../../_shared/utils/affordability_utils.ts';
import { deconstructStoragePath } from '../../_shared/utils/path_deconstructor.ts';
import {
  isFileType,
  isModelContributionFileType,
} from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import type { ExecuteModelCallAndSaveParams } from '../executeModelCallAndSave/executeModelCallAndSave.interface.ts';
import type {
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
} from '../enqueueRenderJob/enqueueRenderJob.interface.ts';
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
    const { job, projectOwnerUserId, providerRow, sessionData } = params;
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

    let iterationNumber: number;
    if (typeof iterationNumberRaw === 'number') {
      iterationNumber = iterationNumberRaw;
    } else {
      deps.logger.error('[executeModelCallAndSave] iterationNumber validation failed', {
        jobId,
        iterationNumberRaw,
        iterationNumberType: typeof iterationNumberRaw,
      });
      throw new Error(`Job ${jobId} is missing required iterationNumber in its payload.`);
    }

    let projectId: string;
    if (typeof projectIdRaw === 'string' && projectIdRaw.trim() !== '') {
      projectId = projectIdRaw;
    } else {
      deps.logger.error('[executeModelCallAndSave] projectId validation failed', {
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
      deps.logger.error('[executeModelCallAndSave] sessionId validation failed', {
        jobId,
        sessionIdRaw,
        sessionIdType: typeof sessionIdRaw,
      });
      throw new Error(`Job ${jobId} is missing required sessionId in its payload.`);
    }

    let model_id: string;
    if (typeof model_idRaw === 'string' && model_idRaw.trim() !== '') {
      model_id = model_idRaw;
    } else {
      deps.logger.error('[executeModelCallAndSave] model_id validation failed', {
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
    } = promptConstructionPayload;

    const gatherArtifacts = async (): Promise<Required<ResourceDocuments[number]>[]> => {
      if (!inputsRequired || inputsRequired.length === 0) return [];
      const rules: InputRule[] = inputsRequired;

      const gathered: Required<ResourceDocuments[number]>[] = [];

      for (const rule of rules) {
        if (!rule.document_key) continue;
        const rType: InputRule['type'] = rule.type;
        const rStage: string = rule.slug;
        const rKey: string = rule.document_key;

        try {
          if (rType === 'document') {
            deps.logger.info(`[gatherArtifacts] Querying dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`);
            const { data, error } = await dbClient
              .from('dialectic_project_resources')
              .select('*')
              .eq('project_id', projectId)
              .eq('session_id', sessionId)
              .eq('iteration_number', iterationNumber)
              .eq('stage_slug', rStage)
              .eq('resource_type', 'rendered_document');
            if (error) {
              deps.logger.error(`[gatherArtifacts] Error querying dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`, { error });
              if (rule.required === false) {
                deps.logger.info(`[gatherArtifacts] Error querying optional document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'. Skipping optional input.`);
                continue;
              }
              throw new Error(`Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`);
            }
            if (!Array.isArray(data) || data.length === 0) {
              deps.logger.warn(`[gatherArtifacts] No resources found in dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`);
              if (rule.required === false) {
                deps.logger.info(`[gatherArtifacts] No rendered documents found for optional input rule type 'document' with stage '${rStage}' and document_key '${rKey}'. Skipping optional input.`);
                continue;
              }
              throw new Error(`Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`);
            }
            const filtered: DialecticProjectResourceRow[] = data.filter((row: DialecticProjectResourceRow) => {
              const parsed = deconstructStoragePath({ storageDir: row.storage_path, fileName: row.file_name, dbOriginalFileName: row.file_name });
              return row.stage_slug === rStage && parsed.documentKey === rKey;
            });
            const latest: DialecticProjectResourceRow = deps.pickLatest(filtered);
            const downloadResult = await deps.downloadFromStorage(dbClient, latest.storage_bucket, latest.storage_path + '/' + latest.file_name);
            if (downloadResult.error || !downloadResult.data) {
              throw new Error(`Failed to download content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`);
            }
            const content: string = new TextDecoder().decode(downloadResult.data);
            deps.logger.info(`[gatherArtifacts] Found rendered document in dialectic_project_resources: id='${latest.id}', stage='${rStage}', document_key='${rKey}'`);
            gathered.push({ id: latest.id, content, document_key: rKey, stage_slug: rStage, type: 'document' });
          }
          if (rType === 'feedback') {
            deps.logger.info(`[gatherArtifacts] Querying dialectic_feedback for feedback input rule: stage='${rStage}', document_key='${rKey}'`);
            const { data, error } = await dbClient
              .from('dialectic_feedback')
              .select('*')
              .eq('project_id', projectId)
              .eq('session_id', sessionId)
              .eq('iteration_number', iterationNumber)
              .eq('stage_slug', rStage);
            if (error) {
              deps.logger.error(`[gatherArtifacts] Error querying dialectic_feedback: stage='${rStage}', document_key='${rKey}'`, { error });
              if (rule.required === false) continue;
              throw new Error(`Required feedback for stage '${rStage}' and document_key '${rKey}' query failed.`);
            }
            if (!Array.isArray(data) || data.length === 0) {
              deps.logger.warn(`[gatherArtifacts] No feedback found for stage='${rStage}', document_key='${rKey}'`);
              if (rule.required === false) continue;
              throw new Error(`Required feedback for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_feedback.`);
            }
            const filtered: DialecticFeedbackRow[] = data.filter((row: DialecticFeedbackRow) => {
              const parsed = deconstructStoragePath({ storageDir: row.storage_path, fileName: row.file_name, dbOriginalFileName: row.file_name });
              return row.stage_slug === rStage && parsed.documentKey === rKey;
            });
            const latest: DialecticFeedbackRow = deps.pickLatest(filtered);
            const downloadResult = await deps.downloadFromStorage(dbClient, latest.storage_bucket, latest.storage_path + '/' + latest.file_name);
            if (downloadResult.error || !downloadResult.data) {
              throw new Error(`Failed to download feedback content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`);
            }
            const content: string = new TextDecoder().decode(downloadResult.data);
            deps.logger.info(`[gatherArtifacts] Found feedback: id='${latest.id}', stage='${latest.stage_slug}', document_key='${rKey}'`);
            gathered.push({ id: latest.id, content, document_key: rKey, stage_slug: latest.stage_slug, type: 'feedback' });
          }
          if (rType === 'seed_prompt') {
            deps.logger.info(`[gatherArtifacts] Querying dialectic_project_resources for seed_prompt input rule: stage='${rStage}', document_key='${rKey}'`);
            const { data, error } = await dbClient
              .from('dialectic_project_resources')
              .select('*')
              .eq('project_id', projectId)
              .eq('session_id', sessionId)
              .eq('iteration_number', iterationNumber)
              .eq('stage_slug', rStage)
              .eq('resource_type', 'seed_prompt');
            if (error) {
              deps.logger.error(`[gatherArtifacts] Error querying dialectic_project_resources for seed_prompt: stage='${rStage}', document_key='${rKey}'`, { error });
              if (rule.required === false) continue;
              throw new Error(`Required seed_prompt for stage '${rStage}' and document_key '${rKey}' query failed.`);
            }
            if (!Array.isArray(data) || data.length === 0) {
              deps.logger.warn(`[gatherArtifacts] No seed_prompt resources found for stage='${rStage}', document_key='${rKey}'`);
              if (rule.required === false) continue;
              throw new Error(`Required seed_prompt for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources.`);
            }
            const latest: DialecticProjectResourceRow = deps.pickLatest(data);
            const downloadResult = await deps.downloadFromStorage(dbClient, latest.storage_bucket, latest.storage_path + '/' + latest.file_name);
            if (downloadResult.error || !downloadResult.data) {
              throw new Error(`Failed to download seed_prompt content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`);
            }
            const content: string = new TextDecoder().decode(downloadResult.data);
            deps.logger.info(`[gatherArtifacts] Found seed_prompt: id='${latest.id}', stage='${rStage}', document_key='${rKey}'`);
            gathered.push({ id: latest.id, content, document_key: rKey, stage_slug: rStage, type: 'seed_prompt' });
          }
          if (rType === 'project_resource') {
            const isInitialUserPrompt = rKey === 'initial_user_prompt';
            const resourceTypeForQuery = isInitialUserPrompt ? 'initial_user_prompt' : 'project_resource';
            deps.logger.info(`[gatherArtifacts] Querying dialectic_project_resources for project_resource: document_key='${rKey}', resource_type='${resourceTypeForQuery}'`);
            const { data, error } = await dbClient
              .from('dialectic_project_resources')
              .select('*')
              .eq('project_id', projectId)
              .eq('resource_type', resourceTypeForQuery);
            if (error) {
              deps.logger.error(`[gatherArtifacts] Error querying dialectic_project_resources for project_resource: document_key='${rKey}'`, { error });
              if (rule.required === false) continue;
              throw new Error(`Required project_resource for document_key '${rKey}' query failed.`);
            }
            if (!Array.isArray(data) || data.length === 0) {
              deps.logger.warn(`[gatherArtifacts] No project_resource found for document_key='${rKey}'`);
              if (rule.required === false) continue;
              throw new Error(`Required project_resource for document_key '${rKey}' was not found in dialectic_project_resources.`);
            }
            const latest: DialecticProjectResourceRow = deps.pickLatest(data);
            const downloadResult = await deps.downloadFromStorage(dbClient, latest.storage_bucket, latest.storage_path + '/' + latest.file_name);
            if (downloadResult.error || !downloadResult.data) {
              throw new Error(`Failed to download project_resource content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`);
            }
            const content: string = new TextDecoder().decode(downloadResult.data);
            deps.logger.info(`[gatherArtifacts] Found project_resource: id='${latest.id}', document_key='${rKey}'`);
            gathered.push({ id: latest.id, content, document_key: rKey, stage_slug: rStage, type: 'project_resource' });
          } else if (rType === 'header_context' || (rType !== 'document' && rType !== 'feedback' && rType !== 'seed_prompt')) {
            deps.logger.info(`[gatherArtifacts] Querying dialectic_contributions for intermediate artifact: type='${rType}', stage='${rStage}', document_key='${rKey}'`);
            const { data, error } = await dbClient
              .from('dialectic_contributions')
              .select('*')
              .eq('session_id', sessionId)
              .eq('iteration_number', iterationNumber)
              .eq('stage', rStage);
            if (error) {
              deps.logger.error(`[gatherArtifacts] Error querying dialectic_contributions for type='${rType}': stage='${rStage}', document_key='${rKey}'`, { error });
              if (rule.required === false) continue;
              throw new Error(`Required ${rType} for stage '${rStage}' and document_key '${rKey}' query failed.`);
            }
            if (!Array.isArray(data) || data.length === 0) {
              deps.logger.warn(`[gatherArtifacts] No contributions found for type='${rType}', stage='${rStage}', document_key='${rKey}'`);
              if (rule.required === false) continue;
              throw new Error(`Required ${rType} for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_contributions.`);
            }
            const filtered: DialecticContributionRow[] = data.filter((row: DialecticContributionRow) => {
              if (!row.file_name) return false;
              const parsed = deconstructStoragePath({ storageDir: row.storage_path, fileName: row.file_name, dbOriginalFileName: row.file_name });
              return row.stage === rStage && parsed.documentKey === rKey;
            });
            const latest: DialecticContributionRow = deps.pickLatest(filtered);
            if (!latest.file_name) throw new Error(`Contribution row '${latest.id}' has null file_name — data integrity violation.`);
            const downloadResult = await deps.downloadFromStorage(dbClient, latest.storage_bucket, latest.storage_path + '/' + latest.file_name);
            if (downloadResult.error || !downloadResult.data) {
              throw new Error(`Failed to download ${rType} content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`);
            }
            const content: string = new TextDecoder().decode(downloadResult.data);
            deps.logger.info(`[gatherArtifacts] Found ${rType}: id='${latest.id}', stage='${latest.stage}', document_key='${rKey}'`);
            gathered.push({ id: latest.id, content, document_key: rKey, stage_slug: latest.stage, type: rType });
          }
        } catch (err) {
          if (rule.required === false) {
            deps.logger.info(`[gatherArtifacts] Error processing optional input rule type='${rType}', stage='${rStage}', document_key='${rKey}'. Skipping.`, { error: err });
            continue;
          }
          throw err;
        }
      }

      const unique = new Map<string, Required<ResourceDocuments[number]>>();
      for (const d of gathered) {
        if (!unique.has(d.id)) unique.set(d.id, d);
      }
      return Array.from(unique.values());
    };

    const gatheredDocs = await gatherArtifacts();
    const scopedDocs = deps.applyInputsRequiredScope(gatheredDocs, inputsRequired);

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

    const {
      countTokens,
      embeddingClient,
      ragService,
      tokenWalletService,
    } = deps;

    if (!deps.countTokens) {
      throw new Error("Dependency 'countTokens' is not provided.");
    }

    const tokenizerDeps: CountTokensDeps = {
      getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
      countTokensAnthropic: (text: string) => (text ?? '').length,
      logger: deps.logger,
    };
    const isContinuationFlowInitial = Boolean(job.target_contribution_id || job.payload.target_contribution_id);

    const initialAssembledMessages: Messages[] = conversationHistory
      .filter(msg => msg.role !== 'function');

    let currentAssembledMessages: Messages[] = initialAssembledMessages;

    const initialEffectiveMessages: { role: 'system'|'user'|'assistant'; content: string }[] = initialAssembledMessages
      .filter(isApiChatMessage)
      .filter((m): m is { role: 'system'|'user'|'assistant'; content: string } => m.content !== null);
    const normalizedInitialMessages = initialEffectiveMessages;

    const fullPayload: CountableChatPayload = {
      systemInstruction,
      message: currentUserPrompt,
      messages: normalizedInitialMessages,
      resourceDocuments,
    };
    const initialTokenCount = deps.countTokens(tokenizerDeps, fullPayload, extendedModelConfig);
    let resolvedInputTokenCount: number = initialTokenCount;
    const maxTokens = extendedModelConfig.context_window_tokens || extendedModelConfig.context_window_tokens;

    console.log(`[DEBUG] Initial Token Count: ${initialTokenCount}`);
    console.log(`[DEBUG] Max Tokens: ${maxTokens}`);
    console.log(`[DEBUG] Condition will be: ${!!maxTokens && initialTokenCount > maxTokens}`);

    if (!tokenWalletService) {
      throw new Error('Token wallet service is required for affordability preflight');
    }

    const walletBalanceStr = await tokenWalletService.getBalance(walletId);
    const walletBalance = deps.validateWalletBalance(walletBalanceStr, walletId);

    const { inputRate, outputRate } = deps.validateModelCostRates(
      extendedModelConfig.input_token_cost_rate,
      extendedModelConfig.output_token_cost_rate,
    );

    const isOversized = Boolean(maxTokens && initialTokenCount > maxTokens);
    let ssotMaxOutputNonOversized: number | undefined = undefined;
    if (!isOversized) {
      const plannedMaxOutputTokens = getMaxOutputTokens(
        walletBalance,
        initialTokenCount,
        extendedModelConfig,
        deps.logger,
      );
      if (plannedMaxOutputTokens < 0) {
        throw new Error('Insufficient funds to cover the input prompt cost.');
      }
      ssotMaxOutputNonOversized = plannedMaxOutputTokens;

      const providerMaxInputTokens = (typeof extendedModelConfig.provider_max_input_tokens === 'number'
        && extendedModelConfig.provider_max_input_tokens > 0)
        ? extendedModelConfig.provider_max_input_tokens
        : undefined;

      const safetyBufferTokens = 32;
      const allowedInput = typeof providerMaxInputTokens === 'number'
        ? providerMaxInputTokens - (plannedMaxOutputTokens + safetyBufferTokens)
        : Infinity;

      if (allowedInput !== Infinity && allowedInput <= 0) {
        throw new ContextWindowError(
          `No input window remains after reserving output budget (${plannedMaxOutputTokens}) and safety buffer (${safetyBufferTokens}).`,
        );
      }

      if (allowedInput !== Infinity && initialTokenCount > allowedInput) {
        throw new ContextWindowError(
          `Initial input tokens (${initialTokenCount}) exceed allowed input (${allowedInput}) after reserving output budget.`,
        );
      }

      const estimatedInputCost = initialTokenCount * inputRate;
      const estimatedOutputCost = plannedMaxOutputTokens * outputRate;
      const estimatedTotalCost = estimatedInputCost + estimatedOutputCost;

      if (estimatedTotalCost > walletBalance) {
        throw new Error(
          `Insufficient funds: estimated total cost (${estimatedTotalCost}) exceeds wallet balance (${walletBalance}).`,
        );
      }
    }

    let chatApiRequest: ChatApiRequest = {
      message: currentUserPrompt,
      messages: currentAssembledMessages
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

    if (!isOversized && typeof ssotMaxOutputNonOversized === 'number' && ssotMaxOutputNonOversized >= 0) {
      chatApiRequest = {
        ...chatApiRequest,
        max_tokens_to_generate: ssotMaxOutputNonOversized,
      };
    }

    if (maxTokens && initialTokenCount > maxTokens) {
      if (!ragService || !embeddingClient || !tokenWalletService || !countTokens) {
        throw new Error('Required services for prompt compression (RAG, Embedding, Wallet, Token Counter) are not available.');
      }

      const tokensToBeRemoved = initialTokenCount - maxTokens;

      if (typeof modelConfig.input_token_cost_rate !== 'number') {
        throw new Error(`Model ${providerRow.id} is missing a valid 'input_token_cost_rate' in its configuration and cannot be used for operations that require cost estimation.`);
      }
      const inputCostRate = modelConfig.input_token_cost_rate;

      const estimatedTotalRagCost = tokensToBeRemoved * inputCostRate;
      const estimatedFinalPromptCost = maxTokens * inputCostRate;
      const totalEstimatedInputCost = estimatedTotalRagCost + estimatedFinalPromptCost;

      const estimatedEmbeddingTokens = Math.max(0, tokensToBeRemoved);
      const estimatedEmbeddingCost = estimatedEmbeddingTokens * inputCostRate;
      const totalEstimatedInputCostWithEmbeddings = totalEstimatedInputCost + estimatedEmbeddingCost;

      const currentUserBalance: number = walletBalance;

      if (currentUserBalance < totalEstimatedInputCostWithEmbeddings) {
        throw new Error(`Insufficient funds for the entire operation (including embeddings). Estimated cost: ${totalEstimatedInputCostWithEmbeddings}, Balance: ${currentUserBalance}`);
      }

      const rationalityThreshold = 0.80;
      if (totalEstimatedInputCostWithEmbeddings > currentUserBalance * rationalityThreshold) {
        throw new Error(`Estimated cost (${totalEstimatedInputCostWithEmbeddings}) exceeds ${rationalityThreshold * 100}% of the user's balance (${currentUserBalance}).`);
      }

      deps.logger.info(
        `Initial prompt token count (${initialTokenCount}) exceeds model limit (${maxTokens}) for job ${jobId}. Attempting compression.`,
      );

      const workingHistory = [...conversationHistory];
      for (const doc of resourceDocuments) {
        const hasDocKey = typeof doc.document_key === 'string' && doc.document_key !== '';
        const hasType = typeof doc.type === 'string' && doc.type !== '';
        const hasStage = typeof doc.stage_slug === 'string' && doc.stage_slug !== '';
        if (!(hasDocKey && hasType && hasStage)) {
          throw new Error('Compression requires document identity: document_key, type, and stage_slug must be present.');
        }
      }
      let currentTokenCount = initialTokenCount;

      const safetyBufferTokensPre = 32;

      if (!extendedModelConfig.provider_max_input_tokens) {
        throw new Error('Provider max input tokens is not defined');
      }
      const providerMaxInputForPre = extendedModelConfig.provider_max_input_tokens;

      const getAllowedInputFor = (balanceTokens: number, tokenCount: number): number => {
        const plannedOut = getMaxOutputTokens(
          balanceTokens,
          tokenCount,
          extendedModelConfig,
          deps.logger,
        );
        return providerMaxInputForPre - (plannedOut + safetyBufferTokensPre);
      };

      const solveTargetForBalance = (balanceTokens: number): number => {
        let t = Math.min(
          maxTokens,
          initialTokenCount,
        );
        for (let i = 0; i < 5; i++) {
          const allowed = getAllowedInputFor(balanceTokens, t);
          const next = Math.min(
            maxTokens,
            allowed,
          );
          if (!(next < t - 1)) break;
          t = Math.max(0, Math.floor(next));
        }
        return Math.max(0, Math.floor(t));
      };

      const prelimTarget = solveTargetForBalance(walletBalance);
      const prelimTokensToRemove = Math.max(0, initialTokenCount - prelimTarget);
      const estimatedCompressionCost = prelimTokensToRemove * inputRate;
      const balanceAfterCompression = walletBalance - estimatedCompressionCost;
      if (!Number.isFinite(balanceAfterCompression) || balanceAfterCompression <= 0) {
        throw new Error(`Insufficient funds: compression requires ${estimatedCompressionCost} tokens, balance is ${walletBalance}.`);
      }

      const finalTargetThreshold = solveTargetForBalance(balanceAfterCompression);
      if (!(finalTargetThreshold >= 0)) {
        throw new ContextWindowError(`Unable to determine a feasible input size target given current balance.`);
      }

      const plannedMaxOutPostPrecheck = getMaxOutputTokens(
        balanceAfterCompression,
        finalTargetThreshold,
        extendedModelConfig,
        deps.logger,
      );
      const estimatedFinalInputCost = finalTargetThreshold * inputRate;
      const estimatedFinalOutputCost = plannedMaxOutPostPrecheck * outputRate;
      const totalEstimatedCost = estimatedCompressionCost + estimatedFinalInputCost + estimatedFinalOutputCost;
      if (totalEstimatedCost > walletBalance) {
        throw new Error(
          `Insufficient funds: total estimated cost (compression + final I/O) ${totalEstimatedCost} exceeds balance ${walletBalance}.`,
        );
      }
      const rationalityThresholdTotal = 0.80;
      if (totalEstimatedCost > walletBalance * rationalityThresholdTotal) {
        throw new Error(`Estimated cost (${totalEstimatedCost}) exceeds ${rationalityThresholdTotal*100}% of the user's balance (${walletBalance}).`);
      }

      let currentBalanceTokens = walletBalance;

      const computeAllowedInput = (tokenCount: number): number => {
        const plannedMaxOutput = getMaxOutputTokens(
          currentBalanceTokens,
          tokenCount,
          extendedModelConfig,
          deps.logger,
        );
        if (!extendedModelConfig.provider_max_input_tokens) {
          throw new Error('Provider max input tokens is not defined');
        }
        const safetyBuffer = 32;
        return extendedModelConfig.provider_max_input_tokens - (plannedMaxOutput + safetyBuffer);
      };

      const candidates = await compressionStrategy(
        { dbClient, embeddingClient: deps.embeddingClient, logger: deps.logger },
        { inputsRelevance },
        { documents: resourceDocuments, history: workingHistory, currentUserPrompt },
      );
      console.log(`[DEBUG] Number of compression candidates found: ${candidates.length}`);

      const idsToCheck = candidates
        .map((c: CompressionCandidate) => c.id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

      let indexedIds = new Set<string>();
      if (idsToCheck.length > 0) {
        const { data: indexedRows, error: indexedErr } = await dbClient
          .from('dialectic_memory')
          .select('source_contribution_id')
          .in('source_contribution_id', idsToCheck);

        if (!indexedErr && Array.isArray(indexedRows)) {
          indexedIds = new Set(
            indexedRows
              .map((r) => (r && typeof (r)['source_contribution_id'] === 'string' ? (r)['source_contribution_id'] : undefined))
              .filter((v): v is string => typeof v === 'string'),
          );
        }
      }

      while (candidates.length > 0) {
        if (!(currentTokenCount > finalTargetThreshold)) {
          break;
        }
        const victim = candidates.shift();
        if (!victim) break;

        if (typeof victim.id === 'string' && indexedIds.has(victim.id)) {
          continue;
        }

        if (!inputsRelevance) {
          throw new Error('inputsRelevance is required');
        }
        const ragResult = await ragService.getContextForModel(
          [{ id: victim.id, content: victim.content || '' }],
          extendedModelConfig,
          sessionId,
          stageSlug,
          inputsRelevance,
        );

        if (ragResult.error) throw ragResult.error;

        const tokensUsed = ragResult.tokensUsedForIndexing || 0;
        deps.logger.info('[executeModelCallAndSave] RAG tokensUsedForIndexing observed in-loop', {
          jobId,
          candidateId: victim.id,
          tokensUsed,
          hasWallet: Boolean(walletId),
        });
        if (tokensUsed > 0) {
          const observedCompressionCost = tokensUsed * inputRate;
          currentBalanceTokens = Math.max(0, currentBalanceTokens - observedCompressionCost);
        }
        if (tokensUsed > 0 && walletId) {
          deps.logger.info('[executeModelCallAndSave] Debiting wallet for RAG compression', {
            jobId,
            candidateId: victim.id,
            amount: tokensUsed,
          });
          try {
            await tokenWalletService.recordTransaction({
              walletId: walletId,
              type: 'DEBIT_USAGE',
              amount: tokensUsed.toString(),
              recordedByUserId: projectOwnerUserId,
              idempotencyKey: `rag:${jobId}:${victim.id}`,
              relatedEntityId: victim.id,
              relatedEntityType: 'rag_compression',
              notes: `RAG compression for job ${jobId}`,
            });
          } catch (error) {
            throw new Error(`Insufficient funds for RAG operation. Cost: ${tokensUsed} tokens.`, { cause: error });
          }
        }

        const newContent = ragResult.context;
        if (!newContent) {
          throw new Error(`RAG context is empty for candidate ${victim.id}`);
        }
        if (victim.sourceType === 'history') {
          const historyIndex = workingHistory.findIndex(h => h.id === victim.id);
          if (historyIndex > -1) workingHistory[historyIndex].content = newContent;
        } else {
          const docIndex = resourceDocuments.findIndex(d => d.id === victim.id);
          if (docIndex > -1) resourceDocuments[docIndex].content = newContent;
        }

        const enforcedHistory: Messages[] = [];
        if (workingHistory.length > 0) {
          enforcedHistory.push(workingHistory[0]);
          for (let i = 1; i < workingHistory.length; i++) {
            const prevMsg = enforcedHistory[enforcedHistory.length - 1];
            const currentMsg = workingHistory[i];
            if (prevMsg.role === currentMsg.role) {
              if (currentMsg.role === 'assistant') {
                enforcedHistory.push({ role: 'user', content: 'Please continue.' });
              } else {
                enforcedHistory.push({ role: 'assistant', content: '' });
              }
            }
            enforcedHistory.push(currentMsg);
          }
        }

        const loopAssembledMessages: Messages[] = [];
        if (!isContinuationFlowInitial) {
          loopAssembledMessages.push({ role: 'user', content: currentUserPrompt });
        }
        enforcedHistory.forEach(msg => {
          if (msg.role !== 'function') {
            loopAssembledMessages.push({ role: msg.role, content: msg.content });
          }
        });
        currentAssembledMessages = loopAssembledMessages;

        chatApiRequest = {
          ...chatApiRequest,
          message: currentUserPrompt,
          messages: currentAssembledMessages
            .filter(isApiChatMessage)
            .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
          resourceDocuments,
        };
        const loopPayload: CountableChatPayload = {
          systemInstruction: chatApiRequest.systemInstruction,
          message: chatApiRequest.message,
          messages: chatApiRequest.messages,
          resourceDocuments: chatApiRequest.resourceDocuments,
        };
        currentTokenCount = deps.countTokens(tokenizerDeps, loopPayload, extendedModelConfig);
      }

      const allowedInputCheck = computeAllowedInput(currentTokenCount);
      if (currentTokenCount > Math.min(
        maxTokens,
        allowedInputCheck,
      )) {
        throw new ContextWindowError(
          `Compressed prompt token count (${currentTokenCount}) still exceeds model limit (${maxTokens}) and allowed input (${allowedInputCheck}).`,
        );
      }

      deps.logger.info(
        `[executeModelCallAndSave] Prompt successfully compressed. New token count: ${currentTokenCount}`,
      );

      chatApiRequest = {
        ...chatApiRequest,
        message: currentUserPrompt,
        messages: currentAssembledMessages
          .filter(isApiChatMessage)
          .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
        resourceDocuments,
      };
      const finalPayloadAfterCompression: CountableChatPayload = {
        systemInstruction: chatApiRequest.systemInstruction,
        message: chatApiRequest.message,
        messages: chatApiRequest.messages,
        resourceDocuments: chatApiRequest.resourceDocuments,
      };
      const finalTokenCountAfterCompression = deps.countTokens(tokenizerDeps, finalPayloadAfterCompression, extendedModelConfig);
      resolvedInputTokenCount = finalTokenCountAfterCompression;

      const plannedMaxOutputTokensPost = getMaxOutputTokens(
        currentBalanceTokens,
        finalTokenCountAfterCompression,
        extendedModelConfig,
        deps.logger,
      );

      const providerMaxInputTokensPost =
        extendedModelConfig.provider_max_input_tokens;

      const safetyBufferTokensPost = 32;
      const allowedInputPost = providerMaxInputTokensPost - (plannedMaxOutputTokensPost + safetyBufferTokensPost);

      if (allowedInputPost !== Infinity && allowedInputPost <= 0) {
        throw new ContextWindowError(
          `No input window remains after reserving output budget (${plannedMaxOutputTokensPost}) and safety buffer (${safetyBufferTokensPost}).`,
        );
      }

      if (allowedInputPost !== Infinity && finalTokenCountAfterCompression > allowedInputPost) {
        throw new ContextWindowError(
          `Final input tokens (${finalTokenCountAfterCompression}) exceed allowed input (${allowedInputPost}) after reserving output budget.`,
        );
      }

      const estimatedInputCostPost = finalTokenCountAfterCompression * inputRate;
      const estimatedOutputCostPost = plannedMaxOutputTokensPost * outputRate;
      const estimatedTotalCostPost = estimatedInputCostPost + estimatedOutputCostPost;
      if (estimatedTotalCostPost > walletBalance) {
        throw new Error(
          `Insufficient funds: estimated total cost (${estimatedTotalCostPost}) exceeds wallet balance (${walletBalance}) after compression.`,
        );
      }

      chatApiRequest = {
        ...chatApiRequest,
        max_tokens_to_generate: plannedMaxOutputTokensPost,
      };
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

    const emcasParams: ExecuteModelCallAndSaveParams = {
      dbClient,
      job,
      providerRow,
      userAuthToken: userAuthTokenStrict,
      sessionData,
      projectOwnerUserId,
      stageSlug,
      iterationNumber,
      projectId,
      sessionId,
      model_id,
      walletId,
      output_type,
      sourcePromptResourceId: promptConstructionPayload.source_prompt_resource_id,
    };

    const emcasResult = await deps.executeModelCallAndSave(emcasParams, { chatApiRequest, preflightInputTokens: resolvedInputTokenCount });

    if ('error' in emcasResult) {
      return { error: emcasResult.error, retriable: emcasResult.retriable };
    }

    let stageSlugResolved: DialecticStageSlug | null = null;
    for (const slug of Object.values(DialecticStageSlug)) {
      if (slug === stageSlug) {
        stageSlugResolved = slug;
        break;
      }
    }
    if (stageSlugResolved === null) {
      return { error: new Error(`Invalid stage slug: ${stageSlug}`), retriable: false };
    }

    if (!isModelContributionFileType(output_type)) {
      return { error: new Error(`output_type is not a valid ModelContributionFileTypes: ${output_type}`), retriable: false };
    }
    const outputTypeModel: ModelContributionFileTypes = output_type;

    if (!isModelContributionFileType(emcasResult.fileType)) {
      return { error: new Error(`Invalid fileType from executeModelCallAndSave: ${emcasResult.fileType}`), retriable: false };
    }
    const fileTypeModel: ModelContributionFileTypes = emcasResult.fileType;

    if (!isFileType(emcasResult.storageFileType)) {
      return { error: new Error(`Invalid storageFileType from executeModelCallAndSave: ${emcasResult.storageFileType}`), retriable: false };
    }
    const storageFileTypeModel: FileType = emcasResult.storageFileType;

    let documentKeyForRender: FileType | undefined = undefined;
    if (emcasResult.documentKey !== undefined) {
      if (!isFileType(emcasResult.documentKey)) {
        return { error: new Error(`Invalid documentKey from executeModelCallAndSave: ${emcasResult.documentKey}`), retriable: false };
      }
      documentKeyForRender = emcasResult.documentKey;
    }

    const renderParams: EnqueueRenderJobParams = {
      jobId: job.id,
      sessionId,
      stageSlug: stageSlugResolved,
      iterationNumber,
      outputType: outputTypeModel,
      projectId,
      projectOwnerUserId,
      userAuthToken: userAuthTokenStrict,
      modelId: model_id,
      walletId,
      isTestJob: job.is_test_job ?? false,
    };

    const renderPayload: EnqueueRenderJobPayload = {
      contributionId: emcasResult.contribution.id,
      needsContinuation: emcasResult.needsContinuation,
      documentKey: documentKeyForRender,
      stageRelationshipForStage: emcasResult.stageRelationshipForStage,
      fileType: fileTypeModel,
      storageFileType: storageFileTypeModel,
    };

    const enqueueResult = await deps.enqueueRenderJob(renderParams, renderPayload);

    if ('error' in enqueueResult) {
      return { error: enqueueResult.error, retriable: enqueueResult.retriable };
    }

    return {
      contribution: emcasResult.contribution,
      needsContinuation: emcasResult.needsContinuation,
      renderJobId: enqueueResult.renderJobId,
    };
  } catch (error) {
    const err: Error = error instanceof Error ? error : new Error(String(error));
    return { error: err, retriable: false };
  }
}