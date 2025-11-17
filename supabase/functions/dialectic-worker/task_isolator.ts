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

function hasDocumentKeyField(value: unknown): value is { document_key: unknown } {
    return typeof value === 'object' && value !== null && 'document_key' in value;
}

function getDocumentKeyFromResource(row: DialecticProjectResourceRow): string | null {
    const descriptor = row.resource_description;
    if (hasDocumentKeyField(descriptor)) {
        const maybeKey = descriptor.document_key;
        if (typeof maybeKey === 'string' && maybeKey.length > 0) {
            return maybeKey;
        }
    }
    return null;
}

function fileNameContainsDocumentKey(fileName: string | null | undefined, documentKey: string): boolean {
    if (!fileName) {
        return false;
    }
    return fileName.toLowerCase().includes(documentKey.toLowerCase());
}

function recordMatchesDocumentKey(record: SourceRecord, documentKey: string | undefined): boolean {
    if (!documentKey) {
        return true;
    }

    if (fileNameContainsDocumentKey(record.file_name ?? null, documentKey)) {
        return true;
    }

    if (isProjectResourceRow(record)) {
        const descriptorKey = getDocumentKeyFromResource(record);
        if (descriptorKey && descriptorKey.toLowerCase() === documentKey.toLowerCase()) {
            return true;
        }
    }

    if (isContributionRow(record)) {
        const contributionType = record.contribution_type;
        if (typeof contributionType === 'string' && contributionType.toLowerCase() === documentKey.toLowerCase()) {
            return true;
        }
    }

    return false;
}

function filterRecordsByDocumentKey<T extends SourceRecord>(records: T[], documentKey: string | undefined): T[] {
    if (!documentKey) {
        return records;
    }
    return records.filter((record) => recordMatchesDocumentKey(record, documentKey));
}

function dedupeByFileName(records: SourceRecord[]): SourceRecord[] {
    const seen = new Set<string>();
    const deduped: SourceRecord[] = [];
    for (const record of records) {
        const key = record.file_name ?? record.id;
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(record);
        }
    }
    return deduped;
}

