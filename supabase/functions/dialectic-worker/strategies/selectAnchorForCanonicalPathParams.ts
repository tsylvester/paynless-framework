// supabase/functions/dialectic-worker/strategies/helpers.ts
import { 
    SourceDocument, 
    DialecticRecipeStep, 
    InputRule,
} from '../../dialectic-service/dialectic.interface.ts';
import { deconstructStoragePath } from '../../_shared/utils/path_deconstructor.ts';

/**
 * Selects the anchor document for canonical path parameters based on relevance metadata.
 * 
 * This function selects the highest-relevance document from inputs_relevance metadata
 * for use in canonical path parameter construction, independent of lineage anchor selection.
 * 
 * Returns a SourceDocument if a matching document with highest relevance is found,
 * or null if no relevance metadata exists, no document inputs exist, or no matching document is found.
 * 
 * Throws an error if multiple document inputs have identical highest relevance (ambiguous selection).
 * 
 * @param recipeStep - The recipe step containing inputs_required and inputs_relevance arrays
 * @param sourceDocs - The source documents to search within
 * @returns SourceDocument if found, null otherwise
 * @throws Error when multiple documents have identical highest relevance (ambiguous)
 */
export function selectAnchorForCanonicalPathParams(
    recipeStep: DialecticRecipeStep,
    sourceDocs: SourceDocument[]
): SourceDocument | null {
    const inputsRequired = recipeStep.inputs_required;
    
    // 103.d.i: Extract document-type inputs from inputs_required array (filter for type === 'document')
    const documentInputs: InputRule[] = [];
    if (Array.isArray(inputsRequired)) {
        for (const rule of inputsRequired) {
            if (rule && typeof rule.slug === 'string' && rule.slug.length > 0) {
                if (rule.type === 'document') {
                    documentInputs.push(rule);
                }
            }
        }
    }
    
    // 103.d.ii: If no document inputs found, return null
    if (documentInputs.length === 0) {
        return null;
    }
    
    // 103.d.iii: Build relevance map from inputs_relevance array (map document_key to relevance number)
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
    
    // 103.d.iv: If inputs_relevance is empty or undefined, return null
    if (relevanceMap.size === 0) {
        return null;
    }
    
    // 103.d.v: Find highest-relevance document input by iterating through document inputs and comparing relevance scores
    let bestInput: InputRule | null = null;
    let bestRelevance = -1;
    const tiedInputs: InputRule[] = [];
    
    for (const input of documentInputs) {
        const documentKey = input.document_key;
        if (documentKey && typeof documentKey === 'string') {
            const relevance = relevanceMap.get(documentKey);
            
            if (relevance === undefined) {
                // Skip inputs without relevance scores
                continue;
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
    
    // 103.d.vi: If multiple inputs have identical highest relevance, throw error with message listing tied document keys
    if (tiedInputs.length > 1) {
        const tiedKeys = tiedInputs
            .map(input => input.document_key)
            .filter(key => key !== undefined && key !== null) as string[];
        throw new Error(
            `Ambiguous anchor selection: multiple documents with identical highest relevance ${bestRelevance} for document keys [${tiedKeys.join(', ')}]`
        );
    }
    
    if (!bestInput) {
        // No document inputs had relevance scores
        return null;
    }
    
    // 103.d.vii: Extract targetSlug and targetDocumentKey from highest-relevance input rule
    const targetSlug = bestInput.slug;
    const targetDocumentKey = bestInput.document_key;
    
    if (!targetSlug || !targetDocumentKey || typeof targetDocumentKey !== 'string') {
        return null;
    }
    
    // 103.d.viii: Iterate through sourceDocs to find matching document
    // 103.d.ix: For each source document, extract document_key from filename using deconstructStoragePath
    // 103.d.x: Match source document where doc.stage === targetSlug AND extracted document_key === targetDocumentKey
    for (const doc of sourceDocs) {
        // Match stage/slug
        if (doc.stage !== targetSlug) {
            continue;
        }
        
        // Extract document_key from filename using deconstructStoragePath
        if (doc.file_name && doc.storage_path) {
            const pathInfo = deconstructStoragePath({
                storageDir: doc.storage_path,
                fileName: doc.file_name,
            });
            const docDocumentKey = pathInfo.documentKey;
            
            // Match by extracted document_key
            if (docDocumentKey === targetDocumentKey) {
                return doc;
            }
        }
    }
    
    // 103.d.xi: Return matched SourceDocument or null if no match found
    return null;
} 