import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json, Tables } from '../../types_db.ts';
import type {
  ModelProcessingResult,
  UnifiedAIResponse,
  DocumentRelationships,
  ContextForDocument,
} from '../../dialectic-service/dialectic.interface.ts';
import type { DetermineContinuationParams } from '../../_shared/utils/determineContinuation/determineContinuation.interface.ts';
import {
  FileType,
  type ModelContributionFileTypes,
  type ModelContributionUploadContext,
  type CanonicalPathParams,
} from '../../_shared/types/file_manager.types.ts';
import {
  isAiModelExtendedConfig,
  isDialecticContribution,
  isContributionType,
  isDialecticContinueReason,
  isRecord,
  isJson,
  isDocumentRelationships,
} from '../../_shared/utils/type_guards.ts';
import type {
  AdapterStreamChunk,
  AiModelExtendedConfig,
  FactoryDependencies,
  FinishReason,
  TokenUsage,
} from '../../_shared/types.ts';
import { sanitizeJsonContent } from '../../_shared/utils/jsonSanitizer.ts';
import { isJsonSanitizationResult } from '../../_shared/utils/type-guards/type_guards.jsonSanitizer.ts';
import type { JsonSanitizationResult } from '../../_shared/types/jsonSanitizer.interface.ts';
import {
  isDocumentKey,
  isDocumentRelated,
  isModelContributionFileType,
} from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { extractSourceGroupFragment } from '../../_shared/utils/path_utils.ts';
import { RenderJobValidationError } from '../../_shared/utils/errors.ts';
import type { ChatMessageRow } from '../../_shared/types.ts';
import type { TokenWallet } from '../../_shared/types/tokenWallet.types.ts';
import type {
  DebitTokensParams,
  DebitTokensPayload,
} from '../../_shared/utils/debitTokens.interface.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSavePayload,
  ExecuteModelCallAndSaveReturn,
  ExecuteModelCallAndSaveSuccessReturn,
  ExecuteModelCallAndSaveErrorReturn,
} from './executeModelCallAndSave.interface.ts';
import {
  isContextForDocument,
  isContextForDocumentArray,
} from '../../_shared/utils/type-guards/type_guards.dialectic.ts';

const SOFT_TIMEOUT_MS: number = 230_000;

function apiKeyForProvider(apiIdentifier: string): string {
  const id: string = apiIdentifier.toLowerCase();
  if (id.startsWith('openai-')) {
    const k: string | undefined = Deno.env.get('OPENAI_API_KEY');
    if (!k) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    return k;
  }
  if (id.startsWith('anthropic-')) {
    const k: string | undefined = Deno.env.get('ANTHROPIC_API_KEY');
    if (!k) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    return k;
  }
  if (id.startsWith('google-')) {
    const k: string | undefined = Deno.env.get('GOOGLE_API_KEY');
    if (!k) {
      throw new Error('GOOGLE_API_KEY is not set');
    }
    return k;
  }
  if (id.startsWith('dummy-')) {
    return 'dummy-api-key';
  }
  return '';
}

function readOptionalContinuationCount(payload: unknown): number | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const desc: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
    payload,
    'continuation_count',
  );
  if (!desc) {
    return undefined;
  }
  const v: unknown = desc.value;
  if (typeof v === 'number' && Number.isInteger(v)) {
    return v;
  }
  return undefined;
}

