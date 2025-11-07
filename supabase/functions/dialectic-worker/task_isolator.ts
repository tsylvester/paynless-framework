import { PostgrestError } from 'npm:@supabase/postgrest-js@1.19.4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    DialecticExecuteJobPayload,
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    SourceDocument,
    IDialecticJobDeps,
    DialecticContributionRow,
    DialecticProjectResourceRow,
    DialecticFeedbackRow,
} from '../dialectic-service/dialectic.interface.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { isDialecticExecuteJobPayload, isJson, isDocumentRelationships } from '../_shared/utils/type_guards.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';
import type { DialecticStageRecipeStep, DialecticRecipeTemplateStep } from '../dialectic-service/dialectic.interface.ts';
import { Database } from '../types_db.ts';

function isPlannableStep(step: DialecticRecipeStep): step is (DialecticStageRecipeStep | DialecticRecipeTemplateStep) {
    if ('is_skipped' in step && step.is_skipped) {
        return false;
    }
    return 'job_type' in step && (step.job_type === 'PLAN' || step.job_type === 'EXECUTE' || step.job_type === 'RENDER');
}

// Type guards to differentiate between the different source table row types.
function isContributionRow(record: unknown): record is DialecticContributionRow {
    return record != null && typeof record === 'object' && 'contribution_type' in record;
}

function isProjectResourceRow(record: unknown): record is DialecticProjectResourceRow {
    return record != null && typeof record === 'object' && 'resource_type' in record;
}

function isFeedbackRow(record: unknown): record is DialecticFeedbackRow {
    return record != null && typeof record === 'object' && 'feedback_type' in record;
}

// Mapper functions to transform each row type into a valid SourceDocument.
function mapContributionToSourceDocument(row: DialecticContributionRow, content: string): SourceDocument {
    const { document_relationships, ...rest } = row;
    const docRels = document_relationships && isDocumentRelationships(document_relationships) ? document_relationships : null;
    const deconstructedPath = deconstructStoragePath({ storageDir: row.storage_path!, fileName: row.file_name! });
    return { ...rest, content, document_relationships: docRels, attempt_count: deconstructedPath.attemptCount ?? 1 };
}

function mapResourceToSourceDocument(row: DialecticProjectResourceRow, content: string): SourceDocument {
    return {
        id: row.id,
        session_id: row.session_id ?? '',
        user_id: row.user_id,
        stage: row.stage_slug ?? '',
        iteration_number: row.iteration_number ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
        contribution_type: row.resource_type,
        file_name: row.file_name,
        storage_bucket: row.storage_bucket,
        storage_path: row.storage_path,
        size_bytes: row.size_bytes,
        mime_type: row.mime_type,
        content: content,
        model_id: null,
        model_name: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        error: null,
        citations: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: row.source_contribution_id,
    };
}

function mapFeedbackToSourceDocument(row: DialecticFeedbackRow, content: string): SourceDocument {
    return {
        id: row.id,
        session_id: row.session_id,
        user_id: row.user_id,
        stage: row.stage_slug,
        iteration_number: row.iteration_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
        contribution_type: 'feedback',
        file_name: row.file_name,
        storage_bucket: row.storage_bucket,
        storage_path: row.storage_path,
        size_bytes: row.size_bytes,
        mime_type: row.mime_type,
        content: content,
        model_id: null,
        model_name: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: row.target_contribution_id,
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        error: null,
        citations: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };
}

type SourceRecord = DialecticContributionRow | DialecticProjectResourceRow | DialecticFeedbackRow;

