// supabase/functions/_shared/utils/vector_utils.ts

import { type SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { type ILogger, type Messages } from '../types.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../../types_db.ts';
import { IEmbeddingClient } from '../services/indexing_service.interface.ts';

// --- START: Self-Contained Interfaces for Compression ---

/**
 * Defines the specific dependencies required by the compression scoring logic.
 * This avoids a circular dependency on ExecuteModelCallAndSaveParams.
 */
export interface CompressionDeps {
    embeddingClient?: IEmbeddingClient;
    logger?: ILogger;
}

/**
 * Defines the function signature for a compression strategy.
 */
export interface ICompressionStrategy {
    (
        dbClient: SupabaseClient<Database>,
        deps: CompressionDeps,
        documents: SourceDocument[],
        history: Messages[],
        currentUserPrompt: string,
    ): Promise<CompressionCandidate[]>;
}

// --- END: Self-Contained Interfaces for Compression ---

/**
 * Calculates the dot product of two vectors.
 * @param vecA - The first vector.
 * @param vecB - The second vector.
 * @returns The dot product.
 */
function dotProduct(vecA: number[], vecB: number[]): number {
    let product = 0;
    for (let i = 0; i < vecA.length; i++) {
        product += vecA[i] * vecB[i];
    }
    return product;
}

/**
 * Calculates the magnitude (L2 norm) of a vector.
 * @param vec - The vector.
 * @returns The magnitude of the vector.
 */
function magnitude(vec: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
        sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
}

/**
 * Calculates the cosine similarity between two vectors.
 * @param vecA - The first vector.
 * @param vecB - The second vector.
 * @returns The cosine similarity, a value between -1 and 1.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) {
        return 0;
    }

    const A = dotProduct(vecA, vecB);
    const B = magnitude(vecA);
    const C = magnitude(vecB);

    if (B === 0 || C === 0) {
        return 0;
    }

    return A / (B * C);
}

// --- Types for Compression Logic ---

export type CompressionCandidate = {
    id: string;
    content: string;
    sourceType: 'history' | 'document';
    originalIndex: number;
    valueScore: number;
};

// --- Helper Functions for Compression ---

/**
 * Scores resource documents based on their relevance to the current user prompt.
 * A lower score is worse (less relevant).
 */
export async function scoreResourceDocuments(
    deps: CompressionDeps,
    documents: SourceDocument[],
    currentUserPrompt: string,
): Promise<CompressionCandidate[]> {
    if (!deps.embeddingClient) {
        throw new Error("Embedding client is required for scoring resource documents.");
    }
    if (documents.length === 0) return [];

    const promptEmbeddingResponse = await deps.embeddingClient.getEmbedding(currentUserPrompt);

    const scoredDocuments: CompressionCandidate[] = [];

    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        if (!doc.id || !doc.content) continue;

        const docEmbeddingResponse = await deps.embeddingClient.getEmbedding(doc.content);
        const relevance = cosineSimilarity(promptEmbeddingResponse.embedding, docEmbeddingResponse.embedding);
        
        scoredDocuments.push({
            id: doc.id,
            content: doc.content,
            sourceType: 'document',
            originalIndex: i,
            valueScore: relevance,
        });
    }
    return scoredDocuments;
}

/**
 * Scores compressible portions of the conversation history.
 *
 * Immutable by position (compatibility with existing tests):
 *  - First 3 messages (typically system, seed user, first assistant)
 *  - Last 3 messages by index
 *
 * Immutable by role (role-aware anchors):
 *  - First user message (seed prompt)
 *  - First assistant reply that follows the seed
 *  - Last two assistant replies
 *  - Final user message if exactly 'Please continue.'
 */
