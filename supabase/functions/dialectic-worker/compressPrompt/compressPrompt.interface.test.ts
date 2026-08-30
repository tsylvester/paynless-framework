// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.interface.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptDeps,
  CompressPromptErrorReturn,
  CompressPromptFitsReturn,
  CompressPromptFn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptPendingReturn,
  CompressPromptReturn,
  CompressPromptSuccessReturn,
} from "./compressPrompt.interface.ts";

/** Contract: CompressPromptDeps requires exactly logger, getSortedCompressionCandidates, enqueueCompressJobs, resolveCompressionSource, constructStoragePath, downloadFromStorage, countTokens. */
Deno.test("CompressPromptDeps has the required surface of seven members", () => {
  const surface: Record<keyof CompressPromptDeps, true> = {
    logger: true,
    getSortedCompressionCandidates: true,
    enqueueCompressJobs: true,
    resolveCompressionSource: true,
    constructStoragePath: true,
    downloadFromStorage: true,
    countTokens: true,
  };
  assertEquals(Object.keys(surface).length, 7);
});

/** Contract: CompressPromptParams requires exactly dbClient, isContinuationFlowInitial, finalTargetThreshold, balanceAfterCompression, walletBalance. */
Deno.test("CompressPromptParams has the required surface of five members", () => {
  const surface: Record<keyof CompressPromptParams, true> = {
    dbClient: true,
    isContinuationFlowInitial: true,
    finalTargetThreshold: true,
    balanceAfterCompression: true,
    walletBalance: true,
  };
  assertEquals(Object.keys(surface).length, 5);
});

/** Contract: CompressPromptPayload requires exactly parentJob, extendedModelConfig, inputsRelevance, resourceDocuments, conversationHistory, currentUserPrompt. */
Deno.test("CompressPromptPayload has the required surface of six members", () => {
  const surface: Record<keyof CompressPromptPayload, true> = {
    parentJob: true,
    extendedModelConfig: true,
    inputsRelevance: true,
    resourceDocuments: true,
    conversationHistory: true,
    currentUserPrompt: true,
  };
  assertEquals(Object.keys(surface).length, 6);
});

/** Contract: CompressPromptFitsReturn and CompressPromptPendingReturn each assign to CompressPromptSuccessReturn, which assigns to CompressPromptReturn; CompressPromptErrorReturn assigns to CompressPromptReturn — flavors nested inside the success arm, not beside it. */
Deno.test("CompressPromptReturn is the two-arm union with success flavors nested inside the success arm", () => {
  const fits: CompressPromptFitsReturn = {
    fits: true,
    resourceDocuments: [],
    conversationHistory: [],
    resolvedInputTokenCount: 0,
  };
  const pending: CompressPromptPendingReturn = { fits: false };

  const fitsAsSuccess: CompressPromptSuccessReturn = fits;
  const pendingAsSuccess: CompressPromptSuccessReturn = pending;

  const fitsAsReturn: CompressPromptReturn = fitsAsSuccess;
  const pendingAsReturn: CompressPromptReturn = pendingAsSuccess;

  const error: CompressPromptErrorReturn = {
    error: new Error("contract"),
    retriable: false,
  };
  const errorAsReturn: CompressPromptReturn = error;

  assert(fitsAsReturn === fits);
  assert(pendingAsReturn === pending);
  assert(errorAsReturn === error);
});

/** Contract: CompressPromptFitsReturn carries fits: true with resourceDocuments, conversationHistory, resolvedInputTokenCount; CompressPromptPendingReturn carries fits: false with no working-set members. */
Deno.test("CompressPromptSuccessReturn flavors carry their discriminated members", () => {
  const fits: CompressPromptFitsReturn = {
    fits: true,
    resourceDocuments: [],
    conversationHistory: [],
    resolvedInputTokenCount: 0,
  };
  const pending: CompressPromptPendingReturn = { fits: false };

  assertEquals(
    Object.keys(fits).sort(),
    ["conversationHistory", "fits", "resolvedInputTokenCount", "resourceDocuments"],
  );
  assertEquals(Object.keys(pending), ["fits"]);
});

/** Contract: CompressPromptFn and BoundCompressPromptFn resolve to Promise<CompressPromptReturn>, admitting both arms. */
Deno.test("CompressPromptFn and BoundCompressPromptFn resolve to Promise<CompressPromptReturn>", () => {
  const fits: CompressPromptFitsReturn = {
    fits: true,
    resourceDocuments: [],
    conversationHistory: [],
    resolvedInputTokenCount: 0,
  };
  const error: CompressPromptErrorReturn = {
    error: new Error("contract"),
    retriable: false,
  };

  const returnedFits: ReturnType<CompressPromptFn> = Promise.resolve(fits);
  const declaredFits: Promise<CompressPromptReturn> = returnedFits;
  const returnedError: ReturnType<CompressPromptFn> = Promise.resolve(error);
  const declaredError: Promise<CompressPromptReturn> = returnedError;

  const boundReturnedFits: ReturnType<BoundCompressPromptFn> = Promise.resolve(fits);
  const boundDeclaredFits: Promise<CompressPromptReturn> = boundReturnedFits;
  const boundReturnedError: ReturnType<BoundCompressPromptFn> = Promise.resolve(error);
  const boundDeclaredError: Promise<CompressPromptReturn> = boundReturnedError;

  assert(declaredFits instanceof Promise);
  assert(declaredError instanceof Promise);
  assert(boundDeclaredFits instanceof Promise);
  assert(boundDeclaredError instanceof Promise);
});
