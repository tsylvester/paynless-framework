// supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts
import { ContributionType, SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { CanonicalPathParams, FileType } from '../../_shared/types/file_manager.types.ts';
import { getContributionTypeFromFileType } from '../../_shared/utils/type_mapper.ts';
import { isFileType } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';


export function createCanonicalPathParams(
    sourceDocs: SourceDocument[],
    outputType: FileType | ContributionType,
    anchorDoc: SourceDocument
): CanonicalPathParams {
    let resolvedContributionType: ContributionType;

    if (isFileType(outputType)) {
        const mappedType = getContributionTypeFromFileType(outputType);
        if (!mappedType) {
            throw new Error("Cannot create CanonicalPathParams for a FileType that does not map to a ContributionType.");
        }
        resolvedContributionType = mappedType;
    } else {
        resolvedContributionType = outputType;
    }

    const sourceModelSlugs = Array.from(new Set(sourceDocs.map(d => d.model_name || '')))
        .filter(Boolean)
        .sort();
    
    // Find the non-anchor document to identify the paired model slug
    const pairedDoc = sourceDocs.find(doc => doc.id !== anchorDoc.id);

    const params: CanonicalPathParams = {
        contributionType: resolvedContributionType,
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
