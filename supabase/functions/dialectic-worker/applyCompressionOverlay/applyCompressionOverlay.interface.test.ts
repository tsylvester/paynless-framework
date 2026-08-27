import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  ApplyCompressionOverlayDeps,
  ApplyCompressionOverlayParams,
  ApplyCompressionOverlayPayload,
  ApplyCompressionOverlaySuccessReturn,
  ApplyCompressionOverlayErrorReturn,
  ApplyCompressionOverlayReturn,
  ApplyCompressionOverlayFn,
  BoundApplyCompressionOverlayFn,
} from "./applyCompressionOverlay.interface.ts";

/** Contract: ApplyCompressionOverlayDeps requires exactly logger, downloadFromStorage, and resolveCompressionSource. */
Deno.test("ApplyCompressionOverlayDeps has the required surface", () => {
  const surface: Record<keyof ApplyCompressionOverlayDeps, true> = {
    logger: true,
    downloadFromStorage: true,
    resolveCompressionSource: true,
  };
  assert(Object.keys(surface).length === 3);
});

/** Contract: ApplyCompressionOverlayParams requires exactly dbClient, projectId, sessionId, iterationNumber, stageSlug, and output_type. */
Deno.test("ApplyCompressionOverlayParams has the required surface", () => {
  const surface: Record<keyof ApplyCompressionOverlayParams, true> = {
    dbClient: true,
    projectId: true,
    sessionId: true,
    iterationNumber: true,
    stageSlug: true,
    output_type: true,
  };
  assert(Object.keys(surface).length === 6);
});

/** Contract: ApplyCompressionOverlayPayload requires exactly resourceDocuments and conversationHistory. */
Deno.test("ApplyCompressionOverlayPayload has the required surface", () => {
  const surface: Record<keyof ApplyCompressionOverlayPayload, true> = {
    resourceDocuments: true,
    conversationHistory: true,
  };
  assert(Object.keys(surface).length === 2);
});

/** Contract: ApplyCompressionOverlaySuccessReturn requires exactly resourceDocuments, conversationHistory, and overlaidCount. */
Deno.test("ApplyCompressionOverlaySuccessReturn has the required surface", () => {
  const surface: Record<keyof ApplyCompressionOverlaySuccessReturn, true> = {
    resourceDocuments: true,
    conversationHistory: true,
    overlaidCount: true,
  };
  assert(Object.keys(surface).length === 3);
});

/** Contract: ApplyCompressionOverlayErrorReturn requires exactly error and retriable. */
Deno.test("ApplyCompressionOverlayErrorReturn has the required surface", () => {
  const surface: Record<keyof ApplyCompressionOverlayErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assert(Object.keys(surface).length === 2);
});

/** Contract: ApplyCompressionOverlaySuccessReturn is a member of ApplyCompressionOverlayReturn. */
Deno.test("ApplyCompressionOverlaySuccessReturn is a member of ApplyCompressionOverlayReturn", () => {
  const success: ApplyCompressionOverlaySuccessReturn = {
    resourceDocuments: [],
    conversationHistory: [],
    overlaidCount: 0,
  };
  const result: ApplyCompressionOverlayReturn = success;
  assert(result === success);
});

/** Contract: ApplyCompressionOverlayErrorReturn is a member of ApplyCompressionOverlayReturn. */
Deno.test("ApplyCompressionOverlayErrorReturn is a member of ApplyCompressionOverlayReturn", () => {
  const error: ApplyCompressionOverlayErrorReturn = {
    error: new Error("contract error"),
    retriable: false,
  };
  const result: ApplyCompressionOverlayReturn = error;
  assert(result === error);
});

/** Contract: ApplyCompressionOverlayFn's declared Promise return admits its success arm. */
Deno.test("ApplyCompressionOverlayFn resolves to its declared success type", () => {
  const success: ApplyCompressionOverlaySuccessReturn = {
    resourceDocuments: [],
    conversationHistory: [],
    overlaidCount: 0,
  };
  const returned: ReturnType<ApplyCompressionOverlayFn> = Promise.resolve(success);
  const declared: Promise<ApplyCompressionOverlayReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: ApplyCompressionOverlayFn's declared Promise return admits its error arm. */
Deno.test("ApplyCompressionOverlayFn resolves to its declared error type", () => {
  const error: ApplyCompressionOverlayErrorReturn = {
    error: new Error("contract error"),
    retriable: false,
  };
  const returned: ReturnType<ApplyCompressionOverlayFn> = Promise.resolve(error);
  const declared: Promise<ApplyCompressionOverlayReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: BoundApplyCompressionOverlayFn's declared Promise return admits its success arm. */
Deno.test("BoundApplyCompressionOverlayFn resolves to its declared success type", () => {
  const success: ApplyCompressionOverlaySuccessReturn = {
    resourceDocuments: [],
    conversationHistory: [],
    overlaidCount: 0,
  };
  const returned: ReturnType<BoundApplyCompressionOverlayFn> = Promise.resolve(success);
  const declared: Promise<ApplyCompressionOverlayReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: BoundApplyCompressionOverlayFn's declared Promise return admits its error arm. */
Deno.test("BoundApplyCompressionOverlayFn resolves to its declared error type", () => {
  const error: ApplyCompressionOverlayErrorReturn = {
    error: new Error("contract error"),
    retriable: false,
  };
  const returned: ReturnType<BoundApplyCompressionOverlayFn> = Promise.resolve(error);
  const declared: Promise<ApplyCompressionOverlayReturn> = returned;
  assert(declared instanceof Promise);
});
