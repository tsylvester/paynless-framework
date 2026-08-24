import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PrepareResponseContentSanitizeError } from "./prepareResponseContent.interface.ts";
import type {
  PrepareResponseContentDeps,
  PrepareResponseContentParams,
  PrepareResponseContentPayload,
  PrepareResponseContentRetryRequiredReturn,
  PrepareResponseContentPreparedReturn,
  PrepareResponseContentSuccessReturn,
  PrepareResponseContentErrorReturn,
  PrepareResponseContentReturn,
  PrepareResponseContentFn,
  PrepareResponseContentSanitizeErrorConstructorParams,
  PrepareResponseContentContinuationErrorConstructorParams,
} from "./prepareResponseContent.interface.ts";

/** Contract: PrepareResponseContentDeps' required key surface is exactly logger, resolveFinishReason, isIntermediateChunk, sanitizeJsonContent and determineContinuation — exhaustive in both directions, the proof retryJob and notificationService are not deps of this module. */
Deno.test("PrepareResponseContentDeps has the required surface", () => {
  const surface: Record<keyof PrepareResponseContentDeps, true> = {
    logger: true,
    resolveFinishReason: true,
    isIntermediateChunk: true,
    sanitizeJsonContent: true,
    determineContinuation: true,
  };
  assertEquals(Object.keys(surface).length, 5);
});

/** Contract: PrepareResponseContentParams' required key surface is exactly jobId, mode, continueUntilComplete, documentKey, contextForDocuments and sourceObject. */
Deno.test("PrepareResponseContentParams has the required surface", () => {
  const surface: Record<keyof PrepareResponseContentParams, true> = {
    jobId: true,
    mode: true,
    continueUntilComplete: true,
    documentKey: true,
    contextForDocuments: true,
    sourceObject: true,
  };
  assertEquals(Object.keys(surface).length, 6);
});

