import { isContinueReason } from '../_shared/utils/type_guards.ts';
import {
  type UnifiedAIResponse,
  type ModelProcessingResult,
  type ExecuteModelCallAndSaveParams,
} from '../dialectic-service/dialectic.interface.ts';
import { type UploadContext, FileType } from '../_shared/types/file_manager.types.ts';
import { isDialecticContribution, isAiModelExtendedConfig, isDialecticExecuteJobPayload, isContributionType, isFileType } from "../_shared/utils/type_guards.ts";
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';
import { type AiModelExtendedConfig, type MessageForTokenCounting } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { IRagSourceDocument } from '../_shared/services/rag_service.interface.ts';

export async function executeModelCallAndSave(
    params: ExecuteModelCallAndSaveParams,
) {
    const { 
        dbClient, 
        deps, 
        authToken, 
        job, 
        projectOwnerUserId, 
        providerDetails, 
        renderedPrompt, 
        previousContent, 
        sessionData 
    } = params;
    
    //console.log('[executeModelCallAndSave] Received job payload:', JSON.stringify(job.payload, null, 2));
    
    if (!isDialecticExecuteJobPayload(job.payload)) {
        throw new Error(`Job ${job.id} does not have a valid 'execute' payload.`);
    }
    
    const { 
        id: jobId, 
        attempt_count: currentAttempt, 
    } = job;
    
    const { 
        iterationNumber = 1, 
        stageSlug, 
        projectId, 
        model_id,
        sessionId,
        walletId,
        output_type,
    } = job.payload;

    if (!stageSlug) {
        throw new Error(`Job ${jobId} is missing required stageSlug in its payload.`);
    }

    const { data: fullProviderData, error: providerError } = await dbClient
        .from('ai_providers')
        .select('*')
        .eq('id', providerDetails.id)
        .single();
    
    if (providerError || !fullProviderData) {
        throw new Error(`Could not fetch full provider details for ID ${providerDetails.id}.`);
    }

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Executing model call for job ID: ${jobId}`);

    // Final Context Window Validation
    const modelConfig = fullProviderData.config;
    if (!isAiModelExtendedConfig(modelConfig)) {
        throw new Error(`Model ${fullProviderData.id} has invalid or missing configuration.`);
    }

    const extendedModelConfig: AiModelExtendedConfig = {
        model_id: fullProviderData.id,
        api_identifier: fullProviderData.api_identifier,
        input_token_cost_rate: modelConfig.input_token_cost_rate,
        output_token_cost_rate: modelConfig.output_token_cost_rate,
        tokenization_strategy: modelConfig.tokenization_strategy,
        context_window_tokens: modelConfig.context_window_tokens,
        max_context_window_tokens: modelConfig.max_context_window_tokens,
    };

    // First, do a token check. If this fails, we will attempt compression.
    // We use previousContent here because it's the most accurate representation of the prompt before final assembly.
    const messagesForTokenCounting: MessageForTokenCounting[] = (params.sourceDocuments && params.sourceDocuments.length > 0)
        ? params.sourceDocuments.map(doc => ({ role: 'user', content: doc.content || '' }))
        : [{ role: 'user', content: params.renderedPrompt.content }];

    let finalContent = params.renderedPrompt.content;

    const initialTokenCount = countTokensForMessages(messagesForTokenCounting, extendedModelConfig);
    const maxTokens = extendedModelConfig.max_context_window_tokens || extendedModelConfig.context_window_tokens;
    
    if (maxTokens && initialTokenCount > maxTokens) {
        deps.logger.warn(`[executeModelCallAndSave] Initial prompt token count (${initialTokenCount}) exceeds model limit (${maxTokens}) for job ${jobId}. Attempting compression.`);
        
        if (!deps.ragService) {
            throw new ContextWindowError(`Token count (${initialTokenCount}) exceeds model limit (${maxTokens}) and RAG service is not available.`);
        }
        
        // We need to gather the original source documents to pass to the RAG service.
        const sourceDocumentsForRag: IRagSourceDocument[] = params.sourceDocuments.map(doc => ({ id: doc.id, content: doc.content }));


        const ragResult = await deps.ragService.getContextForModel(sourceDocumentsForRag, extendedModelConfig, sessionId, stageSlug);

        if (ragResult.error || !ragResult.context) {
            throw new ContextWindowError(`Failed to compress prompt with RAG service: ${ragResult.error?.message || 'Unknown RAG error'}`);
        }
        
        finalContent = ragResult.context;
        
        const compressedTokenCount = countTokensForMessages([{ role: 'user', content: finalContent }], extendedModelConfig);
        if (maxTokens && compressedTokenCount > maxTokens) {
            throw new ContextWindowError(`Compressed prompt token count (${compressedTokenCount}) still exceeds model limit (${maxTokens}).`);
        }
        deps.logger.info(`[executeModelCallAndSave] Prompt successfully compressed. New token count: ${compressedTokenCount}`);
    }

    const options = {
        walletId: walletId,
    };

    const userAuthToken = 'user_jwt' in job.payload && job.payload.user_jwt ? job.payload.user_jwt : authToken;

    const startTime = Date.now();
    const aiResponse: UnifiedAIResponse = await deps.callUnifiedAIModel(
        providerDetails.id, 
        finalContent, 
        sessionData.associated_chat_id, 
        userAuthToken, 
        options
    );

    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] AI call completed for job ${job.id} in ${processingTimeMs}ms.`);

    // --- DIAGNOSTIC LOGGING START ---
    deps.logger.info(`[executeModelCallAndSave] DIAGNOSTIC: Full AI Response for job ${job.id}:`, { aiResponse });
    // --- DIAGNOSTIC LOGGING END ---

    if (!aiResponse) {
        throw new Error('No response from AI adapter');
    }

    if (aiResponse.error || !aiResponse.content) {
        throw new Error(aiResponse.error || 'AI response was empty.');
    }

    let contentForStorage: string;
    if (previousContent !== undefined && previousContent !== null) {
        contentForStorage = previousContent + aiResponse.content;
    } else {
        contentForStorage = aiResponse.content;
    }

    const fileType: FileType = isFileType(output_type) 
        ? output_type
        : FileType.ModelContributionMain;

    const description = fileType === FileType.ModelContributionMain
        ? `Contribution for stage '${stageSlug}' by model ${providerDetails.name}`
        : `Intermediate artifact '${output_type}' for stage '${stageSlug}' by model ${providerDetails.name}`;

    const {
        contributionType: rawContributionType,
        ...restOfCanonicalPathParams
    } = job.payload.canonicalPathParams;

    const contributionType = isContributionType(rawContributionType)
        ? rawContributionType
        : undefined;

    const uploadContext: UploadContext = {
        pathContext: {
            projectId,
            fileType,
            sessionId,
            iteration: iterationNumber,
            stageSlug,
            modelSlug: providerDetails.api_identifier,
            attemptCount: job.attempt_count,
            ...restOfCanonicalPathParams,
            contributionType,
        },
        fileContent: contentForStorage, 
        mimeType: aiResponse.contentType || "text/markdown",
        sizeBytes: contentForStorage.length, 
        userId: projectOwnerUserId,
        description,
        resourceTypeForDb: job.payload.output_type || stageSlug,
        contributionMetadata: {
            sessionId, 
            modelIdUsed: providerDetails.id, 
            modelNameDisplay: providerDetails.name,
            stageSlug, 
            iterationNumber, 
            contributionType: contributionType,
            rawJsonResponseContent: JSON.stringify(aiResponse.rawProviderResponse || {}),
            tokensUsedInput: aiResponse.inputTokens, 
            tokensUsedOutput: aiResponse.outputTokens,
            processingTimeMs: aiResponse.processingTimeMs, 
            seedPromptStoragePath: renderedPrompt.fullPath,
            target_contribution_id: job.payload.target_contribution_id,
            document_relationships: job.payload.document_relationships,
            isIntermediate: 'isIntermediate' in job.payload && job.payload.isIntermediate,
        },
    };

    //console.log('[executeModelCallAndSave] Calling fileManager.uploadAndRegisterFile with context:', JSON.stringify(uploadContext, null, 2));

    const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

    //deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Received record from fileManager: ${JSON.stringify(savedResult.record, null, 2)}`);

    if (savedResult.error || !isDialecticContribution(savedResult.record)) {
        throw new Error(`Failed to save contribution: ${savedResult.error?.message || 'Invalid record returned.'}`);
    }

    const contribution = savedResult.record;

    if (contribution.contribution_type === 'thesis' && !contribution.document_relationships) {
        const { error: updateError } = await dbClient
            .from('dialectic_contributions')
            .update({ document_relationships: { thesis: contribution.id } })
            .eq('id', contribution.id);

        if (updateError) {
            deps.logger.error(`[executeModelCallAndSave] CRITICAL: Failed to update document_relationships for thesis contribution ${contribution.id}.`, { updateError });
        } else {
            contribution.document_relationships = { thesis: contribution.id };
        }
    }
    
    const needsContinuation = job.payload.continueUntilComplete && aiResponse.finish_reason && isContinueReason(aiResponse.finish_reason);

    const modelProcessingResult: ModelProcessingResult = { 
        modelId: model_id, 
        status: needsContinuation ? 'needs_continuation' : 'completed', 
        attempts: currentAttempt + 1, 
        contributionId: contribution.id 
    };

    
    if (needsContinuation) {
        // --- DIAGNOSTIC LOGGING START ---
        deps.logger.info(`[executeModelCallAndSave] DIAGNOSTIC: Preparing to check for continuation for job ${job.id}.`, {
          finish_reason: aiResponse.finish_reason,
          payload_continuation_count: job.payload.continuation_count,
          continueUntilComplete: job.payload.continueUntilComplete
        });
        // --- DIAGNOSTIC LOGGING END ---

        const continueResult = await deps.continueJob({ logger: deps.logger }, dbClient, job, aiResponse, contribution, projectOwnerUserId);

        // --- DIAGNOSTIC LOGGING START ---
        deps.logger.info(`[executeModelCallAndSave] DIAGNOSTIC: Result from continueJob for job ${job.id}:`, { continueResult });
        // --- DIAGNOSTIC LOGGING END ---

        if (continueResult.error) {
          // Even if continuation fails, the original job succeeded. Log the error and continue.
          deps.logger.error(`[dialectic-worker] [executeModelCallAndSave] Failed to enqueue continuation for job ${job.id}.`, { error: continueResult.error.message });
        }
        if (projectOwnerUserId) {
            await deps.notificationService.sendContributionGenerationContinuedEvent({
                type: 'contribution_generation_continued',
                sessionId: sessionId,
                contribution: contribution,
                projectId: projectId,
                modelId: model_id,
                continuationNumber: job.payload.continuation_count ?? 1,
                job_id: jobId,
            }, projectOwnerUserId);
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
        deps.logger.error(`[dialectic-worker] [executeModelCallAndSave] CRITICAL: Failed to mark job as 'completed'.`, { finalUpdateError });
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
                projectId: projectId,
                job_id: jobId,
            }, projectOwnerUserId);
        }
    }

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Job ${jobId} finished successfully. Results: ${JSON.stringify(modelProcessingResult)}. Final Status: completed`);
}

