// Placeholder for the task_isolator.ts service module.
// The implementation will be built out in subsequent steps.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database, Json } from '../types_db.ts';
import {
    GenerateContributionsDeps,
    DialecticJobPayload,
    DialecticContributionRow,
    DialecticJobRow
} from '../dialectic-service/dialectic.interface.ts';
import { getSourceStage } from '../_shared/utils/dialectic_utils.ts';
import { calculateTotalSteps } from '../_shared/utils/progress_calculator.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { getSeedPromptForStage } from '../_shared/utils/dialectic_utils.ts';
import { hasProcessingStrategy, isDialecticContribution, isProjectContext, isStageContext } from '../_shared/utils/type_guards.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { ILogger } from '../_shared/types.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';

export interface IIsolatedExecutionDeps extends GenerateContributionsDeps {
    getSourceStage: typeof getSourceStage;
    calculateTotalSteps: typeof calculateTotalSteps;
    getSeedPromptForStage: typeof getSeedPromptForStage;
    notificationService: NotificationService;
}

export async function planComplexStage(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticJobPayload },
    projectOwnerUserId: string,
    logger: ILogger,
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>,
    promptAssembler: PromptAssembler
): Promise<DialecticJobRow[]> {
    logger.info(`[task_isolator] [planComplexStage] Starting for parent job ID: ${parentJob.id}`);
    const { sessionId, iterationNumber = 1, stageSlug, projectId } = parentJob.payload;

    if (!stageSlug || !projectId) {
        throw new Error("stageSlug and projectId are required for task planning.");
    }

    // 1. Fetch stage, project, and session details
    const { data: stageData, error: stageError } = await dbClient
        .from('dialectic_stages')
        .select(`
            *,
            system_prompts (*),
            domain_specific_prompt_overlays (*)
        `)
        .eq('slug', stageSlug)
        .single();

    if (stageError || !stageData || !isStageContext(stageData)) {
        throw new Error(`Failed to fetch valid stage details for slug: ${stageSlug}: ${stageError?.message}`);
    }
    const stage = stageData;

    const { data: projectData, error: projectError } = await dbClient
        .from('dialectic_projects')
        .select(`
            *,
            dialectic_domains (*)
        `)
        .eq('id', projectId)
        .single();

    if (projectError || !projectData || !isProjectContext(projectData)) {
        throw new Error(`Failed to fetch valid project details for ID: ${projectId}: ${projectError?.message}`);
    }
    const project = projectData;

    const { data: sessionData, error: sessionError } = await dbClient
        .from('dialectic_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (sessionError || !sessionData) {
        throw new Error(`Failed to fetch session details for ID: ${sessionId}: ${sessionError?.message}`);
    }
    
    // 2. Fetch source stage slug dynamically
    const { data: transitionData, error: transitionError } = await dbClient
        .from('dialectic_stage_transitions')
        .select('*, source_stage:dialectic_stages!source_stage_id(slug)')
        .eq('target_stage_id', stage.id)
        .single();

    if (transitionError || !transitionData || !transitionData.source_stage) {
        throw new Error(`Failed to find a source stage transition for target stage ID ${stage.id}: ${transitionError?.message}`);
    }
    const sourceStageSlug = transitionData.source_stage.slug;


    // 3. Fetch source contributions using the dynamic slug
    const { data: sourceContributions, error: contribError } = await dbClient
        .from('dialectic_contributions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('iteration_number', iterationNumber)
        .eq('stage', sourceStageSlug)
        .eq('is_latest_edit', true);

    if (contribError) {
        throw new Error(`Failed to fetch source contributions: ${contribError.message}`);
    }

    const sourceDocuments = await Promise.all(
        sourceContributions.map(async (contrib) => {
            if (!contrib.file_name) {
                // This case is unlikely given our data model, but it's good practice to handle it.
                logger.warn(`Contribution ${contrib.id} is missing a file_name and will be skipped.`);
                return null;
            }
            const fullPath = `${contrib.storage_path}/${contrib.file_name}`;
            const { data, error } = await downloadFromStorage(contrib.storage_bucket, fullPath);
            if (error) throw new Error(`Failed to download content for contribution ${contrib.id} from ${fullPath}: ${error.message}`);
            return {
                ...contrib,
                content: new TextDecoder().decode(data!),
            };
        })
    );

    // Filter out any null values from skipped contributions
    const validSourceDocuments = sourceDocuments.filter((doc): doc is NonNullable<typeof doc> => doc !== null);


    // 4. Fetch selected models
    const { data: models, error: modelsError } = await dbClient
        .from('ai_providers')
        .select('*')
        .eq('id', parentJob.payload.model_id);

    if (modelsError) throw new Error(`Failed to fetch models: ${modelsError.message}`);
    if (!models || models.length === 0) throw new Error('No models found for selected IDs.');

    // 5. Generate child jobs
    const childJobs: DialecticJobRow[] = [];
    let jobCounter = 0;

    for (const doc of validSourceDocuments) {
        for (const model of models) {
            const context = await promptAssembler.gatherContext(
                project,
                sessionData,
                stage,
                project.initial_user_prompt,
                iterationNumber,
                [{ ...doc, content: doc.content }] // Override with the specific document
            );

            const prompt = promptAssembler.render(stage, context, project.user_domain_overlay_values);

            const childPayload: DialecticJobPayload = {
                sessionId: parentJob.payload.sessionId,
                projectId: parentJob.payload.projectId,
                stageSlug: parentJob.payload.stageSlug,
                iterationNumber: parentJob.payload.iterationNumber,
                chatId: parentJob.payload.chatId,
                walletId: parentJob.payload.walletId,
                continueUntilComplete: parentJob.payload.continueUntilComplete,
                maxRetries: parentJob.payload.maxRetries,
                continuation_count: parentJob.payload.continuation_count,
                model_id: model.id, // Isolate to a single model
                target_contribution_id: doc.id // Track the source contribution
            };

            const jobPayload: Json = { ...childPayload, prompt };

            childJobs.push({
                id: `child-job-${parentJob.id}-${jobCounter++}`,
                parent_job_id: parentJob.id,
                session_id: sessionId,
                user_id: projectOwnerUserId,
                stage_slug: stageSlug,
                iteration_number: iterationNumber,
                payload: jobPayload,
                status: 'pending',
                max_retries: parentJob.max_retries,
                attempt_count: 0,
                created_at: new Date().toISOString(),
                started_at: null,
                completed_at: null,
                results: null,
                error_details: null,
                target_contribution_id: null,
            });
        }
    }
    
    logger.info(`[task_isolator] [planComplexStage] Planned ${childJobs.length} child jobs for parent job ID: ${parentJob.id}`);
    return childJobs;
}


export async function executeIsolatedTask(
    dbClient: SupabaseClient<Database>,
    job: DialecticJobRow,
    payload: DialecticJobPayload,
    projectOwnerUserId: string,
    deps: IIsolatedExecutionDeps,
    authToken: string,
) {
    deps.logger.info(`[task_isolator] [executeIsolatedStage] Starting for job ID: ${job.id}`);
    const { sessionId, iterationNumber = 1, stageSlug } = payload;

    if (!stageSlug) {
        throw new Error("stageSlug is required for task isolation.");
    }

    // 1. Fetch stage details to get the processing strategy
    const { data: stageData, error: stageError } = await dbClient
        .from('dialectic_stages')
        .select('*')
        .eq('slug', stageSlug)
        .single();

    if (stageError || !stageData) {
        throw new Error(`Failed to fetch stage details for slug: ${stageSlug}`);
    }
    
    const stage = stageData;
    // Use type guard to safely access processing_strategy
    if (!hasProcessingStrategy(stage)) {
        throw new Error(`No valid processing_strategy found for stage ${stageSlug}`);
    }
    // After this check, 'stage' is of type StageWithProcessingStrategy
    const processingStrategy = stage.input_artifact_rules.processing_strategy;

    // 2. Fetch source contributions
    const sourceStage = await deps.getSourceStage(dbClient, sessionId, stage.id);
    if (!sourceStage) {
      throw new Error(`Could not determine source stage for ${stage.slug}`);
    }

    const { data: sourceContributions, error: contribError } = await dbClient
        .from('dialectic_contributions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('iteration_number', iterationNumber)
        .eq('stage', sourceStage.slug)
        .eq('is_latest_edit', true);

    if (contribError) {
        throw new Error(`Failed to fetch source contributions for session ${sessionId}: ${contribError.message}`);
    }
    
    deps.logger.info(`[task_isolator] [executeIsolatedStage] Found ${sourceContributions.length} source contributions to process.`);

    // 3. Download content for each source contribution
    const sourceDocuments = await Promise.all(
        sourceContributions.map(async (contrib: DialecticContributionRow) => {
            const { data, error } = await deps.downloadFromStorage(contrib.storage_bucket, `${contrib.storage_path}/${contrib.file_name}`);
            if (error) {
                throw new Error(`Failed to download content for contribution ${contrib.id}: ${error.message}`);
            }
            if (!data) {
                throw new Error(`No content found for contribution ${contrib.id}`);
            }
            return {
                ...contrib,
                content: new TextDecoder().decode(data),
            };
        })
    );
    
    deps.logger.info(`[task_isolator] [executeIsolatedStage] Fetched ${sourceDocuments.length} source documents.`);
    
    // Get the pre-assembled seed prompt which already contains feedback and other context.
    const { content: seedPromptContent, fullPath: seedPromptStoragePath } = await deps.getSeedPromptForStage(
        dbClient,
        payload.projectId,
        sessionId,
        stageSlug,
        iterationNumber,
        deps.downloadFromStorage
    );

    // 5. Implement n*m call logic
    const { data: models, error: modelsError } = await dbClient
        .from('ai_providers')
        .select('*')
        .eq('id', payload.model_id);
    
    if (modelsError) {
        throw new Error(`Failed to fetch selected models: ${modelsError.message}`);
    }

    if (!models || models.length === 0) {
        throw new Error('No models found for the selected IDs.');
    }

    const totalSteps = deps.calculateTotalSteps(processingStrategy, models, sourceDocuments);
    let currentStep = 0;

    await deps.notificationService.sendDialecticProgressUpdateEvent({
        type: 'dialectic_progress_update',
        sessionId: sessionId,
        stageSlug: stageSlug,
        current_step: currentStep,
        total_steps: totalSteps,
        message: `Starting ${stage.display_name} stage...`,
        job_id: job.id,
    }, projectOwnerUserId);

    const modelPromises = models.flatMap(model =>
        sourceDocuments.map(async (doc) => {
            // Correctly construct the prompt using the pre-assembled seed and appending the specific source doc.
            const prompt = `
                ${seedPromptContent}

                ---
                **Source Document to process (ID: ${doc.id})**
                ${doc.content}
            `;

            const result = await deps.callUnifiedAIModel(
                model.api_identifier,
                prompt,
                payload.chatId,
                authToken,
                undefined, // options
                false, // continueUntilComplete
            );

            currentStep++;
            await deps.notificationService.sendDialecticProgressUpdateEvent({
                type: 'dialectic_progress_update',
                sessionId: sessionId,
                stageSlug: stageSlug,
                current_step: currentStep,
                total_steps: totalSteps,
                message: processingStrategy.progress_reporting.message_template
                    .replace('{current_item}', currentStep.toString())
                    .replace('{total_items}', totalSteps.toString())
                    .replace('{model_name}', model.name),
                job_id: job.id,
            }, projectOwnerUserId);

            return result;
        })
    );

    const results = await Promise.allSettled(modelPromises);

    deps.logger.info('[task_isolator] [executeIsolatedStage] All model calls completed.', {
        totalCalls: modelPromises.length,
        successful: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
    });
    
    // 6. Process and save results
    const savedContributions: DialecticContributionRow[] = [];
    const processingErrors: { modelName: string, docId: string, error: string }[] = [];
    
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const model = models[Math.floor(i / sourceDocuments.length)];
        const doc = sourceDocuments[i % sourceDocuments.length];

        if (result.status === 'fulfilled' && result.value.content) {
            const fileType: FileType = 'model_contribution_main';
            const uploadContext = {
                pathContext: {
                    projectId: payload.projectId,
                    fileType: fileType,
                    sessionId: sessionId,
                    iteration: iterationNumber,
                    stageSlug: stageSlug,
                    modelSlug: model.api_identifier,
                    originalFileName: `${model.api_identifier}_${stageSlug}_${doc.id}${deps.getExtensionFromMimeType(result.value.contentType || 'text/markdown')}`,
                },
                fileContent: result.value.content,
                mimeType: result.value.contentType || 'text/markdown',
                sizeBytes: result.value.content.length,
                userId: projectOwnerUserId,
                description: `Contribution for stage '${stageSlug}' by model ${model.name} targeting ${doc.id}`,
                contributionMetadata: {
                    sessionId: sessionId,
                    modelIdUsed: model.id,
                    modelNameDisplay: model.name,
                    stageSlug: stageSlug,
                    iterationNumber: iterationNumber,
                    target_contribution_id: doc.id,
                    rawJsonResponseContent: JSON.stringify(result.value.rawProviderResponse || {}),
                    seedPromptStoragePath: seedPromptStoragePath,
                    tokensUsedInput: result.value.inputTokens,
                    tokensUsedOutput: result.value.outputTokens,
                    processingTimeMs: result.value.processingTimeMs,
                },
            };

            const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);
            if (savedResult.error) {
                processingErrors.push({ modelName: model.name, docId: doc.id, error: savedResult.error.message });
            } else if (savedResult.record) {
                if (isDialecticContribution(savedResult.record)) {
                    // Use the type guard to ensure the record is a valid contribution before pushing.
                    savedContributions.push(savedResult.record);
                } else {
                    // This case should ideally not be reached if the fileManager correctly returns
                    // a contribution record for 'model_contribution_main' type. We log it as a warning.
                    const errorMessage = `[task_isolator] Saved record (ID: ${savedResult.record.id}) is not a valid DialecticContribution. This may indicate an issue with file registration.`;
                    deps.logger.warn(errorMessage);
                    // Also add it to the processing errors so the calling context is aware.
                    processingErrors.push({ modelName: model.name, docId: doc.id, error: errorMessage });
                }
            }
        } else {
            const errorReason = result.status === 'rejected' ? result.reason : (result.value?.error || 'No content returned');
            processingErrors.push({ modelName: model.name, docId: doc.id, error: errorReason });
        }
    }

    deps.logger.info('[task_isolator] [executeIsolatedStage] Finished processing all results.', {
        saved: savedContributions.length,
        errors: processingErrors.length,
    });
    
    // Final notification will be handled by the main worker function
} 