// supabase/functions/_shared/utils/vector_utils.ts

import type {
  CompressionCandidate,
  GetSortedCompressionCandidatesDeps,
  GetSortedCompressionCandidatesParams,
  GetSortedCompressionCandidatesPayload,
  GetSortedCompressionCandidatesSuccessReturn,
  GetSortedCompressionCandidatesErrorReturn,
  GetSortedCompressionCandidatesFn,
} from './vector_utils.interface.ts';
import type { Messages } from '../../types.ts';
import {
  isCompressibleSourceReturn,
  isResolveCompressionSourceErrorReturn,
} from '../resolveCompressionSource/resolveCompressionSource.provides.ts';

/**
 * Scores compressible portions of the conversation history.
 *
 * Immutable anchors are preserved based on their position:
 *  - Head: The first message if it's a system prompt, plus the next two messages (the first full user/assistant turn).
 *  - Tail: The last four messages of the conversation.
 */
export function scoreHistory(
  deps: GetSortedCompressionCandidatesDeps,
  params: GetSortedCompressionCandidatesParams,
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
    const candidateTokens = deps.countTokens({ messages: [message] }, params.modelConfig);
    return {
      id: message.id!,
      content: message.content || '',
      sourceType: 'history',
      originalIndex,
      valueScore,
      tokenCount: candidateTokens,
      effectiveScore: candidateTokens * valueScore,
    };
  });
}

/**
 * Creates a unified list of all compression candidates (documents and history),
 * sorted ascending by effectiveScore so the cheapest and least important
 * candidate compresses first.
 */
export const getSortedCompressionCandidates: GetSortedCompressionCandidatesFn = async (
  deps,
  params,
  payload,
) => {
  const { documents, history } = payload;
  const { inputsRelevance } = params;

  // Build a quick lookup for matrix relevance: key -> weight (0..1)
  // Key formats (no fallbacks): `${type}:${document_key}` or `${type}:${document_key}:${stage_slug}`
  const relevanceMap: Record<string, number> = {};
  if (inputsRelevance && Array.isArray(inputsRelevance)) {
    for (const rule of inputsRelevance) {
      const key = rule.slug
        ? `${rule.type}:${rule.document_key}:${rule.slug}`
        : `${rule.type}:${rule.document_key}`;
      // If multiple rules map to same key, keep the max relevance (normalized 0..1)
      relevanceMap[key] = Math.max(
        relevanceMap[key] ?? 0,
        Math.max(0, Math.min(1, rule.relevance)),
      );
    }
  }

  // Pass one: resolve admission and collect matched relevances.
  type AdmittedDoc = {
    doc: typeof documents[number];
    sourceType: CompressionCandidate['sourceType'];
    originalIndex: number;
    matchedRelevance: number | undefined;
  };
  const admittedDocs: AdmittedDoc[] = [];
  const matchedRelevances: number[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const resolved = deps.resolveCompressionSource({}, { document: doc });

    if (isResolveCompressionSourceErrorReturn(resolved)) {
      const errorReturn: GetSortedCompressionCandidatesErrorReturn = {
        error: resolved.error,
        retriable: resolved.retriable,
      };
      return errorReturn;
    }

    if (!isCompressibleSourceReturn(resolved)) {
      // Not-compressible arm: drop the document before scoring.
      continue;
    }

    // Compressible arm: look up importance in the relevance map.
    const stageKey = doc.stage_slug
      ? `${doc.type}:${doc.document_key}:${doc.stage_slug}`
      : undefined;
    let matchedRelevance: number | undefined;
    if (stageKey && relevanceMap[stageKey] !== undefined) {
      matchedRelevance = relevanceMap[stageKey];
    } else {
      const generalKey = `${doc.type}:${doc.document_key}`;
      if (relevanceMap[generalKey] !== undefined) {
        matchedRelevance = relevanceMap[generalKey];
      }
    }

    if (matchedRelevance !== undefined) {
      matchedRelevances.push(matchedRelevance);
    }

    admittedDocs.push({ doc, sourceType: resolved.sourceType, originalIndex: i, matchedRelevance });
  }

  // Compute the fallback importance for unmatched documents.
  const avgMatchedRelevance = matchedRelevances.length > 0
    ? matchedRelevances.reduce((sum, r) => sum + r, 0) / matchedRelevances.length
    : 0;
  const unmatchedImportance = matchedRelevances.length > 0
    ? avgMatchedRelevance / 2
    : 1;

  // Pass two: score each admitted document.
  const documentCandidates: CompressionCandidate[] = admittedDocs.map(({ doc, sourceType, originalIndex, matchedRelevance }) => {
    const candidateTokens = deps.countTokens(
      { resourceDocuments: [{ id: doc.id, content: doc.content }] },
      params.modelConfig,
    );

    const importance = matchedRelevance !== undefined
      ? matchedRelevance
      : unmatchedImportance;

    return {
      id: doc.id,
      content: doc.content,
      sourceType,
      originalIndex,
      valueScore: importance,
      tokenCount: candidateTokens,
      effectiveScore: candidateTokens * importance,
    };
  });

  const historyCandidates = scoreHistory(deps, params, history);

  const allCandidates: CompressionCandidate[] = [...documentCandidates, ...historyCandidates];
  const sortedCandidates = allCandidates.sort((a, b) => a.effectiveScore - b.effectiveScore);

  const successReturn: GetSortedCompressionCandidatesSuccessReturn = {
    candidates: sortedCandidates,
  };
  return successReturn;
};
