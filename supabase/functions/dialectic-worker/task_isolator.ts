import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    DialecticExecuteJobPayload,
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    SourceDocument,
    IDialecticJobDeps,
} from '../dialectic-service/dialectic.interface.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { Messages } from '../_shared/types.ts';
import { isDialecticExecuteJobPayload, isDialecticPlanJobPayload, isJson, isDocumentRelationships, isCanonicalPathParams } from '../_shared/utils/type_guards.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { Database } from '../types_db.ts';
import { createCanonicalPathParams } from './strategies/canonical_context_builder.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';

async function findSourceDocuments(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    inputsRequired: DialecticRecipeStep['inputs_required'],
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>,
): Promise<SourceDocument[]> {
    //logger.info(`[task_isolator] [findSourceDocuments] Finding documents for job ${parentJob.id} based on recipe...`, { inputsRequired });

    const allSourceDocuments: SourceDocument[] = [];

    for (const rule of inputsRequired) {
        let query = dbClient
            .from('dialectic_contributions')
            .select('*')
            .eq('session_id', parentJob.session_id)
            .eq('iteration_number', parentJob.iteration_number)
            .eq('is_latest_edit', true);

        if (rule.stage_slug) {
          query = query.eq('stage', rule.stage_slug);
        } else {
          query = query.eq('contribution_type', rule.type);
        }

        const { data: sourceContributions, error: contribError } = await query;

        if (contribError) {
            throw new Error(`Failed to fetch source contributions for type '${rule.type}': ${contribError.message}`);
        }

        if (!sourceContributions || sourceContributions.length === 0) {
            //logger.warn(`[task_isolator] [findSourceDocuments] No contributions found for type '${rule.type}'.`);
            continue;
        }

        //logger.info(`[task_isolator] [findSourceDocuments] Found ${sourceContributions.length} contributions for type '${rule.type}'.`);

        const documents = await Promise.all(
            sourceContributions.map(async (contrib) => {
                if (!contrib.file_name || !contrib.storage_bucket || !contrib.storage_path) {
                    //logger.warn(`Contribution ${contrib.id} is missing required storage information (file_name, storage_bucket, or storage_path) and will be skipped.`);
                    return null;
                }
                const fullPath = `${contrib.storage_path}/${contrib.file_name}`;
                const { data, error } = await downloadFromStorage(contrib.storage_bucket, fullPath);
                if (error) {
                    throw new Error(`Failed to download content for contribution ${contrib.id} from ${fullPath}: ${error.message}`);
                }
                
                // Destructure to correctly omit the old `document_relationships` and create a valid SourceDocument
                const { document_relationships, ...rest } = contrib;
                const docRels = document_relationships && isDocumentRelationships(document_relationships)
                    ? document_relationships
                    : null;

                const deconstructedPath = deconstructStoragePath({
                    storageDir: contrib.storage_path,
                    fileName: contrib.file_name,
                });

                const sourceDoc: SourceDocument = {
                    ...rest,
                    content: new TextDecoder().decode(data!),
                    document_relationships: docRels,
                    attempt_count: deconstructedPath.attemptCount,
                };
                return sourceDoc;
            })
        );
        
        const validDocuments = documents.filter((doc): doc is SourceDocument => doc !== null);
        allSourceDocuments.push(...validDocuments);
    }
    
    //logger.info(`[task_isolator] [findSourceDocuments] Total valid source documents found: ${allSourceDocuments.length}`);
    return allSourceDocuments;
}

