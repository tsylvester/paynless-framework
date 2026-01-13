// supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts
import { ContributionType, SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { CanonicalPathParams, FileType } from '../../_shared/types/file_manager.types.ts';
import { isFileType } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { deconstructStoragePath } from '../../_shared/utils/path_deconstructor.ts';

const intermediateFileTypeMap: Partial<Record<FileType, ContributionType>> = {
    [FileType.PairwiseSynthesisChunk]: 'pairwise_synthesis_chunk',
    [FileType.ReducedSynthesis]: 'reduced_synthesis',
    [FileType.RagContextSummary]: 'rag_context_summary',
    [FileType.HeaderContext]: 'header_context',
};

export function createCanonicalPathParams(
    sourceDocs: SourceDocument[],
    outputType: FileType | ContributionType,
    anchorDoc: SourceDocument,
    stage: ContributionType,
): CanonicalPathParams {
    let resolvedContributionType: ContributionType;

    if (isFileType(outputType)) {
        // If the file type is a specific intermediate type, use its fixed contribution type.
        const intermediateType = intermediateFileTypeMap[outputType];
        if (intermediateType) {
            resolvedContributionType = intermediateType;
        } else {
            // Otherwise, the stage determines the contribution type.
            resolvedContributionType = stage;
        }
    } else {
        // If outputType is already a ContributionType, use it directly.
        resolvedContributionType = outputType;
    }

    // Extract model slugs from source documents, falling back to filename deconstruction when model_name is missing
    const sourceModelSlugs: string[] = [];
    for (const doc of sourceDocs) {
        if (doc.model_name) {
            sourceModelSlugs.push(doc.model_name);
        } else if (doc.storage_path && doc.file_name) {
            // When model_name is missing (e.g., rendered documents), extract from filename
            try {
                const deconstructed = deconstructStoragePath({
                    storageDir: doc.storage_path,
                    fileName: doc.file_name
                });
                if (deconstructed.modelSlug) {
                    sourceModelSlugs.push(deconstructed.modelSlug);
                }
            } catch (error) {
                // Deconstruction failed, skip this document
                console.warn(`[createCanonicalPathParams] Failed to extract model slug from source document ${doc.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    const uniqueSourceModelSlugs = Array.from(new Set(sourceModelSlugs)).sort();
    
    // Find the non-anchor document to identify the paired model slug
    const pairedDoc = sourceDocs.find(doc => doc.id !== anchorDoc.id);
    
    // Extract pairedModelSlug from paired document, falling back to filename deconstruction
    let resolvedPairedModelSlug: string | undefined;
    if (pairedDoc) {
        if (pairedDoc.model_name) {
            resolvedPairedModelSlug = pairedDoc.model_name;
        } else if (pairedDoc.storage_path && pairedDoc.file_name) {
            try {
                const deconstructed = deconstructStoragePath({
                    storageDir: pairedDoc.storage_path,
                    fileName: pairedDoc.file_name
                });
                if (deconstructed.modelSlug) {
                    resolvedPairedModelSlug = deconstructed.modelSlug;
                }
            } catch (error) {
                // Deconstruction failed, pairedModelSlug remains undefined
                console.warn(`[createCanonicalPathParams] Failed to extract model slug from paired document ${pairedDoc.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    // Extract sourceAnchorModelSlug from anchor document
    let resolvedSourceAnchorModelSlug: string | undefined;
    let resolvedSourceAttemptCount: number | undefined =
        typeof anchorDoc.attempt_count === 'number' ? anchorDoc.attempt_count : undefined;
    
    // For HeaderContext documents, always try deconstruction first to check for critiquing patterns
    // The model_name is the critiquing model, but sourceAnchorModelSlug should be the source model
    if (anchorDoc.contribution_type === 'header_context' && anchorDoc.storage_path && anchorDoc.file_name) {
        try {
            const deconstructed = deconstructStoragePath({
                storageDir: anchorDoc.storage_path,
                fileName: anchorDoc.file_name
            });
            // If deconstruction extracted sourceAnchorModelSlug, use it (antithesis critiquing pattern)
            if (deconstructed.sourceAnchorModelSlug) {
                resolvedSourceAnchorModelSlug = deconstructed.sourceAnchorModelSlug;
            } else {
                // No critiquing pattern found, fall back to model_name
                resolvedSourceAnchorModelSlug = anchorDoc.model_name || undefined;
            }
            if (resolvedSourceAttemptCount === undefined && Number.isFinite(deconstructed.attemptCount)) {
                resolvedSourceAttemptCount = deconstructed.attemptCount;
            }
        } catch (error) {
            // Deconstruction failed, fall back to model_name
            console.warn(`[createCanonicalPathParams] Failed to deconstruct HeaderContext storage path, falling back to model_name: ${error instanceof Error ? error.message : String(error)}`);
            resolvedSourceAnchorModelSlug = anchorDoc.model_name || undefined;
        }
    } else if (isFileType(outputType) && outputType === FileType.HeaderContext && stage === 'antithesis' && anchorDoc.storage_path && anchorDoc.file_name) {
        // When creating HeaderContext for antithesis stage, always extract sourceAnchorModelSlug from filename
        // even if model_name exists, because model_name may be the critiquing model or incorrect.
        // The filename contains the original source model slug that we need for the critiquing pattern.
        try {
            const deconstructed = deconstructStoragePath({
                storageDir: anchorDoc.storage_path,
                fileName: anchorDoc.file_name
            });
            if (deconstructed.modelSlug) {
                // Use modelSlug extracted from filename (original source model)
                resolvedSourceAnchorModelSlug = deconstructed.modelSlug;
            }
            if (resolvedSourceAttemptCount === undefined && Number.isFinite(deconstructed.attemptCount)) {
                resolvedSourceAttemptCount = deconstructed.attemptCount;
            }
        } catch (error) {
            // Deconstruction failed, fall back to model_name as last resort
            console.warn(`[createCanonicalPathParams] Failed to deconstruct storage path when creating HeaderContext for antithesis stage, falling back to model_name: ${error instanceof Error ? error.message : String(error)}`);
            resolvedSourceAnchorModelSlug = anchorDoc.model_name || undefined;
        }
    } else if (anchorDoc.model_name) {
        // For non-HeaderContext documents, use model_name if available
        resolvedSourceAnchorModelSlug = anchorDoc.model_name;
    } else if (anchorDoc.storage_path && anchorDoc.file_name) {
        // When model_name is missing (e.g., rendered documents from dialectic_project_resources),
        // extract model slug from the storage path via deconstruction
        try {
            const deconstructed = deconstructStoragePath({
                storageDir: anchorDoc.storage_path,
                fileName: anchorDoc.file_name
            });
            if (deconstructed.modelSlug) {
                // Use modelSlug extracted from filename
                resolvedSourceAnchorModelSlug = deconstructed.modelSlug;
            }
            if (resolvedSourceAttemptCount === undefined && Number.isFinite(deconstructed.attemptCount)) {
                resolvedSourceAttemptCount = deconstructed.attemptCount;
            }
        } catch (error) {
            // Deconstruction failed, sourceAnchorModelSlug remains undefined
            console.warn(`[createCanonicalPathParams] Failed to deconstruct storage path: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const params: CanonicalPathParams = {
        contributionType: resolvedContributionType,
        stageSlug: stage,
        sourceModelSlugs: uniqueSourceModelSlugs.length > 0 ? uniqueSourceModelSlugs : undefined,
        sourceAnchorType: anchorDoc.contribution_type || undefined,
        sourceAnchorModelSlug: resolvedSourceAnchorModelSlug,
        sourceAttemptCount: resolvedSourceAttemptCount,
        pairedModelSlug: resolvedPairedModelSlug,
    };

    return params;
}