export function scoreHistory(
    history: Messages[],
    immutableTailCount = 3,
): CompressionCandidate[] {
    const immutableHeadCount = 3;
    const totalLength = history.length;

    // Positional immutables guard
    if (totalLength <= immutableHeadCount + immutableTailCount) {
        return [];
    }

    // Candidate window by position (exclude head/tail blocks)
    const candidateStart = immutableHeadCount;
    const candidateEndExclusive = totalLength - immutableTailCount;

    // Compute role-aware anchors to exclude from candidates
    const excludedIndices = new Set<number>();

    // Anchor: first user (seed)
    const firstUserIdx = history.findIndex(m => m.role === 'user');
    if (firstUserIdx >= 0) excludedIndices.add(firstUserIdx);

    // Anchor: first assistant after seed
    if (firstUserIdx >= 0) {
        const afterSeedAssistantRel = history.slice(firstUserIdx + 1).findIndex(m => m.role === 'assistant');
        if (afterSeedAssistantRel >= 0) {
            const idx = firstUserIdx + 1 + afterSeedAssistantRel;
            excludedIndices.add(idx);
        }
    }

    // Anchor: last two assistant replies
    const assistantIndices: number[] = [];
    for (let i = 0; i < totalLength; i++) {
        if (history[i].role === 'assistant') assistantIndices.push(i);
    }
    if (assistantIndices.length >= 1) excludedIndices.add(assistantIndices[assistantIndices.length - 1]);
    if (assistantIndices.length >= 2) excludedIndices.add(assistantIndices[assistantIndices.length - 2]);

    // Anchor: final user 'Please continue.'
    for (let i = totalLength - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === 'user') {
            const content = (msg.content || '').trim();
            if (content === 'Please continue.') {
                excludedIndices.add(i);
            }
            break; // only inspect the final user message
        }
    }

    // Build candidate list excluding role-aware anchors
    const candidateIndices: number[] = [];
    for (let i = candidateStart; i < candidateEndExclusive; i++) {
        if (!excludedIndices.has(i)) candidateIndices.push(i);
    }

    if (candidateIndices.length === 0) return [];

    return candidateIndices.map((originalIndex, relativeIndex) => {
        // Normalize value score across candidates: oldest (first in window) -> 0, newest -> 1
        const valueScore = candidateIndices.length > 1
            ? relativeIndex / (candidateIndices.length - 1)
            : 0;

        const message = history[originalIndex];
        return {
            id: message.id!,
            content: message.content || '',
            sourceType: 'history',
            originalIndex,
            valueScore,
        };
    });
}

/**
 * Creates a unified list of all compression candidates (documents and history)
 */
export async function getSortedCompressionCandidates(
    dbClient: SupabaseClient<Database>,
    deps: CompressionDeps,
    documents: SourceDocument[],
    history: Messages[],
    currentUserPrompt: string,
): Promise<CompressionCandidate[]> {
    const documentCandidates = await scoreResourceDocuments(deps, documents, currentUserPrompt);
    const historyCandidates = scoreHistory(history);

    const allCandidates = [...documentCandidates, ...historyCandidates];

    // Get the IDs of all potential candidates
    const candidateIds = allCandidates.map(c => c.id);

    // Query the database to find out which of these candidates are already indexed
    const { data: indexedChunks, error } = await dbClient
        .from('dialectic_memory')
        .select('source_contribution_id')
        .in('source_contribution_id', candidateIds);

    if (error) {
        deps.logger?.error('Error fetching indexed chunks from dialectic_memory', { error });
        // Depending on desired behavior, you might want to return all candidates or an empty array
        return []; 
    }

    const indexedIds = new Set(indexedChunks.map(chunk => chunk.source_contribution_id));

    // Filter out the candidates that have already been indexed
    const unindexedCandidates = allCandidates.filter(candidate => !indexedIds.has(candidate.id));
    
    const sortedCandidates = unindexedCandidates.sort((a, b) => a.valueScore - b.valueScore);

    console.log('[DEBUG] getSortedCompressionCandidates - Final Sorted Candidates:', JSON.stringify(sortedCandidates.map(c => ({ id: c.id, score: c.valueScore, type: c.sourceType })), null, 2));

    return sortedCandidates;
}


