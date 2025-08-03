// supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts
import { SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { CanonicalPathParams } from '../../_shared/types/file_manager.types.ts';

export function createCanonicalPathParams(
    sourceDocs: SourceDocument[],
    outputType: string,
    anchorDoc: SourceDocument
): CanonicalPathParams {
    const sourceModelSlugs = [...new Set(sourceDocs.map(d => d.model_name || ''))]
        .filter(Boolean)
        .sort();

    return {
        contributionType: outputType,
        sourceModelSlugs: sourceModelSlugs.length > 0 ? sourceModelSlugs : undefined,
        sourceAnchorType: anchorDoc.contribution_type || undefined,
        sourceAnchorModelSlug: anchorDoc.model_name || undefined,
    };
}
