// supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts
import { ContributionType, SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { CanonicalPathParams, FileType } from '../../_shared/types/file_manager.types.ts';
import { isFileType } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';

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

    const sourceModelSlugs = Array.from(new Set(sourceDocs.map(d => d.model_name || '')))
        .filter(Boolean)
        .sort();
    
    // Find the non-anchor document to identify the paired model slug
    const pairedDoc = sourceDocs.find(doc => doc.id !== anchorDoc.id);

    const params: CanonicalPathParams = {
        contributionType: resolvedContributionType,
        stageSlug: stage,
        sourceModelSlugs: sourceModelSlugs.length > 0 ? sourceModelSlugs : undefined,
        sourceAnchorType: anchorDoc.contribution_type || undefined,
        sourceAnchorModelSlug: anchorDoc.model_name || undefined,
        sourceAttemptCount: anchorDoc.attempt_count ?? undefined, // Pass the anchor's attempt count
        pairedModelSlug: pairedDoc?.model_name || undefined,
    };

    if (pairedDoc?.model_name) {
        params.pairedModelSlug = pairedDoc.model_name;
    }

    return params;
}
