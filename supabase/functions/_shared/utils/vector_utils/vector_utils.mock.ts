// supabase/functions/_shared/utils/vector_utils.mock.ts

import type {
  CompressionCandidate,
  GetSortedCompressionCandidatesDeps,
  GetSortedCompressionCandidatesParams,
  GetSortedCompressionCandidatesPayload,
  GetSortedCompressionCandidatesSuccessReturn,
  GetSortedCompressionCandidatesErrorReturn,
  GetSortedCompressionCandidatesFn,
  BoundGetSortedCompressionCandidatesFn,
} from "./vector_utils.interface.ts";
import { MockLogger } from "../../logger.mock.ts";
import { mockBoundCountTokens } from "../tokenizer_utils.mock.ts";
import { buildExtendedModelConfig } from "../../ai_service/ai_provider.mock.ts";
import {
  buildResourceDocument,
  mockBoundResolveCompressionSource,
} from "../resolveCompressionSource/resolveCompressionSource.provides.ts";

export type CompressionCandidateOverrides = Partial<CompressionCandidate>;

export type CompressionCandidateCorruptions = { [K in keyof CompressionCandidate]?: unknown };

export function buildCompressionCandidate(
  overrides?: CompressionCandidateOverrides,
): CompressionCandidate {
  const base: CompressionCandidate = {
    id: "candidate-1",
    content: "candidate content",
    sourceType: "resource",
    originalIndex: 0,
    valueScore: 1,
    effectiveScore: 1,
    tokenCount: 10,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressionCandidate(
  corruptions: CompressionCandidateCorruptions,
): unknown {
  return { ...buildCompressionCandidate(), ...corruptions };
}

export type GetSortedCompressionCandidatesDepsOverrides = Partial<GetSortedCompressionCandidatesDeps>;

export function buildGetSortedCompressionCandidatesDeps(
  overrides?: GetSortedCompressionCandidatesDepsOverrides,
): GetSortedCompressionCandidatesDeps {
  const base: GetSortedCompressionCandidatesDeps = {
    logger: new MockLogger(),
    countTokens: mockBoundCountTokens,
    resolveCompressionSource: mockBoundResolveCompressionSource,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GetSortedCompressionCandidatesDepsCorruptions = { [K in keyof GetSortedCompressionCandidatesDeps]?: unknown };

export function invalidateGetSortedCompressionCandidatesDeps(
  corruptions: GetSortedCompressionCandidatesDepsCorruptions,
): unknown {
  return { ...buildGetSortedCompressionCandidatesDeps(), ...corruptions };
}

export type GetSortedCompressionCandidatesParamsOverrides = Partial<GetSortedCompressionCandidatesParams>;

export function buildGetSortedCompressionCandidatesParams(
  overrides?: GetSortedCompressionCandidatesParamsOverrides,
): GetSortedCompressionCandidatesParams {
  const base: GetSortedCompressionCandidatesParams = {
    inputsRelevance: [],
    modelConfig: buildExtendedModelConfig(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GetSortedCompressionCandidatesParamsCorruptions = { [K in keyof GetSortedCompressionCandidatesParams]?: unknown };

export function invalidateGetSortedCompressionCandidatesParams(
  corruptions: GetSortedCompressionCandidatesParamsCorruptions,
): unknown {
  return { ...buildGetSortedCompressionCandidatesParams(), ...corruptions };
}

export type GetSortedCompressionCandidatesPayloadOverrides = Partial<GetSortedCompressionCandidatesPayload>;

export function buildGetSortedCompressionCandidatesPayload(
  overrides?: GetSortedCompressionCandidatesPayloadOverrides,
): GetSortedCompressionCandidatesPayload {
  const base: GetSortedCompressionCandidatesPayload = {
    documents: [],
    history: [],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GetSortedCompressionCandidatesPayloadCorruptions = { [K in keyof GetSortedCompressionCandidatesPayload]?: unknown };

export function invalidateGetSortedCompressionCandidatesPayload(
  corruptions: GetSortedCompressionCandidatesPayloadCorruptions,
): unknown {
  return { ...buildGetSortedCompressionCandidatesPayload(), ...corruptions };
}

export type GetSortedCompressionCandidatesSuccessReturnOverrides = Partial<GetSortedCompressionCandidatesSuccessReturn>;

export function buildGetSortedCompressionCandidatesSuccessReturn(
  overrides?: GetSortedCompressionCandidatesSuccessReturnOverrides,
): GetSortedCompressionCandidatesSuccessReturn {
  const base: GetSortedCompressionCandidatesSuccessReturn = {
    candidates: [],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GetSortedCompressionCandidatesSuccessReturnCorruptions = { [K in keyof GetSortedCompressionCandidatesSuccessReturn]?: unknown };

export function invalidateGetSortedCompressionCandidatesSuccessReturn(
  corruptions: GetSortedCompressionCandidatesSuccessReturnCorruptions,
): unknown {
  return { ...buildGetSortedCompressionCandidatesSuccessReturn(), ...corruptions };
}

export type GetSortedCompressionCandidatesErrorReturnOverrides = Partial<GetSortedCompressionCandidatesErrorReturn>;

export function buildGetSortedCompressionCandidatesErrorReturn(
  overrides?: GetSortedCompressionCandidatesErrorReturnOverrides,
): GetSortedCompressionCandidatesErrorReturn {
  const base: GetSortedCompressionCandidatesErrorReturn = {
    error: new Error('getSortedCompressionCandidates failed'),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type GetSortedCompressionCandidatesErrorReturnCorruptions = { [K in keyof GetSortedCompressionCandidatesErrorReturn]?: unknown };

export function invalidateGetSortedCompressionCandidatesErrorReturn(
  corruptions: GetSortedCompressionCandidatesErrorReturnCorruptions,
): unknown {
  return { ...buildGetSortedCompressionCandidatesErrorReturn(), ...corruptions };
}

export const mockGetSortedCompressionCandidates: GetSortedCompressionCandidatesFn = async () => {
  return buildGetSortedCompressionCandidatesSuccessReturn();
};

export const mockBoundGetSortedCompressionCandidates: BoundGetSortedCompressionCandidatesFn = async () => {
  return buildGetSortedCompressionCandidatesSuccessReturn();
};
