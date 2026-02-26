// supabase/functions/dialectic-worker/strategies/helpers.ts
import { 
    SourceDocument, 
    DialecticRecipeStep, 
    InputRule,
    SelectAnchorResult
} from '../../dialectic-service/dialectic.interface.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { deconstructStoragePath } from '../../_shared/utils/path_deconstructor.ts';
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
 * This function implements a decision tree that distinguishes job types and output types:
 * - PLAN jobs with all_to_one granularity: no anchor required
 * - PLAN jobs with other granularities: find anchor from document inputs for lineage
 * - EXECUTE jobs producing header_context: no anchor required
 * - EXECUTE jobs with only header_context input (producing documents): derive from header_context
 * - EXECUTE jobs with document inputs: find anchor with highest relevance
 * 
 * Returns a SelectAnchorResult discriminated union distinguishing outcomes:
 * - no_anchor_required: PLAN all_to_one OR EXECUTE producing header_context
 * - derive_from_header_context: EXECUTE with only header_context input producing documents
 * - anchor_found: anchor document was successfully selected
 * - anchor_not_found: recipe requires documents but anchor not found in sourceDocs
 * 
 * Throws errors on invalid/ambiguous recipe metadata (programmer errors). Never returns defaults or fallbacks.
 * 
 * @param recipeStep - The recipe step containing job_type, output_type, granularity_strategy, inputs_required and inputs_relevance
 * @param sourceDocs - The source documents to search within
 * @returns SelectAnchorResult discriminated union indicating the selection outcome
 * @throws Error when multiple documents have identical highest relevance (ambiguous)
 * @throws Error when required document input has no relevance score
 * @throws Error for unhandled scenarios (no fallback/default logic)
 */
export function selectAnchorSourceDocument(
    recipeStep: DialecticRecipeStep,
    sourceDocs: SourceDocument[]
): SelectAnchorResult {
    // Extract decision tree parameters
    const jobType = recipeStep.job_type;
    const outputType = recipeStep.output_type;
    const granularityStrategy = recipeStep.granularity_strategy;
    const inputsRequired = recipeStep.inputs_required;

    // Extract document-type inputs and header_context inputs from inputs_required
    const documentInputs: InputRule[] = [];
    const headerContextInputs: InputRule[] = [];
    if (Array.isArray(inputsRequired)) {
        for (const rule of inputsRequired) {
            if (rule && typeof rule.slug === 'string' && rule.slug.length > 0) {
                if (rule.type === 'document') {
                    documentInputs.push(rule);
                } else if (rule.type === 'header_context') {
                    headerContextInputs.push(rule);
                }
            }
        }
    }

    // Decision tree implementation
    
    // 94.d.ii: IF job_type == 'PLAN' AND granularity_strategy == 'all_to_one' → return 'no_anchor_required'
    if (jobType === 'PLAN' && granularityStrategy === 'all_to_one') {
        return { status: 'no_anchor_required' };
    }

    // Check for consolidation scenario: EXECUTE with per_model granularity (bundling all inputs)
    // 94.c.viii: Synthesis Step 3 (consolidation/merge) → return 'no_anchor_required'
    if (jobType === 'EXECUTE' && granularityStrategy === 'per_model') {
        return { status: 'no_anchor_required' };
    }

    // 94.d.iii: IF job_type == 'PLAN' AND other granularity → find anchor from inputs for lineage
    // 94.d.iv: IF job_type == 'EXECUTE' with doc inputs → return 'anchor_found' with highest relevance
    // 94.c.vii: EXECUTE with doc inputs AND header_context output → still return 'anchor_found' for lineage tracking (if found)
    // 94.c.v: EXECUTE producing header_context (not document) → return 'no_anchor_required' (if anchor not found, because output is header_context not a document)
    // Check for document inputs and handle EXECUTE + header_context output specially
    if (documentInputs.length > 0) {
        // Proceed to document selection logic below (will handle both PLAN and EXECUTE with doc inputs)
        // Special case for EXECUTE + header_context output is handled after anchor search
    } else {
        // No document inputs available
        
        // 94.d.v: IF job_type == 'EXECUTE' with only header_context input (no document inputs) → return 'derive_from_header_context'
        if (jobType === 'EXECUTE' && headerContextInputs.length > 0) {
            return { status: 'derive_from_header_context' };
        }

        // 94.d.vi: IF job_type == 'EXECUTE' AND output_type == 'header_context' AND no doc inputs → return 'no_anchor_required'
        if (jobType === 'EXECUTE' && outputType === FileType.HeaderContext) {
            return { status: 'no_anchor_required' };
        }

        // No document inputs and no other matching case - throw error instead of fallback
        throw new Error(`selectAnchorSourceDocument: Unhandled scenario - job_type=${jobType}, granularity_strategy=${granularityStrategy}, output_type=${outputType}, no document inputs available`);
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

    console.log(`[selectAnchorSourceDocument] Searching for anchor: targetSlug=${targetSlug}, targetDocumentKey=${targetDocumentKey}, sourceDocs.length=${sourceDocs.length}`);

    for (const doc of sourceDocs) {
        console.log(`[selectAnchorSourceDocument] Checking doc: stage=${doc.stage}, file_name=${doc.file_name}, contribution_type=${doc.contribution_type}`);

        // Match stage/slug
        if (doc.stage !== targetSlug) {
            console.log(`[selectAnchorSourceDocument] Stage mismatch: doc.stage=${doc.stage} !== targetSlug=${targetSlug}`);
            continue;
        }

        // Match document_key or contribution_type
        if (targetDocumentKey && typeof targetDocumentKey === 'string') {
            // Extract document_key from filename (it's never set as a property)
            let docDocumentKey: string | undefined;
            if (doc.file_name && doc.storage_path) {
                const pathInfo = deconstructStoragePath({
                    storageDir: doc.storage_path,
                    fileName: doc.file_name,
                });
                docDocumentKey = pathInfo.documentKey;
                console.log(`[selectAnchorSourceDocument] Extracted documentKey from filename: ${docDocumentKey}`);
            }

            if (docDocumentKey === targetDocumentKey || doc.contribution_type === targetDocumentKey) {
                console.log(`[selectAnchorSourceDocument] Found matching anchor document: ${doc.file_name}`);
                // Set document_key on returned document for assertions
                const documentWithKey: SourceDocument = {
                    ...doc,
                    document_key: docDocumentKey,
                };
                return { status: 'anchor_found', document: documentWithKey };
            } else {
                console.log(`[selectAnchorSourceDocument] Document key mismatch: docDocumentKey=${docDocumentKey}, targetDocumentKey=${targetDocumentKey}, contribution_type=${doc.contribution_type}`);
            }
        }
    }

    console.log(`[selectAnchorSourceDocument] No matching anchor found after checking all ${sourceDocs.length} documents`);

    // No matching document found
    // Special case: 94.c.v - EXECUTE producing header_context (not document) → return 'no_anchor_required'
    // because header_context output doesn't strictly require an anchor (unlike document outputs)
    const isExecuteWithHeaderContextOutput = jobType === 'EXECUTE' && outputType === FileType.HeaderContext;
    if (isExecuteWithHeaderContextOutput) {
        return { status: 'no_anchor_required' };
    }

    // Otherwise return error result (no fallback)
    return { status: 'anchor_not_found', targetSlug: targetSlug, targetDocumentKey: targetDocumentKey };
} 