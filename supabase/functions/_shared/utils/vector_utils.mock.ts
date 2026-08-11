// supabase/functions/_shared/utils/vector_utils.mock.ts

import type { CompressionCandidate } from "./vector_utils.ts";
import type { ICompressionStrategy } from "./vector_utils.interface.ts";

export const mockCompressionStrategy: ICompressionStrategy = async () => [];

export type CompressionCandidateOverrides = Partial<CompressionCandidate>;

export type CompressionCandidateCorruptions = { [K in keyof CompressionCandidate]?: unknown };

export function buildCompressionCandidate(
  overrides?: CompressionCandidateOverrides,
): CompressionCandidate {
  const base: CompressionCandidate = {
    id: "candidate-1",
    content: "candidate content",
    sourceType: "document",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressionCandidate(
  corruptions: CompressionCandidateCorruptions,
): unknown {
  return { ...buildCompressionCandidate(), ...corruptions };
}