async function findSourceDocuments(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    inputsRequired: DialecticRecipeStep['inputs_required'],
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>,
): Promise<SourceDocument[]> {
    if (!inputsRequired) return [];

    const allSourceDocuments: SourceDocument[] = [];
    const seenKeys = new Set<string>();
    const { projectId, sessionId, iterationNumber } = parentJob.payload;

    for (const rule of inputsRequired) {
        let sourceRecords: SourceRecord[] | null = null;
        let error: PostgrestError | null = null;
        
        if (rule.type === 'feedback') {
            let query = dbClient.from('dialectic_feedback').select('*').eq('session_id', sessionId);
            if (rule.stage_slug) query = query.eq('stage_slug', rule.stage_slug);
            const result = await query;
            sourceRecords = result.data;
            error = result.error;

        } else if (rule.type === 'document') {
            // Prefer canonical documents from project resources
            let resourceQuery = dbClient.from('dialectic_project_resources').select('*').eq('project_id', projectId);
            if (rule.document_key && rule.document_key !== '*') {
                resourceQuery = resourceQuery.eq('id', rule.document_key);
            }
            if (rule.stage_slug) {
                resourceQuery = resourceQuery.eq('stage_slug', rule.stage_slug);
            }
            const { data: resourceData, error: resourceError } = await resourceQuery;
            if (resourceError) {
                throw new Error(`Failed to fetch source documents for type '${rule.type}' from project_resources: ${resourceError.message}`);
            }

            if (resourceData && resourceData.length > 0) {
                sourceRecords = resourceData;
                error = null;
            } else {
                // CoW DAG override: fallback to contributions when no resources found
                let contributionQuery = dbClient.from('dialectic_contributions').select('*')
                    .eq('session_id', sessionId)
                    .eq('iteration_number', iterationNumber ?? 0)
                    .eq('is_latest_edit', true);

                if (rule.document_key && rule.document_key !== '*') {
                    contributionQuery = contributionQuery.eq('id', rule.document_key);
                }
                if (rule.stage_slug) {
                    contributionQuery = contributionQuery.eq('stage', rule.stage_slug);
                }

                const { data: contributionData, error: contributionError } = await contributionQuery;
                if (contributionError) {
                    throw new Error(`Failed to fetch source documents for type '${rule.type}' from contributions: ${contributionError.message}`);
                }
                sourceRecords = contributionData ?? [];
                error = null;
            }
        } else { // Handle contribution types like 'thesis', 'header_context', etc.
            let query = dbClient.from('dialectic_contributions').select('*')
                .eq('session_id', sessionId)
                .eq('iteration_number', iterationNumber ?? 0)
                .eq('is_latest_edit', true);

            if (rule.stage_slug) {
                query = query.eq('stage', rule.stage_slug);
            } else if (rule.type) {
                query = query.eq('contribution_type', rule.type);
            }
            if (rule.document_key && rule.document_key !== '*') {
                query = query.eq('id', rule.document_key);
            }
            const result = await query;
            sourceRecords = result.data;
            error = result.error;
        }

        if (error) {
            throw new Error(`Failed to fetch source documents for type '${rule.type}': ${error.message}`);
        }
        if (!sourceRecords || sourceRecords.length === 0) {
            // Only throw if the rule is not optional, which we can assume for now.
            // A more robust implementation might check a `rule.optional` flag.
            throw new Error(`A required input of type '${rule.type}' was not found for the current job.`);
        }

        const documents = await Promise.all(
            sourceRecords.map(async (record: SourceRecord) => {
                if (!record.file_name || !record.storage_bucket || !record.storage_path) {
                    throw new Error(`Contribution ${record.id} is missing required storage information (file_name, storage_bucket, or storage_path).`);
                }
                const fullPath = `${record.storage_path}/${record.file_name}`;
                const { data, error } = await downloadFromStorage(record.storage_bucket, fullPath);
                if (error) {
                    throw new Error(`Failed to download content for contribution ${record.id} from ${fullPath}: ${error.message}`);
                }
                
                const content = new TextDecoder().decode(data!);
                
                if (isFeedbackRow(record)) {
                    return mapFeedbackToSourceDocument(record, content);
                } else if (isProjectResourceRow(record)) {
                    return mapResourceToSourceDocument(record, content);
                } else if (isContributionRow(record)) {
                    return mapContributionToSourceDocument(record, content);
                }
                return null;
            })
        );
        
        const validDocuments = documents.filter((doc): doc is SourceDocument => doc !== null);
        for (const doc of validDocuments) {
            const key = `${doc.storage_bucket}|${doc.storage_path}|${doc.file_name}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                allSourceDocuments.push(doc);
            }
        }
    }
    
    return allSourceDocuments;
}

export async function planComplexStage(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    deps: IDialecticJobDeps,
    recipeStep: DialecticRecipeStep,
    authToken: string,
): Promise<DialecticJobRow[]> {
    if (!isPlannableStep(recipeStep)) {
        throw new Error('planComplexStage cannot process this type of recipe step. This indicates an orchestration logic error.');
    }
    
    // Explicitly validate required recipe properties upfront to prevent downstream errors.
    if (!recipeStep.inputs_required || recipeStep.inputs_required.length === 0) {
        throw new Error('recipeStep.inputs_required is required and cannot be empty');
    }
    if (!recipeStep.granularity_strategy) {
        throw new Error('recipeStep.granularity_strategy is required');
    }

    // Validate that the recipe step is not using deprecated properties.
    if ('step' in recipeStep) {
        throw new Error('recipeStep.step is a deprecated property. Please use step_key or step_name.');
    }
    if (!recipeStep.prompt_template_id) {
        throw new Error('recipeStep.prompt_template_id is required');
    }

    //deps.logger.info(`[task_isolator] [planComplexStage] Planning step "${recipeStep.name}" for parent job ID: ${parentJob.id}`);
    
    // Enforce presence of user_jwt on the parent payload (no healing, no fallback)
    let parentJwt: string | undefined = undefined;
    {
        const desc = Object.getOwnPropertyDescriptor(parentJob.payload, 'user_jwt');
        const potential = desc ? desc.value : undefined;
        if (typeof potential === 'string' && potential.length > 0) {
            parentJwt = potential;
        }
    }
    if (!parentJwt) {
        throw new Error('parent payload.user_jwt is required');
    }

    // Validate stageSlug correctness: must exist on payload and match row if present
    const stageSlug = parentJob.payload.stageSlug;
    if (typeof stageSlug !== 'string') {
        throw new Error('parent payload.stageSlug is required');
    }
    if (typeof parentJob.stage_slug === 'string' && parentJob.stage_slug !== stageSlug) {
        throw new Error('parent row.stage_slug mismatch');
    }

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

    // 2. Unconditionally call the planner with all source documents.
    const planner = deps.getGranularityPlanner!(recipeStep.granularity_strategy);
    if (!planner) {
        throw new Error(`No planner found for granularity strategy: ${recipeStep.granularity_strategy}`);
    }
    
    const plannedPayloads = planner(sourceDocuments, parentJob, recipeStep, authToken);
    if (!Array.isArray(plannedPayloads)) {
        throw new Error(`Planner for strategy '${recipeStep.granularity_strategy}' returned a non-array value.`);
    }
    const childJobPayloads: DialecticExecuteJobPayload[] = plannedPayloads;
    
    //deps.logger.info(`[task_isolator] [planComplexStage] Planner returned ${childJobPayloads.length} payloads. Content: ${JSON.stringify(childJobPayloads, null, 2)}`);

    // 3. Map to full job rows for DB insertion.
    const childJobsToInsert: DialecticJobRow[] = [];
    for (const payload of childJobPayloads) {
        try {
            // 1. Enrichment Stage: Add the JWT first, then validate full shape
            const candidatePayload: DialecticExecuteJobPayload = {
                ...payload,
                user_jwt: parentJwt,
            };

            // 2. Shape Check on enriched payload
            if (!isDialecticExecuteJobPayload(candidatePayload)) {
                deps.logger.warn(`[task_isolator] Skipping malformed payload from planner due to invalid shape: ${JSON.stringify(payload)}`);
                continue;
            }

            // 3. Context Check: Ensure planner's payload matches the authoritative parent context.
            const parentPayload = parentJob.payload;
            const contextMismatches: string[] = [];
            if (candidatePayload.projectId !== parentPayload.projectId) contextMismatches.push('projectId');
            if (candidatePayload.sessionId !== parentPayload.sessionId) contextMismatches.push('sessionId');
            if (candidatePayload.stageSlug !== parentPayload.stageSlug) contextMismatches.push('stageSlug');
            if (candidatePayload.iterationNumber !== parentPayload.iterationNumber) contextMismatches.push('iterationNumber');
            if (candidatePayload.walletId !== parentPayload.walletId) contextMismatches.push('walletId');

            if (contextMismatches.length > 0) {
                deps.logger.warn(`[task_isolator] Skipping payload with mismatched context. Fields: ${contextMismatches.join(', ')}`, { parent: parentPayload, received: candidatePayload });
                continue;
            }

            if (!isJson(candidatePayload)) {
                // This should be an unreachable state if DialecticExecuteJobPayload is properly defined.
                throw new Error('FATAL: Constructed child job payload is not a valid JSON object.');
            }

            if (!parentJob.payload.stageSlug) {
                throw new Error('parent payload.stageSlug is required');
            }
            childJobsToInsert.push({
                id: crypto.randomUUID(),
                parent_job_id: parentJob.id,
                session_id: parentJob.session_id,
                user_id: parentJob.user_id,
                stage_slug: stageSlug,
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
                payload: candidatePayload,
                is_test_job: false,
                job_type: 'EXECUTE',
            });
        } catch (error) {
            deps.logger.warn(`[task_isolator] Error processing payload, skipping. Error: ${error instanceof Error ? error.message : String(error)}`, { payload: JSON.stringify(payload) });
            continue;
        }
    }

    //deps.logger.info(`[task_isolator] [planComplexStage] Planned ${childJobsToInsert.length} child jobs for step "${recipeStep.name}".`);
    return childJobsToInsert;
}



