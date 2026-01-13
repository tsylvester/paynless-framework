// supabase/functions/dialectic-worker/strategies/helpers.ts
import { 
    SourceDocument, 
    DialecticRecipeStep, 
    InputRule
} from '../../dialectic-service/dialectic.interface.ts';
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
        if (doc.contribution_type) {
            if (!acc[doc.contribution_type]) {
                acc[doc.contribution_type] = [];
            }
            acc[doc.contribution_type].push(doc);
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
        // This handles cases where targetId is a string or null.
        // It correctly returns true if both `doc.document_relationships?.source_group` and `targetId` are null.
        return doc.document_relationships?.source_group === targetId;
    });
}

/**
 * Selects the anchor document for canonical path parameters based on recipe semantics.
 * 
 * This universal selector works for any recipe-defined artifact type (not just HeaderContext).
 * The anchor is the most relevant document from the inputs, identified by:
 * 1. Extracting document-type inputs from inputs_required (type === 'document', not seed_prompt/feedback)
 * 2. Finding which document has the highest relevance score from inputs_relevance
 * 3. Matching that document in sourceDocs by stage and document_key/contribution_type
 * 
 * Throws errors on invalid/ambiguous recipe metadata. Never returns defaults or fallbacks.
 * 
 * @param recipeStep - The recipe step containing inputs_required and inputs_relevance
 * @param sourceDocs - The source documents to search within
 * @returns The anchor document to use for canonicalPathParams
 * @throws Error when no document-type inputs exist in inputs_required
 * @throws Error when multiple documents have identical highest relevance (ambiguous)
 * @throws Error when required document input has no relevance score
 * @throws Error when anchor document not found in sourceDocs
 */
export function selectAnchorSourceDocument(
    recipeStep: DialecticRecipeStep,
    sourceDocs: SourceDocument[]
): SourceDocument {
    const inputsRequired = recipeStep.inputs_required;

    // Extract document-type inputs from inputs_required
    const documentInputs: InputRule[] = [];
    if (Array.isArray(inputsRequired)) {
        for (const rule of inputsRequired) {
            if (rule && rule.type === 'document' && typeof rule.slug === 'string' && rule.slug.length > 0) {
                documentInputs.push(rule);
            }
        }
    }

    if (documentInputs.length === 0) {
        throw new Error('No document-type inputs found in recipe step inputs_required');
    }

    // Build relevance map from inputs_relevance
    const relevanceMap = new Map<string, number>();
    const inputsRelevance = recipeStep.inputs_relevance;
    if (Array.isArray(inputsRelevance)) {
        for (const rule of inputsRelevance) {
            if (rule && (rule.type === 'document' || rule.type === undefined)) {
                const documentKey = rule.document_key;
                if (documentKey && typeof documentKey === 'string') {
                    const ruleRelevance = typeof rule.relevance === 'number' ? rule.relevance : undefined;
                    if (ruleRelevance !== undefined) {
                        relevanceMap.set(documentKey, ruleRelevance);
                    }
                }
            }
        }
    }

    // Find highest-relevance document input
    let bestInput: InputRule | null = null;
    let bestRelevance = -1;
    const tiedInputs: InputRule[] = [];

    for (const input of documentInputs) {
        const documentKey = input.document_key;
        if (documentKey && typeof documentKey === 'string') {
            const relevance = relevanceMap.get(documentKey);
            
            if (relevance === undefined) {
                throw new Error(`Missing relevance score for required document input ${documentKey}`);
            }

            if (relevance > bestRelevance) {
                bestRelevance = relevance;
                bestInput = input;
                tiedInputs.length = 0;
                tiedInputs.push(input);
            } else if (relevance === bestRelevance) {
                tiedInputs.push(input);
            }
        }
    }

    // Check for ambiguous selection (multiple inputs with identical highest relevance)
    if (tiedInputs.length > 1) {
        const tiedKeys = tiedInputs
            .map(input => input.document_key)
            .filter(key => key !== undefined);
        throw new Error(
            `Ambiguous anchor selection: multiple documents with identical highest relevance ${bestRelevance} for document keys [${tiedKeys.join(', ')}]`
        );
    }

    if (!bestInput) {
        throw new Error('No document-type inputs found in recipe step inputs_required');
    }

    // Find matching source document
    const targetSlug = bestInput.slug;
    const targetDocumentKey = bestInput.document_key;

    for (const doc of sourceDocs) {
        // Match stage/slug
        if (doc.stage !== targetSlug) {
            continue;
        }

        // Match document_key or contribution_type
        if (targetDocumentKey && typeof targetDocumentKey === 'string') {
            if (doc.document_key === targetDocumentKey || doc.contribution_type === targetDocumentKey) {
                return doc;
            }
        }
    }

    // No matching document found - throw error (no fallback)
    throw new Error(
        `Anchor document not found in sourceDocs for stage '${targetSlug}' document_key '${targetDocumentKey}'`
    );
} 