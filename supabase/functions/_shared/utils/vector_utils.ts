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
 * Scores the "middle" of a conversation history. A lower score is worse (older).
 * The first 3 messages (system, user, assistant) are considered immutable.
 * The last 2 messages (user, assistant) are considered immutable.
 */
export function scoreHistory(
    history: Messages[],
    immutableTailCount = 3,
): CompressionCandidate[] {
    const immutableHeadCount = 3;
    // The first 3 and last 3 messages are immutable.
    if (history.length <= immutableHeadCount + immutableTailCount) {
        return [];
    }

    const mutablePart = history.slice(immutableHeadCount, -immutableTailCount);

    return mutablePart.map((message, index) => {
        // Normalize the score: oldest (index 0) is 0, newest is 1.
        const valueScore = mutablePart.length > 1 
            ? index / (mutablePart.length - 1) 
            : 0; 
            
        return {
            id: message.id!,
            content: message.content || '',
            sourceType: 'history',
            originalIndex: index + immutableHeadCount, // Adjust for the initial slice
            valueScore: valueScore,
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


