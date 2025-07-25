
import {
  type UnifiedAIResponse,
  type ModelProcessingResult,
  type ExecuteModelCallAndSaveParams,
} from '../dialectic-service/dialectic.interface.ts';
import { type UploadContext } from '../_shared/types/file_manager.types.ts';
import { isDialecticContribution } from "../_shared/utils/type_guards.ts";

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

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Executing model call for job ID: ${jobId}`);

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
            originalFileName: `${providerDetails.api_identifier}_${stageSlug}${deps.getExtensionFromMimeType(aiResponse.contentType || "text/markdown")}`,
        },
        fileContent: finalContent, 
        mimeType: aiResponse.contentType || "text/markdown",
        sizeBytes: finalContent.length, 
        userId: projectOwnerUserId,
        description: `Contribution for stage '${stageSlug}' by model ${providerDetails.name}`,
        contributionMetadata: {
            sessionId, 
            modelIdUsed: providerDetails.id, 
            modelNameDisplay: providerDetails.name,
            stageSlug, 
            iterationNumber, 
            rawJsonResponseContent: JSON.stringify(aiResponse.rawProviderResponse || {}),
            tokensUsedInput: aiResponse.inputTokens, 
            tokensUsedOutput: aiResponse.outputTokens,
            processingTimeMs: aiResponse.processingTimeMs, 
            seedPromptStoragePath: renderedPrompt.fullPath,
            target_contribution_id: job.payload.target_contribution_id,
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

