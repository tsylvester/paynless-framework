import { isRecord } from './type_guards.ts';

/**
 * Extracts a source document identifier from either a job payload or a SourceDocument.
 * 
 * The identifier is used to track which source documents have completed jobs,
 * enabling selective re-planning that preserves completed work.
 * 
 * Extraction logic:
 * - Extracts `document_relationships?.source_group` which MUST be present and non-empty
 * - Throws an error immediately if `source_group` is missing, undefined, null, or empty string
 * - No fallbacks, defaults, or silent healing (fail loud and hard)
 * - Returns `null` only if input is not a record (invalid input type)
 * 
 * @param input - Either a job payload or a SourceDocument, both must have `document_relationships.source_group` present and non-empty
 * @returns The extracted identifier string, or `null` if input is not a record
 * @throws Error if `document_relationships` is missing, null, or if `source_group` is missing, undefined, null, or empty string
 */
export function extractSourceDocumentIdentifier(input: unknown): string | null {
    if (!isRecord(input)) {
        return null;
    }
    
    // Require document_relationships to be present and be a record
    if (!isRecord(input.document_relationships)) {
        throw new Error('extractSourceDocumentIdentifier requires document_relationships to be present and non-null. source_group is required for source document identification.');
    }
    
    // Require source_group to be present, non-null, and non-empty
    const sourceGroup = input.document_relationships.source_group;
    if (typeof sourceGroup !== 'string' || sourceGroup.length === 0) {
        throw new Error('extractSourceDocumentIdentifier requires document_relationships.source_group to be a non-empty string. source_group is required for source document identification.');
    }
    
    return sourceGroup;
}

