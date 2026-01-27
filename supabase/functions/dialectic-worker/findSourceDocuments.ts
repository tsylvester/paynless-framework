import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import { DialecticJobRow, DialecticPlanJobPayload, DialecticRecipeStep } from '../dialectic-service/dialectic.interface.ts';
import { DialecticContributionRow, DialecticProjectResourceRow, DialecticFeedbackRow } from '../dialectic-service/dialectic.interface.ts';
import { SourceDocument } from '../dialectic-service/dialectic.interface.ts';
import { isDocumentRelationships } from '../_shared/utils/type_guards.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';

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
// Note: content is set to empty string because planners only need metadata, not content. Content is fetched later in executeModelCallAndSave.gatherArtifacts() when constructing the API call.
function mapContributionToSourceDocument(row: DialecticContributionRow): SourceDocument {
    const { document_relationships, ...rest } = row;
    const docRels = document_relationships && isDocumentRelationships(document_relationships) ? document_relationships : null;
    const deconstructedPath = deconstructStoragePath({ storageDir: row.storage_path!, fileName: row.file_name! });
    return { ...rest, content: '', document_relationships: docRels, attempt_count: deconstructedPath.attemptCount ?? 1, document_key: deconstructedPath.documentKey };
}

// Note: content is set to empty string because planners only need metadata, not content. Content is fetched later in executeModelCallAndSave.gatherArtifacts() when constructing the API call.
function mapResourceToSourceDocument(row: DialecticProjectResourceRow): SourceDocument {
    let documentRelationships: SourceDocument['document_relationships'] = null;
    
    if (isRecord(row.resource_description) && 'document_relationships' in row.resource_description) {
        const docRels = row.resource_description.document_relationships;
        if (docRels !== undefined && docRels !== null && isDocumentRelationships(docRels)) {
            documentRelationships = docRels;
        }
    }
    
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
        content: '',
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
        document_relationships: documentRelationships,
        is_header: false,
        source_prompt_resource_id: row.source_contribution_id,
    };
}

// Note: content is set to empty string because planners only need metadata, not content. Content is fetched later in executeModelCallAndSave.gatherArtifacts() when constructing the API call.
function mapFeedbackToSourceDocument(row: DialecticFeedbackRow): SourceDocument {
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
        content: '',
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
    _allowMultiple: boolean,
    _usedRecordKeys: Set<string>,
): SourceRecord[] {
    // Always return all records without filtering.
    // The planner is responsible for grouping by lineage, model filtering, etc.
    // Deduplication happens at the end via seenDocumentPaths, so multiple rules
    // can request the same document without causing "not found" errors.
    return records;
}

