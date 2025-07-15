import type { FinishReason } from '../types.ts';

/**
 * Determines whether a continuation call to an AI provider should be made.
 *
 * @param finishReason The `finish_reason` from the last AI response.
 * @param continuationCount The number of continuation calls already made (0-indexed).
 * @param maxContinuations The maximum number of additional calls allowed.
 * @returns `true` if another call should be made, otherwise `false`.
 */
export function shouldContinue(
  finishReason: FinishReason,
  continuationCount: number,
  maxContinuations: number,
): boolean {
  if (continuationCount >= maxContinuations) {
    return false;
  }

  return finishReason === 'length';
} 