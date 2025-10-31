// supabase/functions/_shared/utils/vector_utils.ts

import { type SourceDocument, type RelevanceRule } from '../../dialectic-service/dialectic.interface.ts';
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
        inputsRelevance?: RelevanceRule[],
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
    effectiveScore: number;
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
            effectiveScore: relevance,
        });
    }
    return scoredDocuments;
}

/**
 * Scores compressible portions of the conversation history.
 *
 * Immutable anchors are preserved based on their position:
 *  - Head: The first message if it's a system prompt, plus the next two messages (the first full user/assistant turn).
 *  - Tail: The last four messages of the conversation.
 */
export function scoreHistory(
    history: Messages[],
): CompressionCandidate[] {
    // Determine the number of immutable messages at the start of the conversation.
    let immutableHeadCount = 0;
    if (history.length > 0 && history[0].role === 'system') {
        immutableHeadCount = 3; // System prompt + first user turn (user + assistant)
    } else {
        immutableHeadCount = 2; // First user turn (user + assistant)
    }

    const immutableTailCount = 4;
    const totalLength = history.length;

    // If the history is too short to have any compressible messages between the head and tail, return empty.
    if (totalLength <= immutableHeadCount + immutableTailCount) {
        return [];
    }

    // Identify the indices of messages that are candidates for compression.
    const candidateIndices: number[] = [];
    for (let i = immutableHeadCount; i < totalLength - immutableTailCount; i++) {
        candidateIndices.push(i);
    }

    if (candidateIndices.length === 0) return [];

    return candidateIndices.map((originalIndex, relativeIndex) => {
        // Normalize value score across candidates: oldest (first) -> 0, newest (last) -> 1
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
            effectiveScore: valueScore,
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
    inputsRelevance?: RelevanceRule[],
): Promise<CompressionCandidate[]> {
    const documentCandidates = await scoreResourceDocuments(deps, documents, currentUserPrompt);
    const historyCandidates = scoreHistory(history);

    // Build a quick lookup for matrix relevance: key -> weight (0..1)
    // Key formats (no fallbacks): `${type}:${document_key}` or `${type}:${document_key}:${stage_slug}`
    const relevanceMap: Record<string, number> = {};
    if (inputsRelevance && Array.isArray(inputsRelevance)) {
        for (const rule of inputsRelevance) {
            const key = rule.stage_slug
                ? `${rule.type}:${rule.document_key}:${rule.stage_slug}`
                : `${rule.type}:${rule.document_key}`;
            // If multiple rules map to same key, keep the max relevance (normalized 0..1)
            relevanceMap[key] = Math.max(
                relevanceMap[key] ?? 0,
                Math.max(0, Math.min(1, rule.relevance)),
            );
        }
    }

    // Helper to compute an effective score for a document candidate using matrix weighting
    function getEffectiveScoreForDocumentCandidate(candidate: CompressionCandidate, correspondingDoc: SourceDocument): number {
        const baseSimilarity = candidate.valueScore; // cosine similarity already computed

        // Identity: require document_key and type; stage_slug is only used if a rule provides it.
        const documentKey = correspondingDoc.document_key;
        const type = correspondingDoc.type;
        const stageSlug = correspondingDoc.stage_slug;

        // If matrix weighting is provided but identity is missing, do not guess — skip weighting.
        if ((inputsRelevance && inputsRelevance.length > 0) && (!documentKey || !type)) {
            return baseSimilarity;
        }

        // Try stage-specific key first (only matches if a rule was defined with stage_slug),
        // then general key without stage (no fallbacks to other identity sources).
        let relevanceWeight = 0;
        if (documentKey && type) {
            const stageKey = stageSlug ? `${type}:${documentKey}:${stageSlug}` : undefined;
            if (stageKey && relevanceMap[stageKey] !== undefined) {
                relevanceWeight = relevanceMap[stageKey];
            } else {
                const generalKey = `${type}:${documentKey}`;
                if (relevanceMap[generalKey] !== undefined) {
                    relevanceWeight = relevanceMap[generalKey];
                }
            }
        }

        // Corrected formula: effectiveScore = relevance × (1 - similarity)
        // Higher relevance increases preservation; higher similarity increases compressibility.
        const effectiveScore = relevanceWeight * (1 - baseSimilarity);
        return effectiveScore;
    }

    // Attach effectiveScore to each candidate (single source of truth)
    const allCandidates: CompressionCandidate[] = [...documentCandidates, ...historyCandidates].map((c) => {
        if (c.sourceType === 'document') {
            const doc = documents.find(d => d.id === c.id);
            const eff = doc ? getEffectiveScoreForDocumentCandidate(c, doc) : c.valueScore;
            return { ...c, effectiveScore: eff };
        }
        // history candidates already have effectiveScore = valueScore from scoreHistory
        return c;
    });

    // Get the IDs of all potential candidates
    const candidateIds = allCandidates.map(c => c.id);

    // Query the database to find out which of these candidates are already indexed
    // Diagnostic-only query; do not exclude indexed items from compression candidates.
    // We keep all candidates so RAG can replace bulky text even when items are already indexed.
    const { error } = await dbClient
        .from('dialectic_memory')
        .select('source_contribution_id')
        .in('source_contribution_id', candidateIds);
    if (error) {
        deps.logger?.warn('Non-fatal: error fetching indexed chunks from dialectic_memory (diagnostic only)', { error });
    }

    const sortedCandidates = allCandidates
        // Ascending order: compress lowest effectiveScore first
        .sort((a, b) => a.effectiveScore - b.effectiveScore);

    // Diagnostics include effectiveScore and identity fields when available (document candidates)
    const debugPayload = sortedCandidates.map((c) => {
        if (c.sourceType === 'document') {
            const doc = documents.find(d => d.id === c.id);
            const documentKey = doc?.document_key ?? null;
            const docType = doc?.type ?? null;
            const stageSlug = doc?.stage_slug ?? null;
            return {
                id: c.id,
                type: c.sourceType,
                valueScore: c.valueScore,
                effectiveScore: c.effectiveScore,
                document_key: documentKey,
                doc_type: docType,
                stage_slug: stageSlug,
            };
        }
        return { id: c.id, type: c.sourceType, valueScore: c.valueScore, effectiveScore: c.effectiveScore };
    });
    console.log('[DEBUG] getSortedCompressionCandidates - Final Sorted Candidates:', JSON.stringify(debugPayload, null, 2));

    return sortedCandidates;
}