export async function planComplexStage(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    deps: IDialecticJobDeps,
    recipeStep: DialecticRecipeStep,
    authToken: string,
): Promise<DialecticJobRow[]> {
    //deps.logger.info(`[task_isolator] [planComplexStage] Planning step "${recipeStep.name}" for parent job ID: ${parentJob.id}`);
    
    // 1. Fetch source documents required for this specific step.
    const sourceDocuments = await findSourceDocuments(
        dbClient, 
        parentJob, 
        recipeStep.inputs_required,
        deps.downloadFromStorage,
    );
    
    if (sourceDocuments.length === 0) {
        //deps.logger.info(`[task_isolator] [planComplexStage] No source documents found for step "${recipeStep.name}". Skipping planning.`);
        return [];
    }

    // 2. Perform token estimation and check against the model's limit.
    const modelConfig = await deps.getAiProviderConfig!(dbClient, parentJob.payload.model_id);
    const maxTokens = modelConfig.provider_max_input_tokens;

    if (!maxTokens) {
        throw new Error(`Model ${parentJob.payload.model_id} does not have provider_max_input_tokens configured.`);
    }

    const messages: Messages[] = sourceDocuments.map(doc => ({ role: 'user', content: doc.content }));
    const estimatedTokens = deps.countTokens!(messages, modelConfig);

    let childJobPayloads: DialecticExecuteJobPayload[];

    if (estimatedTokens > maxTokens) {
        //deps.logger.info(`[task_isolator] Context for job ${parentJob.id} exceeds token limit (${estimatedTokens} > ${maxTokens}). Invoking RAG service.`);
        
        const ragResult = await deps.ragService!.getContextForModel(
            sourceDocuments.map(doc => ({ id: doc.id, content: doc.content })),
            modelConfig,
            parentJob.session_id,
            parentJob.stage_slug || ''
        );

        if (ragResult.error || !ragResult.context) {
            throw new ContextWindowError(`RAG service failed to compress context for job ${parentJob.id}: ${ragResult.error?.message || 'No context returned'}`);
        }

        const anchorDoc = sourceDocuments.find(doc => doc.contribution_type === 'thesis');
        if (!anchorDoc) {
            throw new Error('RAG workflow requires an anchor document (thesis) to proceed.');
        }

        const canonicalPathParams = createCanonicalPathParams(
            sourceDocuments,
            FileType.RagContextSummary,
            anchorDoc
        );

        // Persist the RAG context as a new temporary resource
        const { record: ragResource, error: fileError } = await deps.fileManager.uploadAndRegisterFile({
            pathContext: {
                projectId: parentJob.payload.projectId,
                sessionId: parentJob.session_id,
                iteration: parentJob.payload.iterationNumber,
                stageSlug: parentJob.payload.stageSlug,
                fileType: FileType.RagContextSummary,
                modelSlug: modelConfig.api_identifier,
                ...canonicalPathParams
            },
            fileContent: ragResult.context,
            mimeType: 'text/plain',
            sizeBytes: new TextEncoder().encode(ragResult.context).length,
            userId: parentJob.user_id,
            description: `RAG-generated context for step ${recipeStep.step} of job ${parentJob.id}`,
            resourceTypeForDb: FileType.RagContextSummary,
        });

        if (fileError || !ragResource) {
            throw new Error(`Failed to save RAG context to storage: ${fileError?.message}`);
        }

        if (!isDialecticPlanJobPayload(parentJob.payload)) {
            // This should be an unreachable state, but it satisfies the compiler.
            throw new Error('Invalid parent job payload for RAG planning.');
        }

        // Create a single child job using the RAG-generated context.
        const executeCanonicalPathParams = createCanonicalPathParams(
            sourceDocuments,
            recipeStep.output_type,
            anchorDoc
        );

        // Remove undefined properties to make it JSON-safe for the payload
        const cleanedParams = Object.fromEntries(
            Object.entries(executeCanonicalPathParams).filter(([, v]) => v !== undefined)
        );

        if (!isCanonicalPathParams(cleanedParams)) {
            throw new Error('Failed to construct valid CanonicalPathParams after cleaning.');
        }
        
        const newPayload: DialecticExecuteJobPayload = {
            job_type: 'execute',
            step_info: parentJob.payload.step_info,
            model_id: parentJob.payload.model_id,
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug,
            iterationNumber: parentJob.payload.iterationNumber,
            walletId: parentJob.payload.walletId,
            continueUntilComplete: parentJob.payload.continueUntilComplete,
            maxRetries: parentJob.payload.maxRetries,
            continuation_count: parentJob.payload.continuation_count,
            prompt_template_name: recipeStep.prompt_template_name,
            output_type: recipeStep.output_type,
            inputs: {
                rag_summary_id: ragResource.id,
            },
            canonicalPathParams: cleanedParams,
            user_jwt: authToken,
        };
        childJobPayloads = [newPayload];

    } else {
        // 3. If tokens are within limits, proceed with normal planning.
        const planner = deps.getGranularityPlanner!(recipeStep.granularity_strategy);
        if (!planner) {
            throw new Error(`No planner found for granularity strategy: ${recipeStep.granularity_strategy}`);
        }
        
        const plannedPayloads = planner(sourceDocuments, parentJob, recipeStep, authToken);
        if (!Array.isArray(plannedPayloads)) {
            throw new Error(`Planner for strategy '${recipeStep.granularity_strategy}' returned a non-array value.`);
        }
        childJobPayloads = plannedPayloads;
        
        //deps.logger.info(`[task_isolator] [planComplexStage] Planner returned ${childJobPayloads.length} payloads. Content: ${JSON.stringify(childJobPayloads, null, 2)}`);
    }

    // 4. Map to full job rows for DB insertion.
    const childJobsToInsert: DialecticJobRow[] = [];
    for (const payload of childJobPayloads) {
        if (isDialecticExecuteJobPayload(payload) && isJson(payload)) {
            // Correct, type-safe approach: Assign the validated payload to a new
            // strongly-typed variable. This allows the spread operator to work
            // without unsafe casting, adhering to project standards.
            const validatedPayload: DialecticExecuteJobPayload = payload;

            const payloadWithAuth: DialecticExecuteJobPayload = {
                ...validatedPayload,
                user_jwt: authToken,
            };

            if (!isJson(payloadWithAuth)) {
                // This should be an unreachable state if DialecticExecuteJobPayload is properly defined.
                throw new Error('FATAL: Constructed child job payload is not a valid JSON object.');
            }

            childJobsToInsert.push({
                id: crypto.randomUUID(),
                parent_job_id: parentJob.id,
                session_id: parentJob.session_id,
                user_id: parentJob.user_id,
                stage_slug: parentJob.stage_slug,
                iteration_number: parentJob.iteration_number,
                status: 'pending',
                max_retries: parentJob.max_retries,
                attempt_count: 0,
                created_at: new Date().toISOString(),
                started_at: null,
                completed_at: null,
                results: null,
                error_details: null,
                target_contribution_id: null,
                prerequisite_job_id: null,
                payload: payloadWithAuth,
            });
        }
    }

    //deps.logger.info(`[task_isolator] [planComplexStage] Planned ${childJobsToInsert.length} child jobs for step "${recipeStep.name}".`);
    return childJobsToInsert;
}


