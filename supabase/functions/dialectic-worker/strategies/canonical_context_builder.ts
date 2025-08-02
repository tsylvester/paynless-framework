// supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts
import { SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { CanonicalPathParams } from '../../_shared/types/file_manager.types.ts';
import { generateShortId } from '../../_shared/utils/path_constructor.ts';

export function createCanonicalPathParams(
    sourceDocs: SourceDocument[],
    outputType: string
): CanonicalPathParams {
    const sourceModelSlugs = [...new Set(sourceDocs.map(d => d.model_name || ''))]
        .filter(Boolean)
        .sort();

    // Logic to determine the primary source ID (e.g., the 'thesis' in a group)
    const primarySource = sourceDocs.find(d => d.contribution_type === 'thesis');
    const sourceContributionIdShort = primarySource ? generateShortId(primarySource.id) : undefined;

    return {
        contributionType: outputType,
        sourceModelSlugs: sourceModelSlugs.length > 0 ? sourceModelSlugs : undefined,
        sourceContributionIdShort,
    };
}
