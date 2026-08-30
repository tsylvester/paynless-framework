import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  CompressionCandidate,
  GetSortedCompressionCandidatesDeps,
  GetSortedCompressionCandidatesParams,
  GetSortedCompressionCandidatesPayload,
  GetSortedCompressionCandidatesSuccessReturn,
  GetSortedCompressionCandidatesErrorReturn,
  GetSortedCompressionCandidatesReturn,
  GetSortedCompressionCandidatesFn,
  BoundGetSortedCompressionCandidatesFn,
} from "./vector_utils.interface.ts";

/** Contract: CompressionCandidate requires exactly id, content, sourceType, originalIndex, valueScore, effectiveScore, and tokenCount. */
Deno.test("CompressionCandidate has the required surface", () => {
  const surface: Record<keyof CompressionCandidate, true> = {
    id: true,
    content: true,
    sourceType: true,
    originalIndex: true,
    valueScore: true,
    effectiveScore: true,
    tokenCount: true,
  };
  assert(Object.keys(surface).length === 7);
});

/** Contract: CompressionCandidate['sourceType'] admits every CompressionSourceType member. */
Deno.test("CompressionCandidate['sourceType'] admits contribution, resource, feedback, and history", () => {
  const contribution: CompressionCandidate['sourceType'] = 'contribution';
  const resource: CompressionCandidate['sourceType'] = 'resource';
  const feedback: CompressionCandidate['sourceType'] = 'feedback';
  const history: CompressionCandidate['sourceType'] = 'history';
  assert(contribution === 'contribution');
  assert(resource === 'resource');
  assert(feedback === 'feedback');
  assert(history === 'history');
});

/** Contract: GetSortedCompressionCandidatesDeps requires exactly logger, countTokens, and resolveCompressionSource. */
Deno.test("GetSortedCompressionCandidatesDeps has the required surface", () => {
  const surface: Record<keyof GetSortedCompressionCandidatesDeps, true> = {
    logger: true,
    countTokens: true,
    resolveCompressionSource: true,
  };
  assert(Object.keys(surface).length === 3);
});

/** Contract: GetSortedCompressionCandidatesParams requires exactly inputsRelevance and modelConfig. */
Deno.test("GetSortedCompressionCandidatesParams has the required surface", () => {
  const surface: Record<keyof GetSortedCompressionCandidatesParams, true> = {
    inputsRelevance: true,
    modelConfig: true,
  };
  assert(Object.keys(surface).length === 2);
});

/** Contract: GetSortedCompressionCandidatesPayload requires exactly documents and history. */
Deno.test("GetSortedCompressionCandidatesPayload has the required surface", () => {
  const surface: Record<keyof GetSortedCompressionCandidatesPayload, true> = {
    documents: true,
    history: true,
  };
  assert(Object.keys(surface).length === 2);
});

/** Contract: GetSortedCompressionCandidatesSuccessReturn requires exactly candidates. */
Deno.test("GetSortedCompressionCandidatesSuccessReturn has the required surface", () => {
  const surface: Record<keyof GetSortedCompressionCandidatesSuccessReturn, true> = {
    candidates: true,
  };
  assert(Object.keys(surface).length === 1);
});

/** Contract: GetSortedCompressionCandidatesErrorReturn requires exactly error and retriable. */
Deno.test("GetSortedCompressionCandidatesErrorReturn has the required surface", () => {
  const surface: Record<keyof GetSortedCompressionCandidatesErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assert(Object.keys(surface).length === 2);
});

/** Contract: GetSortedCompressionCandidatesSuccessReturn is a member of GetSortedCompressionCandidatesReturn. */
Deno.test("GetSortedCompressionCandidatesSuccessReturn is a member of GetSortedCompressionCandidatesReturn", () => {
  const success: GetSortedCompressionCandidatesSuccessReturn = {
    candidates: [],
  };
  const result: GetSortedCompressionCandidatesReturn = success;
  assert(result === success);
});

/** Contract: GetSortedCompressionCandidatesErrorReturn is a member of GetSortedCompressionCandidatesReturn. */
Deno.test("GetSortedCompressionCandidatesErrorReturn is a member of GetSortedCompressionCandidatesReturn", () => {
  const error: GetSortedCompressionCandidatesErrorReturn = {
    error: new Error("contract error"),
    retriable: false,
  };
  const result: GetSortedCompressionCandidatesReturn = error;
  assert(result === error);
});

/** Contract: GetSortedCompressionCandidatesFn's declared Promise return admits its success arm. */
Deno.test("GetSortedCompressionCandidatesFn resolves to its declared success type", () => {
  const success: GetSortedCompressionCandidatesSuccessReturn = {
    candidates: [],
  };
  const returned: ReturnType<GetSortedCompressionCandidatesFn> = Promise.resolve(success);
  const declared: Promise<GetSortedCompressionCandidatesReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: GetSortedCompressionCandidatesFn's declared Promise return admits its error arm. */
Deno.test("GetSortedCompressionCandidatesFn resolves to its declared error type", () => {
  const error: GetSortedCompressionCandidatesErrorReturn = {
    error: new Error("contract error"),
    retriable: false,
  };
  const returned: ReturnType<GetSortedCompressionCandidatesFn> = Promise.resolve(error);
  const declared: Promise<GetSortedCompressionCandidatesReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: BoundGetSortedCompressionCandidatesFn's declared Promise return admits its success arm. */
Deno.test("BoundGetSortedCompressionCandidatesFn resolves to its declared success type", () => {
  const success: GetSortedCompressionCandidatesSuccessReturn = {
    candidates: [],
  };
  const returned: ReturnType<BoundGetSortedCompressionCandidatesFn> = Promise.resolve(success);
  const declared: Promise<GetSortedCompressionCandidatesReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: BoundGetSortedCompressionCandidatesFn's declared Promise return admits its error arm. */
Deno.test("BoundGetSortedCompressionCandidatesFn resolves to its declared error type", () => {
  const error: GetSortedCompressionCandidatesErrorReturn = {
    error: new Error("contract error"),
    retriable: false,
  };
  const returned: ReturnType<BoundGetSortedCompressionCandidatesFn> = Promise.resolve(error);
  const declared: Promise<GetSortedCompressionCandidatesReturn> = returned;
  assert(declared instanceof Promise);
});
