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
    return { ...rest, content: '', document_relationships: docRels, attempt_count: deconstructedPath.attemptCount ?? 1 };
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
                    console.log(`[findSourceDocuments] Found ${resourceCandidates.length} rendered document(s) in dialectic_project_resources for document_key '${rule.document_key || 'unspecified'}' and stage '${stageSlugCandidate}'. Using resources exclusively.`);
                    const dedupedResources = dedupeByFileName(resourceCandidates);
                    sourceRecords = selectRecordsForRule(dedupedResources, allowMultipleMatches, usedRecordKeys);
                } else {
                    // No resources found: throw error immediately (fail loud and hard - no fallbacks)
                    console.log(`[findSourceDocuments] No rendered documents found in dialectic_project_resources for input rule type 'document' with stage '${stageSlugCandidate}' and document_key '${rule.document_key || 'unspecified'}'. This indicates the document was not rendered or the rendering step failed.`);
                    throw new Error(
                        `Required rendered document for input rule type 'document' with stage '${stageSlugCandidate}' and document_key '${rule.document_key || 'unspecified'}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`,
                    );
                }
                break;
            }
            case 'header_context': {
                let contributionQuery = dbClient.from('dialectic_contributions')
                    .select('*')
                    .eq('session_id', sessionId)
                    .eq('iteration_number', normalizedIterationNumber)
                    .eq('is_latest_edit', true)
                    .eq('contribution_type', 'header_context');

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
            case 'seed_prompt':
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
            // Only throw if the rule is not optional, which we can assume for now.
            // A more robust implementation might check a `rule.optional` flag.
            throw new Error(`A required input of type '${rule.type}' was not found for the current job.`);
        }

        for (const record of sourceRecords) {
            usedRecordKeys.add(getRecordUniqueKey(record));
        }

        ensureRecordsHaveStorage(sourceRecords);

        const documents = sourceRecords.map((record: SourceRecord) => {
            if (isFeedbackRow(record)) {
                return mapFeedbackToSourceDocument(record);
            } else if (isProjectResourceRow(record)) {
                return mapResourceToSourceDocument(record);
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
            }
        }
    }
    
    return allSourceDocuments;
}