export async function findSourceDocuments(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    inputsRequired: DialecticRecipeStep['inputs_required'],
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
                // Query project_resources for finished rendered documents
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
                const resourceCandidates = hasDocumentKey && filteredResources.length > 0
                    ? filteredResources
                    : (hasDocumentKey && filteredResources.length === 0 ? [] : resourceRecords);

                // Check if resources were found
                if (resourceCandidates.length > 0) {
                    // Resources found: use them exclusively, skip contributions query
                    console.log(`[findSourceDocuments] Found ${resourceCandidates.length} rendered document(s) in dialectic_project_resources for document_key '${rule.document_key}' and stage '${stageSlugCandidate}'. Using resources exclusively.`);
                    const dedupedResources = dedupeByFileName(resourceCandidates);
                    sourceRecords = selectRecordsForRule(dedupedResources, allowMultipleMatches, usedRecordKeys);
                } else {
                    // No resources found: check if this input is optional
                    if (rule.required === false) {
                        console.log(`[findSourceDocuments] No rendered documents found for optional input rule type 'document' with stage '${stageSlugCandidate}' and document_key '${rule.document_key}'. Skipping optional input.`);
                        // Optional input - skip without error
                    } else {
                        // Required input (default) - throw error immediately (fail loud and hard - no fallbacks)
                        console.log(`[findSourceDocuments] No rendered documents found in dialectic_project_resources for input rule type 'document' with stage '${stageSlugCandidate}' and document_key '${rule.document_key}'. This indicates the document was not rendered or the rendering step failed.`);
                        throw new Error(
                            `Required rendered document for input rule type 'document' with stage '${stageSlugCandidate}' and document_key '${rule.document_key}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`,
                        );
                    }
                }
                break;
            }
            case 'header_context': {
                const parentModelId = parentJob.payload.model_id;
                let contributionQuery = dbClient.from('dialectic_contributions')
                    .select('*')
                    .eq('session_id', sessionId)
                    .eq('iteration_number', normalizedIterationNumber)
                    .eq('is_latest_edit', true)
                    .eq('contribution_type', 'header_context')
                    .eq('model_id', parentModelId);

                if (shouldFilterByStage) {
                    contributionQuery = contributionQuery.eq('stage', stageSlugCandidate);
                }

                if (rule.document_key) {
                    const documentKey = rule.document_key;
                    contributionQuery = contributionQuery.ilike('file_name', `%${documentKey}%`);
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
                const hasDocumentKey = typeof rule.document_key === 'string' && rule.document_key.length > 0;
                const headerCandidates = hasDocumentKey
                    ? filteredHeaderContributions
                    : (filteredHeaderContributions.length > 0 ? filteredHeaderContributions : headerRecords);
                const dedupedHeaderContributions = dedupeByFileName(headerCandidates);
                sourceRecords = selectRecordsForRule(
                    dedupedHeaderContributions,
                    allowMultipleMatches,
                    usedRecordKeys,
                );
                break;
            }
            case 'contribution': {
                let contributionQuery = dbClient.from('dialectic_contributions')
                    .select('*')
                    .eq('session_id', sessionId)
                    .eq('iteration_number', normalizedIterationNumber)
                    .eq('is_latest_edit', true);

                if (shouldFilterByStage) {
                    contributionQuery = contributionQuery.eq('stage', stageSlugCandidate);
                }

                if (rule.document_key) {
                    const key = rule.document_key;
                    contributionQuery = contributionQuery.or(`file_name.ilike.%${key}%,contribution_type.eq.${key}`);
                }

                const { data: contribData, error: contribError } = await contributionQuery;
                if (contribError) {
                    throw new Error(
                        `Failed to fetch source documents for type '${rule.type}' from contributions: ${contribError.message}`,
                    );
                }

                const contribRecordsRaw = (contribData ?? []);
                ensureRecordsHaveStorage(contribRecordsRaw);
                const contribRecords = sortRecordsByRecency(contribRecordsRaw);
                const filteredContribs = filterRecordsByDocumentKey(contribRecords, rule.document_key);

                sourceRecords = selectRecordsForRule(
                    dedupeByFileName(filteredContribs),
                    allowMultipleMatches,
                    usedRecordKeys,
                );
                break;
            }
            case 'seed_prompt':
            case 'project_resource': {
                // NOTE: seed_prompt and project_resource types are user-provided inputs
                // (initial prompt, reference documents) that exist at the project level.
                // They should NOT be filtered by model_id, stage_slug, or iteration_number
                // since they are project-wide constants available to all stages and iterations.
                // This is intentionally different from 'rendered_document' type which IS
                // filtered by those fields.
                const hasDocumentKey = typeof rule.document_key === 'string' && rule.document_key.length > 0;
                const isInitialUserPromptProjectResource =
                    rule.type === 'project_resource' &&
                    hasDocumentKey &&
                    rule.document_key === 'initial_user_prompt';

                const resourceTypeForQuery = isInitialUserPromptProjectResource
                    ? 'initial_user_prompt'
                    : rule.type;

                let resourceQuery = dbClient.from('dialectic_project_resources')
                    .select('*')
                    .eq('project_id', projectId)
                    .eq('resource_type', resourceTypeForQuery);

                // NOTE: Intentionally NOT filtering by session_id, stage_slug, model_id,
                // or iteration_number for project_resource/seed_prompt types.
                // These are project-wide resources accessible from any context.

                if (!isInitialUserPromptProjectResource && rule.document_key) {
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
                const resourceCandidates = hasDocumentKey && filteredResources.length === 0
                    ? resourceRecords
                    : (filteredResources.length > 0 ? filteredResources : resourceRecords);
                const effectiveRecords = selectRecordsForRule(
                    dedupeByFileName(resourceCandidates),
                    allowMultipleMatches,
                    usedRecordKeys,
                );

                sourceRecords = effectiveRecords;
                break;
            }
            default: {
                throw new Error(`Unsupported input type '${rule.type}' provided to findSourceDocuments.`);
            }
        }

        if (!sourceRecords || sourceRecords.length === 0) {
            // Only throw if the rule is required (required === true or undefined, which defaults to required).
            // If required === false, the input is optional and we should skip it without error.
            if (rule.required !== false) {
                throw new Error(`A required input of type '${rule.type}' was not found for the current job.`);
            }
            // If required === false, skip this rule and continue to the next one
            continue;
        }

        for (const record of sourceRecords) {
            usedRecordKeys.add(getRecordUniqueKey(record));
        }

        ensureRecordsHaveStorage(sourceRecords);

        // Collect source_contribution_ids from project resources to fetch document_relationships
        const resourcesNeedingDocRels: DialecticProjectResourceRow[] = [];
        for (const record of sourceRecords) {
            if (isProjectResourceRow(record) && record.source_contribution_id) {
                resourcesNeedingDocRels.push(record);
            }
        }

        // Batch-fetch contributions to get document_relationships for project resources
        const docRelsMap = new Map<string, SourceDocument['document_relationships']>();
        if (resourcesNeedingDocRels.length > 0) {
            const contributionIds = resourcesNeedingDocRels
                .map(r => r.source_contribution_id)
                .filter((id): id is string => id !== null);

            console.log(`[findSourceDocuments] Fetching document_relationships for ${contributionIds.length} contribution(s): ${contributionIds.join(', ')}`);

            if (contributionIds.length > 0) {
                const { data: contributions, error: contribError } = await dbClient
                    .from('dialectic_contributions')
                    .select('id, document_relationships')
                    .in('id', contributionIds);

                if (contribError) {
                    console.warn(`[findSourceDocuments] Failed to fetch document_relationships from contributions: ${contribError.message}`);
                } else if (contributions) {
                    console.log(`[findSourceDocuments] Fetched ${contributions.length} contribution(s) with document_relationships`);
                    for (const contrib of contributions) {
                        if (contrib.document_relationships && isDocumentRelationships(contrib.document_relationships)) {
                            docRelsMap.set(contrib.id, contrib.document_relationships);
                            console.log(`[findSourceDocuments] Mapped document_relationships for contribution ${contrib.id}: source_group=${(contrib.document_relationships as Record<string, unknown>).source_group}`);
                        } else {
                            console.log(`[findSourceDocuments] Contribution ${contrib.id} has no valid document_relationships: ${JSON.stringify(contrib.document_relationships)}`);
                        }
                    }
                }
            }
        } else {
            console.log(`[findSourceDocuments] No resources with source_contribution_id to fetch document_relationships for`);
        }

        const documents = sourceRecords.map((record: SourceRecord) => {
            if (isFeedbackRow(record)) {
                return mapFeedbackToSourceDocument(record);
            } else if (isProjectResourceRow(record)) {
                const doc = mapResourceToSourceDocument(record);
                // Merge document_relationships from source contribution if available
                if (record.source_contribution_id && docRelsMap.has(record.source_contribution_id)) {
                    doc.document_relationships = docRelsMap.get(record.source_contribution_id) ?? null;
                }
                return doc;
            } else if (isContributionRow(record)) {
                return mapContributionToSourceDocument(record);
            }
            return null;
        });

        const validDocuments = documents.filter((doc): doc is SourceDocument => doc !== null);
        for (const doc of validDocuments) {
            const documentPathKey = `${doc.storage_bucket}|${doc.storage_path}|${doc.file_name}`;
            if (!seenDocumentPaths.has(documentPathKey)) {
                seenDocumentPaths.add(documentPathKey);
                allSourceDocuments.push(doc);
                console.log(`[findSourceDocuments] Added document: stage=${doc.stage}, file_name=${doc.file_name}, source_group=${doc.document_relationships?.source_group ?? 'null'}`);
            }
        }
    }

    return allSourceDocuments;
}