function toTimestamp(value: string | null | undefined): number {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function sortRecordsByRecency(records: SourceRecord[]): SourceRecord[] {
    return [...records].sort((a, b) => {
        const updatedDiff = toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
        if (updatedDiff !== 0) {
            return updatedDiff;
        }
        return toTimestamp(b.created_at) - toTimestamp(a.created_at);
    });
}

function ensureRecordsHaveStorage(records: SourceRecord[]): void {
    for (const record of records) {
        if (!record.file_name || !record.storage_bucket || !record.storage_path) {
            throw new Error(
                `Contribution ${record.id} is missing required storage information (file_name, storage_bucket, or storage_path).`,
            );
        }
    }
}

function getRecordUniqueKey(record: SourceRecord): string {
    const bucket = record.storage_bucket ?? '';
    const path = record.storage_path ?? '';
    const fileName = record.file_name ?? record.id;
    return `${bucket}|${path}|${fileName}`;
}

function selectRecordsForRule(
    records: SourceRecord[],
    allowMultiple: boolean,
    usedRecordKeys: Set<string>,
): SourceRecord[] {
    if (allowMultiple) {
        return records;
    }

    for (const record of records) {
        const key = getRecordUniqueKey(record);
        if (!usedRecordKeys.has(key)) {
            return [record];
        }
    }

    return [];
}

export async function findSourceDocuments(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    inputsRequired: DialecticRecipeStep['inputs_required'],
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>,
): Promise<SourceDocument[]> {
    if (!inputsRequired || inputsRequired.length === 0) return [];

    const allSourceDocuments: SourceDocument[] = [];
    const seenDocumentPaths = new Set<string>();
    const usedRecordKeys = new Set<string>();
    const { projectId, sessionId, iterationNumber, sourceContributionId } = parentJob.payload;

    for (const rule of inputsRequired) {
        const stageSlugCandidate = typeof rule.slug === 'string' ? rule.slug.trim() : '';
        const shouldFilterByStage = stageSlugCandidate.length > 0 && stageSlugCandidate !== 'any';
        const normalizedIterationNumber = typeof iterationNumber === 'number' ? iterationNumber : 0;
        const allowMultipleMatches = rule.multiple === true;

        let sourceRecords: SourceRecord[] = [];

        switch (rule.type) {
            case 'feedback': {
                let feedbackQuery = dbClient.from('dialectic_feedback').select('*').eq('session_id', sessionId);
                if (shouldFilterByStage) {
                    feedbackQuery = feedbackQuery.eq('stage_slug', stageSlugCandidate);
                }
                if (rule.document_key) {
                    feedbackQuery = feedbackQuery.ilike('file_name', `%${rule.document_key}%`);
                }
                const { data, error: feedbackError } = await feedbackQuery;
                if (feedbackError) {
                    throw new Error(`Failed to fetch source documents for type '${rule.type}': ${feedbackError.message}`);
                }

                const feedbackRecordsRaw = (data ?? []);
                ensureRecordsHaveStorage(feedbackRecordsRaw);
                const feedbackRecords = sortRecordsByRecency(feedbackRecordsRaw);
                const filteredFeedback = filterRecordsByDocumentKey(feedbackRecords, rule.document_key);
                const dedupedFeedback = dedupeByFileName(filteredFeedback);
                sourceRecords = selectRecordsForRule(dedupedFeedback, allowMultipleMatches, usedRecordKeys);
                break;
            }
            case 'document': {
                let resourceQuery = dbClient.from('dialectic_project_resources')
                    .select('*')
                    .eq('project_id', projectId)
                    .eq('resource_type', 'rendered_document');

                if (typeof sourceContributionId === 'string' && sourceContributionId.length > 0) {
                    resourceQuery = resourceQuery.eq('source_contribution_id', sourceContributionId);
                }

                if (sessionId) {
                    resourceQuery = resourceQuery.eq('session_id', sessionId);
                }

                if (shouldFilterByStage) {
                    resourceQuery = resourceQuery.eq('stage_slug', stageSlugCandidate);
                }

                resourceQuery = resourceQuery.eq('iteration_number', normalizedIterationNumber);

                if (rule.document_key) {
                    const documentKey = rule.document_key;
                    resourceQuery = resourceQuery.ilike('file_name', `%${documentKey}%`);
                }
                const { data: resourceData, error: resourceError } = await resourceQuery;
                if (resourceError) {
                    throw new Error(
                        `Failed to fetch source documents for type '${rule.type}' from project_resources: ${resourceError.message}`,
                    );
                }

                const resourceRecordsRaw = (resourceData ?? []);
                ensureRecordsHaveStorage(resourceRecordsRaw);
                const resourceRecords = sortRecordsByRecency(resourceRecordsRaw);
                const filteredResources = filterRecordsByDocumentKey(resourceRecords, rule.document_key);
                const hasDocumentKey = typeof rule.document_key === 'string' && rule.document_key.length > 0;
                if (!(hasDocumentKey && filteredResources.length === 0)) {
                    const resourceCandidates = filteredResources.length > 0 ? filteredResources : resourceRecords;
                    const dedupedResources = dedupeByFileName(resourceCandidates);
                    const selectedResources = selectRecordsForRule(dedupedResources, allowMultipleMatches, usedRecordKeys);
                    if (selectedResources.length > 0) {
                        sourceRecords = selectedResources;
                        break;
                    }
                }

                let contributionQuery = dbClient.from('dialectic_contributions')
                    .select('*')
                    .eq('session_id', sessionId)
                    .eq('iteration_number', normalizedIterationNumber)
                    .eq('is_latest_edit', true);

                if (shouldFilterByStage) {
                    contributionQuery = contributionQuery.eq('stage', stageSlugCandidate);
                }

                const { data: contributionData, error: contributionError } = await contributionQuery;
                if (contributionError) {
                    throw new Error(
                        `Failed to fetch source documents for type '${rule.type}' from contributions: ${contributionError.message}`,
                    );
                }
                const contributionRecordsRaw = (contributionData ?? []);
                ensureRecordsHaveStorage(contributionRecordsRaw);
                const contributionRecords = sortRecordsByRecency(contributionRecordsRaw);
                const filteredContributions = filterRecordsByDocumentKey(contributionRecords, rule.document_key);
                const contributionCandidates = hasDocumentKey
                    ? filteredContributions
                    : (filteredContributions.length > 0 ? filteredContributions : contributionRecords);
                const dedupedContributions = dedupeByFileName(contributionCandidates);
                sourceRecords = selectRecordsForRule(dedupedContributions, allowMultipleMatches, usedRecordKeys);
                break;
            }
            case 'seed_prompt':
            case 'header_context':
            case 'project_resource': {
                let resourceQuery = dbClient.from('dialectic_project_resources')
                    .select('*')
                    .eq('project_id', projectId)
                    .eq('resource_type', rule.type);

                if (sessionId) {
                    resourceQuery = resourceQuery.eq('session_id', sessionId);
                }

                if (shouldFilterByStage) {
                    resourceQuery = resourceQuery.eq('stage_slug', stageSlugCandidate);
                }

                resourceQuery = resourceQuery.eq('iteration_number', normalizedIterationNumber);

                if (rule.document_key) {
                    const documentKey = rule.document_key;
                    resourceQuery = resourceQuery.ilike('file_name', `%${documentKey}%`);
                }
                const { data: resourceData, error: resourceError } = await resourceQuery;
                if (resourceError) {
                    throw new Error(
                        `Failed to fetch source documents for type '${rule.type}' from project_resources: ${resourceError.message}`,
                    );
                }

                const resourceRecordsRaw = (resourceData ?? []);
                ensureRecordsHaveStorage(resourceRecordsRaw);
                const resourceRecords = sortRecordsByRecency(resourceRecordsRaw);
                const filteredResources = filterRecordsByDocumentKey(resourceRecords, rule.document_key);
                const hasDocumentKey = typeof rule.document_key === 'string' && rule.document_key.length > 0;
                const resourceCandidates = hasDocumentKey && filteredResources.length === 0
                    ? resourceRecords
                    : (filteredResources.length > 0 ? filteredResources : resourceRecords);
                let effectiveRecords = selectRecordsForRule(
                    dedupeByFileName(resourceCandidates),
                    allowMultipleMatches,
                    usedRecordKeys,
                );

                if (effectiveRecords.length === 0 && rule.type === 'header_context') {
                    let contributionQuery = dbClient.from('dialectic_contributions')
                        .select('*')
                        .eq('session_id', sessionId)
                        .eq('iteration_number', normalizedIterationNumber)
                        .eq('is_latest_edit', true)
                        .eq('contribution_type', 'header_context');

                    if (shouldFilterByStage) {
                        contributionQuery = contributionQuery.eq('stage', stageSlugCandidate);
                    }
                    const { data: headerContributions, error: headerError } = await contributionQuery;
                    if (headerError) {
                        throw new Error(
                            `Failed to fetch source documents for type '${rule.type}' from contributions: ${headerError.message}`,
                        );
                    }
                    const headerRecordsRaw = (headerContributions ?? []);
                    ensureRecordsHaveStorage(headerRecordsRaw);
                    const headerRecords = sortRecordsByRecency(headerRecordsRaw);
                    const filteredHeaderContributions = filterRecordsByDocumentKey(headerRecords, rule.document_key);
                    const headerCandidates = hasDocumentKey
                        ? filteredHeaderContributions
                        : (filteredHeaderContributions.length > 0 ? filteredHeaderContributions : headerRecords);
                    const dedupedHeaderContributions = dedupeByFileName(headerCandidates);
                    effectiveRecords = selectRecordsForRule(
                        dedupedHeaderContributions,
                        allowMultipleMatches,
                        usedRecordKeys,
                    );
                }

                sourceRecords = effectiveRecords;
                break;
            }
            default: {
                throw new Error(`Unsupported input type '${rule.type}' provided to findSourceDocuments.`);
            }
        }

        if (!sourceRecords || sourceRecords.length === 0) {
            // Only throw if the rule is not optional, which we can assume for now.
            // A more robust implementation might check a `rule.optional` flag.
            throw new Error(`A required input of type '${rule.type}' was not found for the current job.`);
        }

        for (const record of sourceRecords) {
            usedRecordKeys.add(getRecordUniqueKey(record));
        }

        ensureRecordsHaveStorage(sourceRecords);

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
                
                const content = new TextDecoder().decode(data ?? new ArrayBuffer(0));
                
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
            const documentPathKey = `${doc.storage_bucket}|${doc.storage_path}|${doc.file_name}`;
            if (!seenDocumentPaths.has(documentPathKey)) {
                seenDocumentPaths.add(documentPathKey);
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
    deps.logger.info(`[planComplexStage] Step '${recipeStep.step_slug}' (key: '${recipeStep.step_key}') inputs_required: ${JSON.stringify(recipeStep.inputs_required)}`);
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