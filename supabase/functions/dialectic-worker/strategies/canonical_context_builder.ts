// supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts
import { ContributionType, SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { CanonicalPathParams } from '../../_shared/types/file_manager.types.ts';

export function createCanonicalPathParams(
    sourceDocs: SourceDocument[],
    outputType: ContributionType,
    anchorDoc: SourceDocument
): CanonicalPathParams {
    const sourceModelSlugs = Array.from(new Set(sourceDocs.map(d => d.model_name || '')))
        .filter(Boolean)
        .sort();
    
    // Find the non-anchor document to identify the paired model slug
    const pairedDoc = sourceDocs.find(doc => doc.id !== anchorDoc.id);

    const params: CanonicalPathParams = {
        contributionType: outputType,
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
