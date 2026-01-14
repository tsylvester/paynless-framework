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
    anchorDoc: SourceDocument | null,
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
    
    // Extract pairedModelSlug from paired document (only when anchor exists)
    let resolvedPairedModelSlug: string | undefined;
    if (anchorDoc !== null) {
        // Find the non-anchor document to identify the paired model slug
        const pairedDoc = sourceDocs.find(doc => doc.id !== anchorDoc.id);
        
        // Extract pairedModelSlug from paired document, falling back to filename deconstruction
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
    }

    // Extract sourceAnchorModelSlug from anchor document
    let resolvedSourceAnchorModelSlug: string | undefined;
    let resolvedSourceAttemptCount: number | undefined;
    
    if (anchorDoc === null) {
        // No anchor means no anchor-derived values - leave sourceAnchorModelSlug and sourceAttemptCount undefined
    } else {
        resolvedSourceAttemptCount = typeof anchorDoc.attempt_count === 'number' ? anchorDoc.attempt_count : undefined;
        
        // Universal extraction: always require filename deconstruction, regardless of anchor type
        // No fallbacks - missing data must be fixed at source
        if (!anchorDoc.storage_path || !anchorDoc.file_name) {
            throw new Error(
                `[createCanonicalPathParams] Anchor document missing required storage_path or file_name. ` +
                `Document ID: ${anchorDoc.id}, storage_path: ${anchorDoc.storage_path}, file_name: ${anchorDoc.file_name}. ` +
                `All anchor documents must have canonical filenames for path parameter extraction.`
            );
        }

        const deconstructed = deconstructStoragePath({
            storageDir: anchorDoc.storage_path,
            fileName: anchorDoc.file_name
        });
        
        // Extract sourceAnchorModelSlug: handle critiquing patterns and simple patterns
        if (deconstructed.sourceAnchorModelSlug) {
            // Critiquing pattern (e.g., antithesis HeaderContext): use sourceAnchorModelSlug
            resolvedSourceAnchorModelSlug = deconstructed.sourceAnchorModelSlug;
        } else if (deconstructed.modelSlug) {
            // Simple pattern: use modelSlug from filename
            resolvedSourceAnchorModelSlug = deconstructed.modelSlug;
        } else {
            throw new Error(
                `[createCanonicalPathParams] Failed to extract model slug from anchor document filename. ` +
                `Document ID: ${anchorDoc.id}, file_name: ${anchorDoc.file_name}. ` +
                `Filename must follow canonical naming convention.`
            );
        }
        
        // Extract sourceAttemptCount from filename when DB field is missing
        if (resolvedSourceAttemptCount === undefined && Number.isFinite(deconstructed.attemptCount)) {
            resolvedSourceAttemptCount = deconstructed.attemptCount;
        }
    }

    const params: CanonicalPathParams = {
        contributionType: resolvedContributionType,
        stageSlug: stage,
        sourceModelSlugs: uniqueSourceModelSlugs.length > 0 ? uniqueSourceModelSlugs : undefined,
        sourceAnchorType: anchorDoc?.contribution_type || undefined,
        sourceAnchorModelSlug: resolvedSourceAnchorModelSlug,
        sourceAttemptCount: resolvedSourceAttemptCount,
        pairedModelSlug: resolvedPairedModelSlug,
    };

    return params;
}