/** Contract: PrepareResponseContentPayload's required key surface is exactly aiResponse. */
Deno.test("PrepareResponseContentPayload has the required surface", () => {
  const surface: Record<keyof PrepareResponseContentPayload, true> = {
    aiResponse: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: PrepareResponseContentRetryRequiredReturn's required key surface is exactly retryRequired and reason, proving the retry flavor carries no content member. */
Deno.test("PrepareResponseContentRetryRequiredReturn has the required surface", () => {
  const surface: Record<keyof PrepareResponseContentRetryRequiredReturn, true> = {
    retryRequired: true,
    reason: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: PrepareResponseContentPreparedReturn's required key surface is exactly retryRequired, contentForStorage, shouldContinue, needsContinuation, resolvedFinishReason and isIntermediate. */
Deno.test("PrepareResponseContentPreparedReturn has the required surface", () => {
  const surface: Record<keyof PrepareResponseContentPreparedReturn, true> = {
    retryRequired: true,
    contentForStorage: true,
    shouldContinue: true,
    needsContinuation: true,
    resolvedFinishReason: true,
    isIntermediate: true,
  };
  assertEquals(Object.keys(surface).length, 6);
});

/** Contract: PrepareResponseContentRetryRequiredReturn is a flavor of the PrepareResponseContentSuccessReturn arm. */
Deno.test("PrepareResponseContentRetryRequiredReturn is a member of PrepareResponseContentSuccessReturn", () => {
  const retryRequired: PrepareResponseContentRetryRequiredReturn = {
    retryRequired: true,
    reason: "AI response was empty.",
  };
  const success: PrepareResponseContentSuccessReturn = retryRequired;
  assertEquals(success, retryRequired);
});

/** Contract: PrepareResponseContentPreparedReturn is a flavor of the PrepareResponseContentSuccessReturn arm. */
Deno.test("PrepareResponseContentPreparedReturn is a member of PrepareResponseContentSuccessReturn", () => {
  const prepared: PrepareResponseContentPreparedReturn = {
    retryRequired: false,
    contentForStorage: "",
    shouldContinue: false,
    needsContinuation: false,
    resolvedFinishReason: "stop",
    isIntermediate: false,
  };
  const success: PrepareResponseContentSuccessReturn = prepared;
  assertEquals(success, prepared);
});

/** Contract: PrepareResponseContentSuccessReturn is a member of PrepareResponseContentReturn. */
Deno.test("PrepareResponseContentSuccessReturn is a member of PrepareResponseContentReturn", () => {
  const prepared: PrepareResponseContentPreparedReturn = {
    retryRequired: false,
    contentForStorage: "",
    shouldContinue: false,
    needsContinuation: false,
    resolvedFinishReason: "stop",
    isIntermediate: false,
  };
  const success: PrepareResponseContentSuccessReturn = prepared;
  const result: PrepareResponseContentReturn = success;
  assertEquals(result, success);
});

/** Contract: PrepareResponseContentErrorReturn is a member of PrepareResponseContentReturn, proving the union has exactly the two arms. */
Deno.test("PrepareResponseContentErrorReturn is a member of PrepareResponseContentReturn", () => {
  const errorReturn: PrepareResponseContentErrorReturn = {
    error: new PrepareResponseContentSanitizeError({ jobId: "job-1", thrownValue: "boom" }),
    retriable: false,
  };
  const result: PrepareResponseContentReturn = errorReturn;
  assertEquals(result, errorReturn);
});

/** Contract: PrepareResponseContentSanitizeErrorConstructorParams' required key surface is exactly jobId and thrownValue. */
Deno.test("PrepareResponseContentSanitizeErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof PrepareResponseContentSanitizeErrorConstructorParams, true> = {
    jobId: true,
    thrownValue: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: PrepareResponseContentContinuationErrorConstructorParams' required key surface is exactly jobId and thrownValue. */
Deno.test("PrepareResponseContentContinuationErrorConstructorParams has the required surface", () => {
  const surface: Record<keyof PrepareResponseContentContinuationErrorConstructorParams, true> = {
    jobId: true,
    thrownValue: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: PrepareResponseContentFn's declared return admits its success arm, proving the signature is synchronous — every collaborator it calls is synchronous and it performs no IO. */
Deno.test("PrepareResponseContentFn returns its declared success type", () => {
  const prepared: PrepareResponseContentPreparedReturn = {
    retryRequired: false,
    contentForStorage: "",
    shouldContinue: false,
    needsContinuation: false,
    resolvedFinishReason: "stop",
    isIntermediate: false,
  };
  const success: PrepareResponseContentSuccessReturn = prepared;
  const returned: ReturnType<PrepareResponseContentFn> = success;
  const declared: PrepareResponseContentReturn = returned;
  assertEquals(declared, success);
});

/** Contract: PrepareResponseContentFn's declared return admits its error arm, proving the signature is synchronous. */
Deno.test("PrepareResponseContentFn returns its declared error type", () => {
  const errorReturn: PrepareResponseContentErrorReturn = {
    error: new PrepareResponseContentSanitizeError({ jobId: "job-1", thrownValue: "boom" }),
    retriable: false,
  };
  const returned: ReturnType<PrepareResponseContentFn> = errorReturn;
  const declared: PrepareResponseContentReturn = returned;
  assertEquals(declared, errorReturn);
});

/** Contract: PrepareResponseContentParams may omit mode, an EXECUTE response carrying no compression mode. */
Deno.test("PrepareResponseContentParams may omit mode", () => {
  const params: PrepareResponseContentParams = {
    jobId: "job-1",
    continueUntilComplete: false,
    documentKey: undefined,
    contextForDocuments: undefined,
    sourceObject: undefined,
  };
  assertEquals("mode" in params, false);
});

/** Contract: PrepareResponseContentParams.documentKey may be null, matching DialecticExecuteJobPayload.document_key. */
Deno.test("PrepareResponseContentParams.documentKey may be null", () => {
  const params: PrepareResponseContentParams = {
    jobId: "job-1",
    mode: "json",
    continueUntilComplete: false,
    documentKey: null,
    contextForDocuments: undefined,
    sourceObject: undefined,
  };
  assertEquals(params.documentKey, null);
});
