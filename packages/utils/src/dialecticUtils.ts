import type { FocusedStageDocumentState } from '@paynless/types';

/**
 * Builds a focused document key from session ID, stage slug, and model ID.
 * 
 * The key format is: `${sessionId}:${stageSlug}:${modelId}`
 * This key is used to uniquely identify a focused document in the context of
 * a specific session, stage, and model combination.
 * 
 * @param sessionId - The session identifier.
 * @param stageSlug - The stage slug identifier.
 * @param modelId - The model identifier.
 * @returns A string in the format `${sessionId}:${stageSlug}:${modelId}`.
 */
export const buildFocusedDocumentKey = (sessionId: string, stageSlug: string, modelId: string): string =>
  `${sessionId}:${stageSlug}:${modelId}`;

/**
 * Determines if a document is highlighted in the StageRunChecklist.
 * 
 * This function matches the highlighting logic used in StageRunChecklist component.
 * A document is considered highlighted when:
 * 1. All required parameters (sessionId, stageSlug, modelId) are truthy
 * 2. The focusKey exists in the focusedStageDocumentMap
 * 3. The documentKey in the map entry matches the provided documentKey
 * 
 * @param sessionId - The session identifier.
 * @param stageSlug - The stage slug identifier.
 * @param modelId - The model identifier.
 * @param documentKey - The document key to check for highlighting.
 * @param focusedStageDocumentMap - A map of focus keys to focused document states, or null/undefined.
 * @returns `true` if the document is highlighted, `false` otherwise.
 */
export const isDocumentHighlighted = (
  sessionId: string,
  stageSlug: string,
  modelId: string,
  documentKey: string,
  focusedStageDocumentMap?: Record<string, FocusedStageDocumentState | null> | null,
): boolean => {
  // Check if all required parameters are truthy
  if (!sessionId || !stageSlug || !modelId) {
    return false;
  }

  // Check if focusedStageDocumentMap exists
  if (!focusedStageDocumentMap) {
    return false;
  }

  // Build the focus key
  const focusKey = buildFocusedDocumentKey(sessionId, stageSlug, modelId);

  // Check if the focusKey exists in the map and the documentKey matches
  return focusedStageDocumentMap[focusKey]?.documentKey === documentKey;
};

