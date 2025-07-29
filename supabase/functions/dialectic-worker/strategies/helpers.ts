// supabase/functions/dialectic-worker/strategies/helpers.ts
import type { SourceDocument } from '../../dialectic-service/dialectic.interface.ts';

/**
 * Groups an array of source documents by their `contribution_type`.
 *
 * This function iterates through a list of documents and organizes them into a
 * dictionary where keys are the contribution types (e.g., 'thesis', 'antithesis')
 * and values are arrays of documents of that type. Documents with a null or
 * undefined `contribution_type` are ignored.
 *
 * @param documents - An array of `SourceDocument` objects.
 * @returns A record where keys are contribution types and values are arrays of documents.
 */
export function groupSourceDocumentsByType(documents: SourceDocument[]): Record<string, SourceDocument[]> {
    return documents.reduce<Record<string, SourceDocument[]>>((acc, doc) => {
        if (doc.stage) {
            if (!acc[doc.stage]) {
                acc[doc.stage] = [];
            }
            acc[doc.stage].push(doc);
        }
        return acc;
    }, {});
}

/**
 * Finds all documents in a given array that are related to a specific source contribution.
 *
 * This function filters a list of documents, returning only those whose
 * `target_contribution_id` matches the provided `targetId`.
 *
 * @param documents - An array of `SourceDocument` objects to search within.
 * @param targetId - The ID of the target contribution to find relations for. Can be null.
 * @returns An array of `SourceDocument` objects that are related to the target ID.
 */
export function findRelatedContributions(documents: SourceDocument[], targetId: string | null): SourceDocument[] {
    return documents.filter(doc => {
        if (!doc.document_relationships || typeof doc.document_relationships !== 'object' || Array.isArray(doc.document_relationships)) {
            return false;
        }
        const relationships = doc.document_relationships as { source?: string };
        return relationships.source === targetId;
    });
} 