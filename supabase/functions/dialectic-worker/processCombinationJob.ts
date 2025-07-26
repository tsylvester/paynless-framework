import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { type Database, type Json } from '../types_db.ts';
import {
  type ProcessSimpleJobDeps,
  type Job,
  type FailedAttemptError,
  type ModelProcessingResult,
  type SelectedAiProvider,
  type DialecticCombinationJobPayload,
} from '../dialectic-service/dialectic.interface.ts';
import { isSelectedAiProvider } from '../_shared/utils/type_guards.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';

// Type guard to ensure the payload has the specific fields needed for a combination job.
function hasCombinationInputs(payload: DialecticCombinationJobPayload): payload is DialecticCombinationJobPayload & { inputs: { document_ids: string[] }, prompt_template_name: string } {
    return (
        isRecord(payload.inputs) &&
        Array.isArray(payload.inputs.document_ids) &&
        payload.inputs.document_ids.every((id: unknown): id is string => typeof id === 'string') &&
        typeof payload.prompt_template_name === 'string'
    );
}

export async function processCombinationJob(
    dbClient: SupabaseClient<Database>,
    job: Job & { payload: DialecticCombinationJobPayload },
    projectOwnerUserId: string,
    deps: ProcessSimpleJobDeps,
    authToken: string,
) {
    const { id: jobId, attempt_count: currentAttempt, max_retries } = job;
    const { model_id, sessionId } = job.payload;
    
    deps.logger.info(`[dialectic-worker] [processCombinationJob] Starting attempt ${currentAttempt + 1}/${max_retries + 1} for job ID: ${jobId}`);
    let providerDetails: SelectedAiProvider | undefined;

    try {
        // 1. Validate the payload shape for a combination job.
        if (!hasCombinationInputs(job.payload)) {
            throw new Error(`Job ${jobId} payload is missing required 'inputs.document_ids' or 'prompt_template_name'.`);
        }
        const { inputs: { document_ids }, prompt_template_name } = job.payload;

        // 2. Fetch standard session and provider details.
        const { data: sessionData, error: sessionError } = await dbClient.from('dialectic_sessions').select('*').eq('id', sessionId).single();
        if (sessionError || !sessionData) throw new Error(`Session ${sessionId} not found.`);

        const { data: providerData, error: providerError } = await dbClient.from('ai_providers').select('*').eq('id', model_id).single();
        if (providerError || !providerData || !isSelectedAiProvider(providerData)) {
            throw new Error(`Failed to fetch valid provider details for model ID ${model_id}.`);
        }
        providerDetails = providerData;
        
        // 3. Fetch the specific prompt template for this combination job.
        const { data: promptTemplate, error: promptError } = await dbClient.from('system_prompts').select('prompt_text').eq('name', prompt_template_name).single();
        if (promptError || !promptTemplate) throw new Error(`Could not find system prompt named '${prompt_template_name}'.`);

        // 4. Fetch the metadata for all documents to be combined.
        const { data: documents, error: docError } = await dbClient.from('dialectic_project_resources').select('storage_bucket, storage_path, file_name').in('id', document_ids);
        if (docError || !documents || documents.length !== document_ids.length) throw new Error(`Failed to fetch all document records for IDs: ${document_ids.join(', ')}.`);

        // 5. Download the content of each document.
        const downloadedContent = await Promise.all(
            documents.map(async (doc) => {
                const path = `${doc.storage_path}/${doc.file_name}`;
                const { data, error } = await deps.downloadFromStorage(doc.storage_bucket, path);
                if (error || !data) throw new Error(`Failed to download document content from ${path}.`);
                return new TextDecoder().decode(data);
            })
        );
        
        // 6. Format the combined content for the prompt.
        const combinedDocumentsText = downloadedContent.map((content, index) => 
            `---\nDOCUMENT ${index + 1}:\n${content}`
        ).join('\n') + '\n---';
        
        // 7. Render the final prompt.
        const renderedPromptContent = promptTemplate.prompt_text.replace('{{documents}}', combinedDocumentsText);
        
        // 8. Delegate to the executor.
        await deps.executeModelCallAndSave({
            dbClient,
            deps,
            authToken,
            job,
            projectOwnerUserId,
            providerDetails,
            renderedPrompt: { content: renderedPromptContent, fullPath: `system_prompt:${prompt_template_name}` },
            previousContent: '', // Combination jobs are never continuations.
            sessionData,
        });

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));

        if (e instanceof ContextWindowError) {
            deps.logger.error(`[dialectic-worker] [processCombinationJob] Context window error for job ${jobId}`, { error });
            // Fail the job immediately, don't retry
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                error_details: { message: `Context window error: ${error.message}` },
                completed_at: new Date().toISOString(),
            }).eq('id', jobId);
            return; // Exit without retry
        }

        const failedAttempt: FailedAttemptError = {
            modelId: model_id,
            api_identifier: providerDetails?.api_identifier || 'unknown',
            error: error.message,
        };
        deps.logger.warn(`[dialectic-worker] [processCombinationJob] Attempt ${currentAttempt + 1} failed for model ${model_id}: ${failedAttempt.error}`);
        
        if (currentAttempt < max_retries) {
            await deps.retryJob({ logger: deps.logger, notificationService: deps.notificationService }, dbClient, job, currentAttempt + 1, [failedAttempt], projectOwnerUserId);
            return;
        }

        deps.logger.error(`[dialectic-worker] [processCombinationJob] Final attempt failed for job ${jobId}. Exhausted all ${max_retries + 1} retries.`);
        const modelProcessingResult: ModelProcessingResult = { modelId: model_id, status: 'failed', attempts: currentAttempt + 1, error: failedAttempt.error };
        
        const { error: finalUpdateError } = await dbClient
            .from('dialectic_generation_jobs')
            .update({
                status: 'retry_loop_failed',
                error_details: JSON.stringify({ finalError: failedAttempt, modelProcessingResult }),
                completed_at: new Date().toISOString(),
                attempt_count: currentAttempt + 1,
            })
            .eq('id', jobId);
        
        if (finalUpdateError) {
            deps.logger.error(`[dialectic-worker] [processCombinationJob] CRITICAL: Failed to mark job as 'retry_loop_failed'.`, { finalUpdateError });
        }
        
        if (projectOwnerUserId && job.payload.sessionId) {
            await deps.notificationService.sendContributionFailedNotification({
                type: 'contribution_generation_failed',
                sessionId: job.payload.sessionId,
                stageSlug: job.payload.stageSlug ?? 'combination',
                projectId: job.payload.projectId ?? '',
                error: {
                    code: 'RETRY_LOOP_FAILED',
                    message: `Combination job '${jobId}' has failed after all retry attempts.`,
                },
                job_id: jobId,
            }, projectOwnerUserId);
        }
    }
}
