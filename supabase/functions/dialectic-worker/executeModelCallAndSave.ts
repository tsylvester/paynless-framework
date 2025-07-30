
import {
  type UnifiedAIResponse,
  type ModelProcessingResult,
  type ExecuteModelCallAndSaveParams,
} from '../dialectic-service/dialectic.interface.ts';
import { type UploadContext } from '../_shared/types/file_manager.types.ts';
import { isDialecticContribution, isAiModelExtendedConfig, isDialecticExecuteJobPayload, isContributionType } from "../_shared/utils/type_guards.ts";
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';
import { type AiModelExtendedConfig, type MessageForTokenCounting } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';

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

    const messages: MessageForTokenCounting[] = [{ role: 'user', content: previousContent || renderedPrompt.content }];
    const finalTokenCount = countTokensForMessages(messages, extendedModelConfig);
    const maxTokens = extendedModelConfig.max_context_window_tokens || extendedModelConfig.context_window_tokens;

    if (maxTokens && finalTokenCount > maxTokens) {
        throw new ContextWindowError(`Final prompt token count (${finalTokenCount}) exceeds model limit (${maxTokens}) for job ${jobId}.`);
    }

    const options = {
        walletId: walletId,
    };

    const aiResponse: UnifiedAIResponse = await deps.callUnifiedAIModel(
        providerDetails.id, 
        previousContent || renderedPrompt.content, 
        sessionData.associated_chat_id, 
        authToken, 
        options
    );

    if (aiResponse.error || !aiResponse.content) {
        throw new Error(aiResponse.error || 'AI response was empty.');
    }

    const finalContent = previousContent + aiResponse.content;
    const uploadContext: UploadContext = {
        pathContext: {
            projectId, 
            fileType: 'model_contribution_main', 
            sessionId, 
            iteration: iterationNumber,
            stageSlug, 
            modelSlug: providerDetails.api_identifier,
            originalFileName: job.payload.originalFileName || `${providerDetails.api_identifier}_${stageSlug}${deps.getExtensionFromMimeType(aiResponse.contentType || "text/markdown")}`,
        },
        fileContent: finalContent, 
        mimeType: aiResponse.contentType || "text/markdown",
        sizeBytes: finalContent.length, 
        userId: projectOwnerUserId,
        description: `Contribution for stage '${stageSlug}' by model ${providerDetails.name}`,
        resourceTypeForDb: 'contribution', // <-- This is the fix
        contributionMetadata: {
            sessionId, 
            modelIdUsed: providerDetails.id, 
            modelNameDisplay: providerDetails.name,
            stageSlug, 
            iterationNumber, 
            contributionType: isContributionType(job.payload.output_type) ? job.payload.output_type : undefined,
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

    const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Received record from fileManager: ${JSON.stringify(savedResult.record, null, 2)}`);

    if (savedResult.error || !isDialecticContribution(savedResult.record)) {
        throw new Error(`Failed to save contribution: ${savedResult.error?.message || 'Invalid record returned.'}`);
    }

    const contribution = savedResult.record;
    
    const needsContinuation = job.payload.continueUntilComplete && (aiResponse.finish_reason === 'length');

    const modelProcessingResult: ModelProcessingResult = { 
        modelId: model_id, 
        status: needsContinuation ? 'needs_continuation' : 'completed', 
        attempts: currentAttempt + 1, 
        contributionId: contribution.id 
    };

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
    
    if (needsContinuation) {
        await deps.continueJob({ logger: deps.logger }, dbClient, job, aiResponse, contribution, projectOwnerUserId);
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
    } else {
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