export async function executeModelCallAndSave(
  deps: ExecuteModelCallAndSaveDeps,
  params: ExecuteModelCallAndSaveParams,
  payload: ExecuteModelCallAndSavePayload,
): Promise<ExecuteModelCallAndSaveReturn> {
  const dbClient: SupabaseClient<Database> = params.dbClient;
  const job = params.job;
  const providerRow: Tables<'ai_providers'> = params.providerRow;
  const projectOwnerUserId: string = params.projectOwnerUserId;
  const stageSlug: string = params.stageSlug;
  const iterationNumber: number = params.iterationNumber;
  const sessionId: string = params.sessionId;
  const model_id: string = params.model_id;
  const walletId: string = params.walletId;
  const output_type: string = params.output_type;

  if (!isModelContributionFileType(output_type)) {
    const err: Error = new Error(`Invalid output_type for model contribution: ${output_type}`);
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }
  const fileType: ModelContributionFileTypes = output_type;

  const jobId: string = job.id;
  const currentAttempt: number = job.attempt_count;

  if (!isAiModelExtendedConfig(providerRow.config)) {
    const err: Error = new Error('Invalid extended model configuration on provider row');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }
  const extendedModelConfig: AiModelExtendedConfig = providerRow.config;

  const apiKey: string = apiKeyForProvider(providerRow.api_identifier);
  const factoryDeps: FactoryDependencies = {
    provider: providerRow,
    apiKey,
    logger: deps.logger,
  };
  const adapter = deps.getAiProviderAdapter(factoryDeps);
  if (adapter === null) {
    const err: Error = new Error('Failed to resolve AI provider adapter');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }

  const startTime: number = Date.now();
  let assembledContent: string = '';
  let tokenUsage: TokenUsage | null = null;
  let streamFinishReason: FinishReason = 'unknown';

  try {
    const stream: AsyncGenerator<AdapterStreamChunk, void, undefined> = adapter.sendMessageStream(
      payload.chatApiRequest,
      providerRow.api_identifier,
    );
    for await (const chunk of stream) {
      if (chunk.type === 'text_delta') {
        assembledContent += chunk.text;
        if (Date.now() - startTime > SOFT_TIMEOUT_MS) {
          streamFinishReason = 'length';
          break;
        }
      } else if (chunk.type === 'usage') {
        tokenUsage = chunk.tokenUsage;
      } else if (chunk.type === 'done') {
        streamFinishReason = chunk.finish_reason;
      }
    }
  } catch (streamErr: unknown) {
    const err: Error = streamErr instanceof Error ? streamErr : new Error(String(streamErr));
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: true };
    return out;
  }

  const endTime: number = Date.now();
  const processingTimeMs: number = endTime - startTime;

  const trimmedContent: string = assembledContent.trim();
  const contentString: string | null = trimmedContent === '' ? null : trimmedContent;

  let effectiveTokenUsage: TokenUsage | null = tokenUsage;
  if (effectiveTokenUsage === null && contentString !== null) {
    const preflight: number = payload.preflightInputTokens;
    const completionChars: number = contentString.length;
    const synthetic: TokenUsage = {
      prompt_tokens: preflight,
      completion_tokens: completionChars,
      total_tokens: preflight + completionChars,
    };
    effectiveTokenUsage = synthetic;
  }

  const aiResponse: UnifiedAIResponse = {
    content: contentString,
    tokenUsage: effectiveTokenUsage,
    inputTokens: effectiveTokenUsage?.prompt_tokens,
    outputTokens: effectiveTokenUsage?.completion_tokens,
    processingTimeMs,
    finish_reason: streamFinishReason,
    rawProviderResponse: {
      token_usage: effectiveTokenUsage,
      finish_reason: streamFinishReason,
    },
  };

  deps.logger.info(
    `[dialectic-worker] [executeModelCallAndSave] AI call completed for job ${job.id} in ${processingTimeMs}ms.`,
  );
  deps.logger.info(`[executeModelCallAndSave] DIAGNOSTIC: Full AI Response for job ${job.id}:`, {
    aiResponse,
  });

  if (aiResponse.error || !aiResponse.content) {
    await deps.retryJob(
      { logger: deps.logger, notificationService: deps.notificationService },
      dbClient,
      job,
      job.attempt_count + 1,
      [{
        modelId: providerRow.id,
        api_identifier: providerRow.api_identifier,
        error: aiResponse.error || 'AI response was empty.',
        processingTimeMs: processingTimeMs,
      }],
      projectOwnerUserId,
    );
    const err: Error = new Error(aiResponse.error || 'AI response was empty.');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: true };
    return out;
  }

  const resolvedFinish: FinishReason = deps.resolveFinishReason(aiResponse);

  if (resolvedFinish === 'error') {
    await deps.retryJob(
      { logger: deps.logger, notificationService: deps.notificationService },
      dbClient,
      job,
      job.attempt_count + 1,
      [{
        modelId: providerRow.id,
        api_identifier: providerRow.api_identifier,
        error: 'AI provider signaled error via finish_reason.',
        processingTimeMs: processingTimeMs,
      }],
      projectOwnerUserId,
    );
    const err: Error = new Error('AI provider signaled error via finish_reason.');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: true };
    return out;
  }

  let shouldContinue: boolean = isDialecticContinueReason(resolvedFinish);

  const jobPayloadUnknown: unknown = job.payload;
  const continueUntilCompleteFlag: boolean = isRecord(jobPayloadUnknown) &&
      jobPayloadUnknown.continueUntilComplete === true;

  const isIntermediate: boolean = deps.isIntermediateChunk(
    resolvedFinish,
    continueUntilCompleteFlag,
  );

  let contentForStorage: string;
  if (isIntermediate) {
    contentForStorage = aiResponse.content;
    deps.logger.info(
      `[executeModelCallAndSave] Skipping sanitize/parse for intermediate continuation chunk (finish_reason: ${resolvedFinish})`,
      { jobId },
    );
  } else {
    const sanitizationResult: JsonSanitizationResult = sanitizeJsonContent(aiResponse.content);

    if (!isJsonSanitizationResult(sanitizationResult)) {
      deps.logger.warn(
        `[executeModelCallAndSave] Invalid sanitization result for job ${job.id}. Triggering retry.`,
      );
      await deps.retryJob(
        { logger: deps.logger, notificationService: deps.notificationService },
        dbClient,
        job,
        job.attempt_count + 1,
        [{
          modelId: providerRow.id,
          api_identifier: providerRow.api_identifier,
          error: 'Invalid JSON sanitization result',
          processingTimeMs: processingTimeMs,
        }],
        projectOwnerUserId,
      );
      const err: Error = new Error('Invalid JSON sanitization result');
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: true };
      return out;
    }

    if (sanitizationResult.wasSanitized) {
      deps.logger.info(`[executeModelCallAndSave] JSON content sanitized for job ${job.id}`, {
        originalLength: sanitizationResult.originalLength,
        sanitizedLength: sanitizationResult.sanitized.length,
        wasStructurallyFixed: sanitizationResult.wasStructurallyFixed,
      });
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(sanitizationResult.sanitized);
    } catch (e: unknown) {
      deps.logger.warn(
        `[executeModelCallAndSave] Malformed JSON response for job ${job.id} after sanitization. Triggering retry.`,
        { error: e instanceof Error ? e.message : String(e) },
      );

      await deps.retryJob(
        { logger: deps.logger, notificationService: deps.notificationService },
        dbClient,
        job,
        job.attempt_count + 1,
        [{
          modelId: providerRow.id,
          api_identifier: providerRow.api_identifier,
          error: `Malformed JSON response: ${e instanceof Error ? e.message : String(e)}`,
          processingTimeMs: processingTimeMs,
        }],
        projectOwnerUserId,
      );

      const err: Error = new Error(
        `Malformed JSON response: ${e instanceof Error ? e.message : String(e)}`,
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: true };
      return out;
    }

    contentForStorage = sanitizationResult.sanitized;

    const documentKeyForContinuation: unknown = isRecord(jobPayloadUnknown)
      ? jobPayloadUnknown.document_key
      : undefined;
    const contextForDocumentsUnknown: unknown = isRecord(jobPayloadUnknown)
      ? jobPayloadUnknown.context_for_documents
      : undefined;
    const contextForDocumentsForContinuation: DetermineContinuationParams['contextForDocuments'] =
      isContextForDocumentArray(contextForDocumentsUnknown)
        ? contextForDocumentsUnknown
        : undefined;

    const continuationResult = deps.determineContinuation({
      finishReasonContinue: isDialecticContinueReason(resolvedFinish),
      wasStructurallyFixed: sanitizationResult.wasStructurallyFixed,
      parsedContent,
      continueUntilComplete: continueUntilCompleteFlag,
      documentKey: typeof documentKeyForContinuation === 'string' ? documentKeyForContinuation : undefined,
      contextForDocuments: contextForDocumentsForContinuation,
    });
    shouldContinue = continuationResult.shouldContinue;
  }

  const needsContinuation: boolean = continueUntilCompleteFlag && shouldContinue;

  const documentRelationshipsUnknown: unknown = isRecord(jobPayloadUnknown)
    ? jobPayloadUnknown.document_relationships
    : undefined;
  const document_relationships: Json | null =
    documentRelationshipsUnknown === undefined || documentRelationshipsUnknown === null
      ? null
      : isJson(documentRelationshipsUnknown)
      ? documentRelationshipsUnknown
      : null;

  const description: string = `${output_type} for stage '${stageSlug}' by model ${providerRow.name}`;

  const canonicalUnknown: unknown = isRecord(jobPayloadUnknown)
    ? jobPayloadUnknown.canonicalPathParams
    : undefined;
  if (!isRecord(canonicalUnknown)) {
    const err: Error = new Error('job.payload.canonicalPathParams is required');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }

  const rawContributionType: unknown = canonicalUnknown.contributionType;
  const contributionType =
    typeof rawContributionType === 'string' && isContributionType(rawContributionType)
      ? rawContributionType
      : undefined;

  const stageSlugCanon: unknown = canonicalUnknown.stageSlug;
  if (typeof stageSlugCanon !== 'string' || stageSlugCanon.trim() === '') {
    const err: Error = new Error('canonicalPathParams.stageSlug is required');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }
  const restOfCanonicalPathParams: Omit<CanonicalPathParams, 'contributionType'> = {
    stageSlug: stageSlugCanon,
  };
  const smsUnknown: unknown = canonicalUnknown.sourceModelSlugs;
  if (Array.isArray(smsUnknown) && smsUnknown.every((x): x is string => typeof x === 'string')) {
    restOfCanonicalPathParams.sourceModelSlugs = smsUnknown;
  }
  const satUnknown: unknown = canonicalUnknown.sourceAnchorType;
  if (typeof satUnknown === 'string') {
    restOfCanonicalPathParams.sourceAnchorType = satUnknown;
  }
  const samUnknown: unknown = canonicalUnknown.sourceAnchorModelSlug;
  if (typeof samUnknown === 'string') {
    restOfCanonicalPathParams.sourceAnchorModelSlug = samUnknown;
  }
  const sacUnknown: unknown = canonicalUnknown.sourceAttemptCount;
  if (typeof sacUnknown === 'number') {
    restOfCanonicalPathParams.sourceAttemptCount = sacUnknown;
  }
  const pmUnknown: unknown = canonicalUnknown.pairedModelSlug;
  if (typeof pmUnknown === 'string') {
    restOfCanonicalPathParams.pairedModelSlug = pmUnknown;
  }

  const targetFromPayload: unknown = isRecord(jobPayloadUnknown)
    ? jobPayloadUnknown.target_contribution_id
    : undefined;
  const targetContributionId: string | undefined =
    (typeof targetFromPayload === 'string' && targetFromPayload.length > 0)
      ? targetFromPayload
      : (typeof job.target_contribution_id === 'string' && job.target_contribution_id.length > 0)
      ? job.target_contribution_id
      : undefined;

  const isContinuationForStorage: boolean =
    typeof targetContributionId === 'string' && targetContributionId.trim() !== '';

  if (isContinuationForStorage) {
    const relsUnknown: unknown = isRecord(jobPayloadUnknown)
      ? jobPayloadUnknown.document_relationships
      : undefined;
    if (!isDocumentRelationships(relsUnknown)) {
      const err: Error = new Error('Continuation save requires valid document_relationships');
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }

    const continuationCount: number | undefined = readOptionalContinuationCount(jobPayloadUnknown);
    if (continuationCount === undefined || continuationCount === null) {
      const err: Error = new Error(
        'continuation_count is required and must be a number > 0 for continuation chunks',
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }
    if (typeof continuationCount !== 'number') {
      const err: Error = new Error(
        'continuation_count is required and must be a number > 0 for continuation chunks',
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }
    if (continuationCount <= 0) {
      const err: Error = new Error(
        'continuation_count is required and must be a number > 0 for continuation chunks',
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }
  }

  if (!aiResponse.rawProviderResponse || !isJson(aiResponse.rawProviderResponse)) {
    const err: Error = new Error('Raw provider response is required');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }

  if (isDocumentRelated(fileType)) {
    const missingValues: string[] = [];

    const payloadProjectId: unknown = isRecord(jobPayloadUnknown)
      ? jobPayloadUnknown.projectId
      : undefined;
    if (!payloadProjectId || typeof payloadProjectId !== 'string' || payloadProjectId.trim() === '') {
      missingValues.push('job.payload.projectId (string, non-empty)');
    }
    const payloadSessionId: unknown = isRecord(jobPayloadUnknown)
      ? jobPayloadUnknown.sessionId
      : undefined;
    if (!payloadSessionId || typeof payloadSessionId !== 'string' || payloadSessionId.trim() === '') {
      missingValues.push('job.payload.sessionId (string, non-empty)');
    }
    const payloadIter: unknown = isRecord(jobPayloadUnknown)
      ? jobPayloadUnknown.iterationNumber
      : undefined;
    if (payloadIter === undefined || typeof payloadIter !== 'number') {
      missingValues.push('job.payload.iterationNumber (number)');
    }
    if (!canonicalUnknown || !isRecord(canonicalUnknown)) {
      missingValues.push('job.payload.canonicalPathParams (object)');
    } else {
      const cStage: unknown = canonicalUnknown.stageSlug;
      if (!cStage || typeof cStage !== 'string' || cStage.trim() === '') {
        missingValues.push('job.payload.canonicalPathParams.stageSlug (string, non-empty)');
      }
    }
    if (job.attempt_count === undefined || typeof job.attempt_count !== 'number') {
      missingValues.push('job.attempt_count (number)');
    }
    if (
      !providerRow.api_identifier ||
      typeof providerRow.api_identifier !== 'string' ||
      providerRow.api_identifier.trim() === ''
    ) {
      missingValues.push('providerRow.api_identifier (string, non-empty)');
    }
    const payloadDocKey: unknown = isRecord(jobPayloadUnknown)
      ? jobPayloadUnknown.document_key
      : undefined;
    if (!payloadDocKey || typeof payloadDocKey !== 'string' || payloadDocKey.trim() === '') {
      missingValues.push('job.payload.document_key (string, non-empty)');
    }

    if (missingValues.length > 0) {
      const err: Error = new Error(
        `executeModelCallAndSave requires all of the following values for document file type '${output_type}': job.payload.projectId (string, non-empty), job.payload.sessionId (string, non-empty), job.payload.iterationNumber (number), job.payload.canonicalPathParams.stageSlug (string, non-empty), job.attempt_count (number), providerRow.api_identifier (string, non-empty), job.payload.document_key (string, non-empty). Missing or invalid: ${missingValues.join(', ')}`,
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }
  }

  const storageFileType: ModelContributionFileTypes = isDocumentKey(fileType)
    ? FileType.ModelContributionRawJson
    : fileType;

  const docRelForSourceGroup: unknown = isRecord(jobPayloadUnknown)
    ? jobPayloadUnknown.document_relationships
    : undefined;
  const sourceGroupUnknown: unknown = isRecord(docRelForSourceGroup)
    ? docRelForSourceGroup.source_group
    : undefined;
  const sourceGroup: string | undefined =
    sourceGroupUnknown === null || sourceGroupUnknown === undefined
      ? undefined
      : typeof sourceGroupUnknown === 'string'
      ? sourceGroupUnknown
      : undefined;
  const sourceGroupIsNull: boolean = isRecord(docRelForSourceGroup) &&
    docRelForSourceGroup.source_group === null;

  if (isDocumentRelated(fileType) && !sourceGroup) {
    if (sourceGroupIsNull && isRecord(jobPayloadUnknown)) {
      const plannerMeta: unknown = jobPayloadUnknown.planner_metadata;
      if (isRecord(plannerMeta) && typeof plannerMeta.recipe_step_id === 'string') {
        const recipeStepId: string = plannerMeta.recipe_step_id;

        let recipeStep: unknown = null;
        const { data: clonedStep, error: clonedError } = await dbClient
          .from('dialectic_stage_recipe_steps')
          .select('granularity_strategy')
          .eq('id', recipeStepId)
          .maybeSingle();

        if (!clonedError && clonedStep && isRecord(clonedStep)) {
          recipeStep = clonedStep;
        } else {
          const { data: templateStep, error: templateError } = await dbClient
            .from('dialectic_recipe_template_steps')
            .select('granularity_strategy')
            .eq('id', recipeStepId)
            .maybeSingle();

          if (!templateError && templateStep && isRecord(templateStep)) {
            recipeStep = templateStep;
          }
        }

        if (
          recipeStep && isRecord(recipeStep) &&
          typeof recipeStep.granularity_strategy === 'string' &&
          recipeStep.granularity_strategy === 'per_model'
        ) {
          // consolidation: allowed
        } else {
          const err: Error = new Error('source_group is required for document outputs');
          const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
          return out;
        }
      } else {
        const err: Error = new Error('source_group is required for document outputs');
        const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
        return out;
      }
    } else {
      const err: Error = new Error('source_group is required for document outputs');
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }
  }
  const sourceGroupFragment: string | undefined = extractSourceGroupFragment(sourceGroup);

  if (isRecord(restOfCanonicalPathParams) && restOfCanonicalPathParams.sourceAnchorModelSlug) {
    deps.logger.info(
      '[executeModelCallAndSave] sourceAnchorModelSlug present in canonicalPathParams, will propagate to pathContext for antithesis pattern detection',
      {
        sourceAnchorModelSlug: restOfCanonicalPathParams.sourceAnchorModelSlug,
        stageSlug: restOfCanonicalPathParams.stageSlug,
        outputType: output_type,
      },
    );
  }

  const documentKeyUnknown: unknown = isRecord(jobPayloadUnknown)
    ? jobPayloadUnknown.document_key
    : undefined;
  if (typeof documentKeyUnknown !== 'string' || documentKeyUnknown.trim() === '') {
    const err: Error = new Error('document_key is required');
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }
  const documentKey: string = documentKeyUnknown;

  const payloadProjectIdStr: string = isRecord(jobPayloadUnknown) &&
      typeof jobPayloadUnknown.projectId === 'string'
    ? jobPayloadUnknown.projectId
    : params.projectId;

  const sourcePromptResourceId: string = params.sourcePromptResourceId;

  const wallet: TokenWallet | null = await deps.userTokenWalletService.getWallet(walletId);
  if (wallet === null) {
    const err: Error = new Error(`Wallet not found for id ${walletId}`);
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }

  const relatedEntityId: string = job.id;
  const nowIso: string = new Date().toISOString();
  let assistantTokenUsageJson: Json | null = null;
  if (effectiveTokenUsage !== null) {
    const usageSerialized: string = JSON.stringify(effectiveTokenUsage);
    const usageParsed: unknown = JSON.parse(usageSerialized);
    if (isJson(usageParsed)) {
      assistantTokenUsageJson = usageParsed;
    }
  }
  const debitParams: DebitTokensParams = {
    wallet,
    tokenUsage: effectiveTokenUsage,
    modelConfig: extendedModelConfig,
    userId: projectOwnerUserId,
    chatId: undefined,
    relatedEntityId,
    databaseOperation: async () => {
      const userMessageId: string = crypto.randomUUID();
      const assistantMessageId: string = crypto.randomUUID();
      const userMessage: ChatMessageRow = {
        id: userMessageId,
        chat_id: null,
        user_id: projectOwnerUserId,
        role: 'user',
        content: '[dialectic_execute_job]',
        is_active_in_thread: true,
        ai_provider_id: providerRow.id,
        system_prompt_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        error_type: null,
        response_to_message_id: null,
        token_usage: null,
      };
      const assistantMessage: ChatMessageRow = {
        id: assistantMessageId,
        chat_id: null,
        role: 'assistant',
        content: contentForStorage,
        ai_provider_id: providerRow.id,
        system_prompt_id: null,
        token_usage: assistantTokenUsageJson,
        is_active_in_thread: true,
        error_type: null,
        response_to_message_id: userMessageId,
        created_at: nowIso,
        updated_at: nowIso,
        user_id: projectOwnerUserId,
      };
      return { userMessage, assistantMessage };
    },
  };
  const debitPayload: DebitTokensPayload = {};
  const debitResult = await deps.debitTokens(debitParams, debitPayload);
  if ('error' in debitResult) {
    const out: ExecuteModelCallAndSaveErrorReturn = {
      error: debitResult.error,
      retriable: debitResult.retriable,
    };
    return out;
  }

  const uploadContext: ModelContributionUploadContext = deps.buildUploadContext({
    projectId: payloadProjectIdStr,
    storageFileType,
    sessionId,
    iterationNumber,
    modelSlug: providerRow.api_identifier,
    attemptCount: job.attempt_count,
    restOfCanonicalPathParams,
    documentKey,
    contributionType,
    isContinuationForStorage,
    continuationCount: readOptionalContinuationCount(jobPayloadUnknown),
    sourceGroupFragment,
    contentForStorage,
    projectOwnerUserId,
    description,
    providerDetails: { id: providerRow.id, name: providerRow.name },
    aiResponse: {
      inputTokens: aiResponse.inputTokens,
      outputTokens: aiResponse.outputTokens,
      processingTimeMs: aiResponse.processingTimeMs,
    },
    sourcePromptResourceId,
    targetContributionId,
    documentRelationships: document_relationships,
    isIntermediate: isRecord(jobPayloadUnknown) && jobPayloadUnknown.isIntermediate === true,
  });

  deps.logger.info('[executeModelCallAndSave] Saving validated JSON to raw file', {
    jobId,
    documentKey: documentKey,
    fileType: storageFileType,
  });

  const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

  if (savedResult.error || !isDialecticContribution(savedResult.record)) {
    const msg: string = savedResult.error?.message || 'Invalid record returned.';
    const err: Error = new Error(`Failed to save contribution: ${msg}`);
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }

  const contribution = savedResult.record;

  const payloadRelationshipsUnknown: unknown = isRecord(jobPayloadUnknown)
    ? jobPayloadUnknown.document_relationships
    : undefined;
  if (isContinuationForStorage && isDocumentRelationships(payloadRelationshipsUnknown)) {
    const { error: relUpdateError } = await dbClient
      .from('dialectic_contributions')
      .update({ document_relationships: payloadRelationshipsUnknown })
      .eq('id', contribution.id);

    if (relUpdateError) {
      const err: RenderJobValidationError = new RenderJobValidationError(
        `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`,
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }

    const stageSlugEntry = Object.entries(payloadRelationshipsUnknown).find(([key]) =>
      key === stageSlug
    );
    if (
      !stageSlugEntry ||
      typeof stageSlugEntry[1] !== 'string' ||
      stageSlugEntry[1].trim() === ''
    ) {
      const err: Error = new Error(
        `document_relationships[${stageSlug}] is required and must be a non-empty string after persistence for continuation chunks`,
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }

    contribution.document_relationships = payloadRelationshipsUnknown;
  }

  if (!isContinuationForStorage) {
    const existing = contribution.document_relationships;
    const existingStageValue = isRecord(existing) ? existing[stageSlug] : undefined;

    const needsInit: boolean =
      !isRecord(existing) ||
      typeof existingStageValue !== 'string' ||
      existingStageValue.trim() === '' ||
      existingStageValue !== contribution.id;

    if (needsInit) {
      const merged: DocumentRelationships = {};

      if (isRecord(existing) && isDocumentRelationships(existing)) {
        for (const [key, value] of Object.entries(existing)) {
          if (typeof value === 'string') {
            if (isContributionType(key) || key === 'source_group') {
              if (isContributionType(key)) {
                merged[key] = value;
              } else if (key === 'source_group') {
                merged.source_group = value;
              }
            }
          }
        }
      }

      const payloadSourceGroup: unknown = isRecord(jobPayloadUnknown) &&
          isRecord(jobPayloadUnknown.document_relationships)
        ? jobPayloadUnknown.document_relationships.source_group
        : undefined;
      if (payloadSourceGroup === null) {
        merged.source_group = contribution.id;
      }

      if (!isContributionType(stageSlug)) {
        const err: RenderJobValidationError = new RenderJobValidationError(
          `Invalid stageSlug for document_relationships: ${stageSlug} is not a valid ContributionType. Contribution ID: ${contribution.id}`,
        );
        const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
        return out;
      }
      merged[stageSlug] = contribution.id;

      const { error: updateError } = await dbClient
        .from('dialectic_contributions')
        .update({ document_relationships: merged })
        .eq('id', contribution.id);

      if (updateError) {
        const err: RenderJobValidationError = new RenderJobValidationError(
          `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`,
        );
        const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
        return out;
      }

      const stageSlugEntryInit = Object.entries(merged).find(([key]) => key === stageSlug);
      if (
        !stageSlugEntryInit ||
        typeof stageSlugEntryInit[1] !== 'string' ||
        stageSlugEntryInit[1].trim() === '' ||
        stageSlugEntryInit[1] !== contribution.id
      ) {
        const err: RenderJobValidationError = new RenderJobValidationError(
          `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`,
        );
        const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
        return out;
      }

      contribution.document_relationships = merged;
    }
  }

  let stageRelationshipForStage: string | undefined = undefined;
  if (
    isRecord(contribution.document_relationships) &&
    isDocumentRelationships(contribution.document_relationships)
  ) {
    const found = Object.entries(contribution.document_relationships).find(([key]) => key === stageSlug);
    const relVal: unknown = found?.[1];
    if (typeof relVal === 'string' && relVal.trim() !== '') {
      stageRelationshipForStage = relVal;
    }
  }

  if (
    isDocumentRelated(fileType) &&
    (typeof stageRelationshipForStage !== 'string' || stageRelationshipForStage.trim() === '')
  ) {
    const err: RenderJobValidationError = new RenderJobValidationError(
      `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`,
    );
    const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
    return out;
  }

  const shouldRender: boolean = false;

  if (typeof sourcePromptResourceId === 'string' && sourcePromptResourceId.trim().length > 0) {
    const { error: promptLinkUpdateError } = await dbClient
      .from('dialectic_project_resources')
      .update({ source_contribution_id: contribution.id })
      .eq('id', sourcePromptResourceId);

    if (promptLinkUpdateError) {
      deps.logger.error(
        '[executeModelCallAndSave] Failed to update source_contribution_id for originating prompt resource.',
        {
          promptResourceId: sourcePromptResourceId,
          contributionId: contribution.id,
          error: promptLinkUpdateError,
        },
      );
    }
  }

  if (projectOwnerUserId && isContinuationForStorage && isDocumentRelated(fileType)) {
    const dk: unknown = isRecord(jobPayloadUnknown) ? jobPayloadUnknown.document_key : undefined;
    if (!dk || typeof dk !== 'string') {
      const err: Error = new Error(
        'document_key is required for execute_chunk_completed notification but is missing or invalid',
      );
      const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
      return out;
    }
    const stepKeyForChunk: string = dk;
    await deps.notificationService.sendJobNotificationEvent({
      type: 'execute_chunk_completed',
      sessionId: sessionId,
      stageSlug: stageSlug,
      iterationNumber: iterationNumber,
      job_id: jobId,
      step_key: stepKeyForChunk,
      modelId: model_id,
      document_key: dk,
    }, projectOwnerUserId);
  }

  const modelProcessingResult: ModelProcessingResult = {
    modelId: model_id,
    status: needsContinuation ? 'needs_continuation' : 'completed',
    attempts: currentAttempt + 1,
    contributionId: contribution.id,
  };

  if (needsContinuation) {
    deps.logger.info(
      `[executeModelCallAndSave] DIAGNOSTIC: Preparing to check for continuation for job ${job.id}.`,
      {
        finish_reason: aiResponse.finish_reason,
        payload_continuation_count: readOptionalContinuationCount(jobPayloadUnknown),
        continueUntilComplete: continueUntilCompleteFlag,
      },
    );

    const continueResult = await deps.continueJob(
      { logger: deps.logger },
      dbClient,
      job,
      aiResponse,
      contribution,
      projectOwnerUserId,
    );

    deps.logger.info(
      `[executeModelCallAndSave] DIAGNOSTIC: Result from continueJob for job ${job.id}:`,
      { continueResult },
    );

    if (continueResult.error) {
      deps.logger.error(
        `[dialectic-worker] [executeModelCallAndSave] Failed to enqueue continuation for job ${job.id}.`,
        { error: continueResult.error.message },
      );
    }
    if (
      !continueResult.error && continueResult.enqueued === false &&
      continueResult.reason === 'continuation_limit_reached'
    ) {
      deps.logger.warn(
        '[executeModelCallAndSave] Continuation limit reached for job — triggering final assembly with schema fill',
        { jobId: job.id },
      );
      modelProcessingResult.status = 'continuation_limit_reached';

      const capRelationships = contribution.document_relationships;
      let rootIdForCapAssembly: string | undefined = undefined;
      if (isRecord(capRelationships)) {
        const capCandidate: unknown = capRelationships[stageSlug];
        if (typeof capCandidate === 'string' && capCandidate.trim() !== '') {
          rootIdForCapAssembly = capCandidate;
        }
      }

      let matchedContextForCap: ContextForDocument | undefined = undefined;
      const capContextDocsUnknown: unknown = isRecord(jobPayloadUnknown)
        ? jobPayloadUnknown.context_for_documents
        : undefined;
      const payloadDocKeyCap: unknown = isRecord(jobPayloadUnknown)
        ? jobPayloadUnknown.document_key
        : undefined;
      if (Array.isArray(capContextDocsUnknown) && typeof payloadDocKeyCap === 'string') {
        for (let capIdx = 0; capIdx < capContextDocsUnknown.length; capIdx++) {
          const capDoc: unknown = capContextDocsUnknown[capIdx];
          if (isContextForDocument(capDoc) && capDoc.document_key === payloadDocKeyCap) {
            matchedContextForCap = capDoc;
            break;
          }
        }
      }

      if (
        rootIdForCapAssembly !== undefined && rootIdForCapAssembly !== contribution.id &&
        !shouldRender
      ) {
        await deps.fileManager.assembleAndSaveFinalDocument(
          rootIdForCapAssembly,
          matchedContextForCap,
        );
      }
    }
    if (projectOwnerUserId) {
      const continuationNumber: number = (readOptionalContinuationCount(jobPayloadUnknown) ?? 0) + 1;
      await deps.notificationService.sendContributionGenerationContinuedEvent({
        type: 'contribution_generation_continued',
        sessionId: sessionId,
        contribution: contribution,
        projectId: params.projectId,
        modelId: model_id,
        continuationNumber: continuationNumber,
        job_id: jobId,
      }, projectOwnerUserId);
    }
  }

  const isFinalChunk: boolean = resolvedFinish === 'stop';

  if (isFinalChunk) {
    if (projectOwnerUserId && isDocumentRelated(fileType)) {
      const dkFinal: unknown = isRecord(jobPayloadUnknown)
        ? jobPayloadUnknown.document_key
        : undefined;
      if (!dkFinal || typeof dkFinal !== 'string') {
        const err: Error = new Error(
          'document_key is required for execute_chunk_completed notification but is missing or invalid',
        );
        const out: ExecuteModelCallAndSaveErrorReturn = { error: err, retriable: false };
        return out;
      }
      const stepKeyForCompleted: string = dkFinal;
      await deps.notificationService.sendJobNotificationEvent({
        type: 'execute_chunk_completed',
        sessionId: sessionId,
        stageSlug: stageSlug,
        iterationNumber: iterationNumber,
        job_id: jobId,
        step_key: stepKeyForCompleted,
        modelId: model_id,
        document_key: dkFinal,
      }, projectOwnerUserId);
    }

    let rootIdFromSaved: string | undefined = undefined;
    const savedRelationships = contribution.document_relationships;
    if (isRecord(savedRelationships)) {
      const candidateUnknown: unknown = savedRelationships[stageSlug];
      if (typeof candidateUnknown === 'string' && candidateUnknown.trim() !== '') {
        rootIdFromSaved = candidateUnknown;
      }
    }
    if (rootIdFromSaved && rootIdFromSaved !== contribution.id && !shouldRender) {
      await deps.fileManager.assembleAndSaveFinalDocument(rootIdFromSaved);
    }
  }

  const { error: finalUpdateError } = await dbClient
    .from('dialectic_generation_jobs')
    .update({
      status: 'completed',
      results: JSON.stringify({ modelProcessingResult }),
      completed_at: new Date().toISOString(),
      attempt_count: currentAttempt + 1,
    })
    .eq('id', jobId);

  if (finalUpdateError) {
    deps.logger.error(
      `[dialectic-worker] [executeModelCallAndSave] CRITICAL: Failed to mark job as 'completed'.`,
      { finalUpdateError },
    );
  }

  if (!needsContinuation) {
    if (projectOwnerUserId) {
      await deps.notificationService.sendContributionReceivedEvent({
        contribution,
        type: 'dialectic_contribution_received',
        sessionId: sessionId,
        job_id: jobId,
        is_continuing: false,
      }, projectOwnerUserId);
      await deps.notificationService.sendContributionGenerationCompleteEvent({
        type: 'contribution_generation_complete',
        sessionId: sessionId,
        projectId: params.projectId,
        job_id: jobId,
      }, projectOwnerUserId);
    }
  }

  deps.logger.info(
    `[dialectic-worker] [executeModelCallAndSave] Job ${jobId} finished successfully. Results: ${JSON.stringify(modelProcessingResult)}. Final Status: completed`,
  );

  const documentKeyResult: string | undefined = documentKey;
  const success: ExecuteModelCallAndSaveSuccessReturn = {
    contribution,
    needsContinuation,
    stageRelationshipForStage,
    documentKey: documentKeyResult,
    fileType: output_type,
    storageFileType,
  };
  return success;
}
