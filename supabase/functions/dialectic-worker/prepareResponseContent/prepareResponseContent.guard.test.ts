import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPrepareResponseContentDeps,
  invalidatePrepareResponseContentDeps,
  buildPrepareResponseContentParams,
  invalidatePrepareResponseContentParams,
  buildPrepareResponseContentPayload,
  invalidatePrepareResponseContentPayload,
  buildPrepareResponseContentRetryRequiredReturn,
  invalidatePrepareResponseContentRetryRequiredReturn,
  buildPrepareResponseContentPreparedReturn,
  invalidatePrepareResponseContentPreparedReturn,
  buildPrepareResponseContentErrorReturn,
  invalidatePrepareResponseContentErrorReturn,
  buildPrepareResponseContentSanitizeError,
  buildPrepareResponseContentContinuationError,
} from "./prepareResponseContent.mock.ts";
import {
  invalidateUnifiedAIResponse,
  invalidateContextForDocument,
  invalidateContentToInclude,
} from "../../_shared/dialectic.mock.ts";
import {
  isPrepareResponseContentDeps,
  isPrepareResponseContentParams,
  isPrepareResponseContentPayload,
  isPrepareResponseContentRetryRequiredReturn,
  isPrepareResponseContentPreparedReturn,
  isPrepareResponseContentErrorReturn,
  isPrepareResponseContentSanitizeError,
  isPrepareResponseContentContinuationError,
} from "./prepareResponseContent.guard.ts";

Deno.test("Type Guard: isPrepareResponseContentDeps", async (t) => {
  /** Contract: the builder's valid default is accepted. */
  await t.step("accepts the built deps", () => {
    assert(isPrepareResponseContentDeps(buildPrepareResponseContentDeps()));
  });

  /** Contract: logger absent is rejected. */
  await t.step("rejects logger absent", () => {
    const { logger: _omit, ...rest } = buildPrepareResponseContentDeps();
    assert(!isPrepareResponseContentDeps(rest));
  });

  /** Contract: logger a non-object is rejected. */
  await t.step("rejects logger non-object", () => {
    assert(
      !isPrepareResponseContentDeps(
        invalidatePrepareResponseContentDeps({ logger: "not-an-object" }),
      ),
    );
  });

  /** Contract: resolveFinishReason absent is rejected. */
  await t.step("rejects resolveFinishReason absent", () => {
    const { resolveFinishReason: _omit, ...rest } =
      buildPrepareResponseContentDeps();
    assert(!isPrepareResponseContentDeps(rest));
  });

  /** Contract: resolveFinishReason a non-function is rejected. */
  await t.step("rejects resolveFinishReason non-function", () => {
    assert(
      !isPrepareResponseContentDeps(
        invalidatePrepareResponseContentDeps({ resolveFinishReason: 42 }),
      ),
    );
  });

  /** Contract: isIntermediateChunk absent is rejected. */
  await t.step("rejects isIntermediateChunk absent", () => {
    const { isIntermediateChunk: _omit, ...rest } =
      buildPrepareResponseContentDeps();
    assert(!isPrepareResponseContentDeps(rest));
  });

  /** Contract: isIntermediateChunk a non-function is rejected. */
  await t.step("rejects isIntermediateChunk non-function", () => {
    assert(
      !isPrepareResponseContentDeps(
        invalidatePrepareResponseContentDeps({ isIntermediateChunk: "string" }),
      ),
    );
  });

  /** Contract: sanitizeJsonContent absent is rejected. */
  await t.step("rejects sanitizeJsonContent absent", () => {
    const { sanitizeJsonContent: _omit, ...rest } =
      buildPrepareResponseContentDeps();
    assert(!isPrepareResponseContentDeps(rest));
  });

  /** Contract: sanitizeJsonContent a non-function is rejected. */
  await t.step("rejects sanitizeJsonContent non-function", () => {
    assert(
      !isPrepareResponseContentDeps(
        invalidatePrepareResponseContentDeps({ sanitizeJsonContent: null }),
      ),
    );
  });

  /** Contract: determineContinuation absent is rejected. */
  await t.step("rejects determineContinuation absent", () => {
    const { determineContinuation: _omit, ...rest } =
      buildPrepareResponseContentDeps();
    assert(!isPrepareResponseContentDeps(rest));
  });

  /** Contract: determineContinuation a non-function is rejected. */
  await t.step("rejects determineContinuation non-function", () => {
    assert(
      !isPrepareResponseContentDeps(
        invalidatePrepareResponseContentDeps({ determineContinuation: true }),
      ),
    );
  });

  /** Contract: a non-record root is rejected. */
  await t.step("rejects a non-record root", () => {
    assert(!isPrepareResponseContentDeps(null));
    assert(!isPrepareResponseContentDeps(undefined));
    assert(!isPrepareResponseContentDeps(42));
    assert(!isPrepareResponseContentDeps("string"));
    assert(!isPrepareResponseContentDeps([]));
  });
});

Deno.test("Type Guard: isPrepareResponseContentParams", async (t) => {
  /** Contract: the builder's valid default is accepted. */
  await t.step("accepts the built params", () => {
    assert(isPrepareResponseContentParams(buildPrepareResponseContentParams()));
  });

  /** Contract: documentKey undefined is accepted, it being a declared absent state. */
  await t.step("accepts documentKey undefined", () => {
    assert(
      isPrepareResponseContentParams(
        buildPrepareResponseContentParams({ documentKey: undefined }),
      ),
    );
  });

  /** Contract: documentKey null is accepted, matching DialecticExecuteJobPayload.document_key. */
  await t.step("accepts documentKey null", () => {
    assert(
      isPrepareResponseContentParams(
        buildPrepareResponseContentParams({ documentKey: null }),
      ),
    );
  });

  /** Contract: contextForDocuments undefined is accepted, it being a declared absent state. */
  await t.step("accepts contextForDocuments undefined", () => {
    assert(
      isPrepareResponseContentParams(
        buildPrepareResponseContentParams({ contextForDocuments: undefined }),
      ),
    );
  });

  /** Contract: sourceObject undefined is accepted, it being a declared absent state. */
  await t.step("accepts sourceObject undefined", () => {
    assert(
      isPrepareResponseContentParams(
        buildPrepareResponseContentParams({ sourceObject: undefined }),
      ),
    );
  });

  /** Contract: jobId absent is rejected. */
  await t.step("rejects jobId absent", () => {
    const { jobId: _omit, ...rest } = buildPrepareResponseContentParams();
    assert(!isPrepareResponseContentParams(rest));
  });

  /** Contract: jobId a non-string is rejected. */
  await t.step("rejects jobId non-string", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({ jobId: 42 }),
      ),
    );
  });

  /** Contract: jobId the empty string is rejected. */
  await t.step("rejects jobId empty", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({ jobId: "" }),
      ),
    );
  });

  /** Contract: mode absent is accepted, it being an optional field an EXECUTE response omits. */
  await t.step("accepts mode absent", () => {
    const { mode: _omit, ...rest } = buildPrepareResponseContentParams();
    assert(isPrepareResponseContentParams(rest));
  });

  /** Contract: mode outside CompressionMode is rejected. */
  await t.step("rejects mode outside CompressionMode", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({ mode: "not-a-mode" }),
      ),
    );
  });

  /** Contract: continueUntilComplete absent is rejected. */
  await t.step("rejects continueUntilComplete absent", () => {
    const { continueUntilComplete: _omit, ...rest } =
      buildPrepareResponseContentParams();
    assert(!isPrepareResponseContentParams(rest));
  });

  /** Contract: continueUntilComplete a non-boolean is rejected. */
  await t.step("rejects continueUntilComplete non-boolean", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({ continueUntilComplete: "yes" }),
      ),
    );
  });

  /** Contract: documentKey a number is rejected. */
  await t.step("rejects documentKey a number", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({ documentKey: 42 }),
      ),
    );
  });

  /** Contract: contextForDocuments a non-array is rejected. */
  await t.step("rejects contextForDocuments a non-array", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({
          contextForDocuments: "not-an-array",
        }),
      ),
    );
  });

  /** Contract: contextForDocuments an array containing that type's invalidator output is rejected. */
  await t.step("rejects contextForDocuments an array with invalidator output", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({
          contextForDocuments: [invalidateContextForDocument({ document_key: 42 })],
        }),
      ),
    );
  });

  /** Contract: sourceObject a non-ContentToInclude value is rejected. */
  await t.step("rejects sourceObject a non-ContentToInclude value", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({ sourceObject: 42 }),
      ),
    );
  });

  /** Contract: sourceObject set to the invalidator output of ContentToInclude is rejected. */
  await t.step("rejects sourceObject set to invalidateContentToInclude output", () => {
    assert(
      !isPrepareResponseContentParams(
        invalidatePrepareResponseContentParams({
          sourceObject: invalidateContentToInclude({ field: undefined }),
        }),
      ),
    );
  });

  /** Contract: a non-record root is rejected. */
  await t.step("rejects a non-record root", () => {
    assert(!isPrepareResponseContentParams(null));
    assert(!isPrepareResponseContentParams(undefined));
    assert(!isPrepareResponseContentParams(42));
    assert(!isPrepareResponseContentParams("string"));
    assert(!isPrepareResponseContentParams([]));
  });
});

Deno.test("Type Guard: isPrepareResponseContentPayload", async (t) => {
  /** Contract: the builder's valid default is accepted. */
  await t.step("accepts the built payload", () => {
    assert(
      isPrepareResponseContentPayload(buildPrepareResponseContentPayload()),
    );
  });

  /** Contract: aiResponse absent is rejected. */
  await t.step("rejects aiResponse absent", () => {
    const { aiResponse: _omit, ...rest } =
      buildPrepareResponseContentPayload();
    assert(!isPrepareResponseContentPayload(rest));
  });

  /** Contract: aiResponse set to invalidateUnifiedAIResponse({ content: 42 }) is rejected, proving the response is checked through its owner's guard. */
  await t.step("rejects aiResponse set to invalidateUnifiedAIResponse({ content: 42 })", () => {
    assert(
      !isPrepareResponseContentPayload(
        invalidatePrepareResponseContentPayload({
          aiResponse: invalidateUnifiedAIResponse({ content: 42 }),
        }),
      ),
    );
  });

  /** Contract: a non-record root is rejected. */
  await t.step("rejects a non-record root", () => {
    assert(!isPrepareResponseContentPayload(null));
    assert(!isPrepareResponseContentPayload(undefined));
    assert(!isPrepareResponseContentPayload(42));
    assert(!isPrepareResponseContentPayload("string"));
    assert(!isPrepareResponseContentPayload([]));
  });
});

Deno.test("Type Guard: isPrepareResponseContentRetryRequiredReturn", async (t) => {
  /** Contract: the builder's valid default is accepted. */
  await t.step("accepts its own flavor", () => {
    assert(
      isPrepareResponseContentRetryRequiredReturn(
        buildPrepareResponseContentRetryRequiredReturn(),
      ),
    );
  });

  /** Contract: retryRequired absent is rejected. */
  await t.step("rejects retryRequired absent", () => {
    const { retryRequired: _omit, ...rest } =
      buildPrepareResponseContentRetryRequiredReturn();
    assert(!isPrepareResponseContentRetryRequiredReturn(rest));
  });

  /** Contract: retryRequired not exactly true is rejected. */
  await t.step("rejects retryRequired not exactly true", () => {
    assert(
      !isPrepareResponseContentRetryRequiredReturn(
        invalidatePrepareResponseContentRetryRequiredReturn({
          retryRequired: false,
        }),
      ),
    );
  });

  /** Contract: reason absent is rejected. */
  await t.step("rejects reason absent", () => {
    const { reason: _omit, ...rest } =
      buildPrepareResponseContentRetryRequiredReturn();
    assert(!isPrepareResponseContentRetryRequiredReturn(rest));
  });

  /** Contract: reason a non-string is rejected. */
  await t.step("rejects reason non-string", () => {
    assert(
      !isPrepareResponseContentRetryRequiredReturn(
        invalidatePrepareResponseContentRetryRequiredReturn({ reason: 42 }),
      ),
    );
  });

  /** Contract: reason the empty string is rejected. */
  await t.step("rejects reason empty", () => {
    assert(
      !isPrepareResponseContentRetryRequiredReturn(
        invalidatePrepareResponseContentRetryRequiredReturn({ reason: "" }),
      ),
    );
  });

  /** Contract: the prepared flavor is rejected, the two flavors being mutually exclusive. */
  await t.step("rejects the prepared flavor", () => {
    assert(
      !isPrepareResponseContentRetryRequiredReturn(
        buildPrepareResponseContentPreparedReturn(),
      ),
    );
  });

  /** Contract: a non-record root is rejected. */
  await t.step("rejects a non-record root", () => {
    assert(!isPrepareResponseContentRetryRequiredReturn(null));
    assert(!isPrepareResponseContentRetryRequiredReturn(undefined));
    assert(!isPrepareResponseContentRetryRequiredReturn(42));
    assert(!isPrepareResponseContentRetryRequiredReturn("string"));
    assert(!isPrepareResponseContentRetryRequiredReturn([]));
  });
});

Deno.test("Type Guard: isPrepareResponseContentPreparedReturn", async (t) => {
  /** Contract: the builder's valid default is accepted. */
  await t.step("accepts its own flavor", () => {
    assert(
      isPrepareResponseContentPreparedReturn(
        buildPrepareResponseContentPreparedReturn(),
      ),
    );
  });

  /** Contract: retryRequired not exactly false is rejected. */
  await t.step("rejects retryRequired not exactly false", () => {
    assert(
      !isPrepareResponseContentPreparedReturn(
        invalidatePrepareResponseContentPreparedReturn({ retryRequired: true }),
      ),
    );
  });

  /** Contract: contentForStorage absent is rejected. */
  await t.step("rejects contentForStorage absent", () => {
    const { contentForStorage: _omit, ...rest } =
      buildPrepareResponseContentPreparedReturn();
    assert(!isPrepareResponseContentPreparedReturn(rest));
  });

  /** Contract: contentForStorage a non-string is rejected. */
  await t.step("rejects contentForStorage non-string", () => {
    assert(
      !isPrepareResponseContentPreparedReturn(
        invalidatePrepareResponseContentPreparedReturn({
          contentForStorage: 42,
        }),
      ),
    );
  });

  /** Contract: shouldContinue absent is rejected. */
  await t.step("rejects shouldContinue absent", () => {
    const { shouldContinue: _omit, ...rest } =
      buildPrepareResponseContentPreparedReturn();
    assert(!isPrepareResponseContentPreparedReturn(rest));
  });

  /** Contract: shouldContinue a non-boolean is rejected. */
  await t.step("rejects shouldContinue non-boolean", () => {
    assert(
      !isPrepareResponseContentPreparedReturn(
        invalidatePrepareResponseContentPreparedReturn({
          shouldContinue: "yes",
        }),
      ),
    );
  });

  /** Contract: resolvedFinishReason absent is rejected. */
  await t.step("rejects resolvedFinishReason absent", () => {
    const { resolvedFinishReason: _omit, ...rest } =
      buildPrepareResponseContentPreparedReturn();
    assert(!isPrepareResponseContentPreparedReturn(rest));
  });

  /** Contract: resolvedFinishReason outside FinishReason is rejected. */
  await t.step("rejects resolvedFinishReason outside FinishReason", () => {
    assert(
      !isPrepareResponseContentPreparedReturn(
        invalidatePrepareResponseContentPreparedReturn({
          resolvedFinishReason: "not-a-finish-reason",
        }),
      ),
    );
  });

  /** Contract: resolvedFinishReason null is accepted, that guard admitting null because an unresolved reason is a real state. */
  await t.step("accepts resolvedFinishReason null", () => {
    assert(
      isPrepareResponseContentPreparedReturn(
        buildPrepareResponseContentPreparedReturn({
          resolvedFinishReason: null,
        }),
      ),
    );
  });

  /** Contract: needsContinuation absent is rejected. */
  await t.step("rejects needsContinuation absent", () => {
    const { needsContinuation: _omit, ...rest } =
      buildPrepareResponseContentPreparedReturn();
    assert(!isPrepareResponseContentPreparedReturn(rest));
  });

  /** Contract: needsContinuation a non-boolean is rejected. */
  await t.step("rejects needsContinuation non-boolean", () => {
    assert(
      !isPrepareResponseContentPreparedReturn(
        invalidatePrepareResponseContentPreparedReturn({
          needsContinuation: "yes",
        }),
      ),
    );
  });

  /** Contract: isIntermediate absent is rejected. */
  await t.step("rejects isIntermediate absent", () => {
    const { isIntermediate: _omit, ...rest } =
      buildPrepareResponseContentPreparedReturn();
    assert(!isPrepareResponseContentPreparedReturn(rest));
  });

  /** Contract: isIntermediate a non-boolean is rejected. */
  await t.step("rejects isIntermediate non-boolean", () => {
    assert(
      !isPrepareResponseContentPreparedReturn(
        invalidatePrepareResponseContentPreparedReturn({
          isIntermediate: "yes",
        }),
      ),
    );
  });

  /** Contract: the retry-required flavor is rejected, the two flavors being mutually exclusive. */
  await t.step("rejects the retry-required flavor", () => {
    assert(
      !isPrepareResponseContentPreparedReturn(
        buildPrepareResponseContentRetryRequiredReturn(),
      ),
    );
  });

  /** Contract: a non-record root is rejected. */
  await t.step("rejects a non-record root", () => {
    assert(!isPrepareResponseContentPreparedReturn(null));
    assert(!isPrepareResponseContentPreparedReturn(undefined));
    assert(!isPrepareResponseContentPreparedReturn(42));
    assert(!isPrepareResponseContentPreparedReturn("string"));
    assert(!isPrepareResponseContentPreparedReturn([]));
  });
});

Deno.test("Type Guard: isPrepareResponseContentErrorReturn", async (t) => {
  /** Contract: the builder's valid default is accepted. */
  await t.step("accepts the built error return", () => {
    assert(
      isPrepareResponseContentErrorReturn(
        buildPrepareResponseContentErrorReturn(),
      ),
    );
  });

  /** Contract: an error return whose error is the continuation error is accepted, proving both members of the declared union are admitted. */
  await t.step("accepts error the continuation error", () => {
    assert(
      isPrepareResponseContentErrorReturn(
        buildPrepareResponseContentErrorReturn({
          error: buildPrepareResponseContentContinuationError(),
        }),
      ),
    );
  });

  /** Contract: error absent is rejected. */
  await t.step("rejects error absent", () => {
    const { error: _omit, ...rest } =
      buildPrepareResponseContentErrorReturn();
    assert(!isPrepareResponseContentErrorReturn(rest));
  });

  /** Contract: error a plain object is rejected. */
  await t.step("rejects error a plain object", () => {
    assert(
      !isPrepareResponseContentErrorReturn(
        invalidatePrepareResponseContentErrorReturn({
          error: { message: "oops" },
        }),
      ),
    );
  });

  /** Contract: error a plain Error that is neither owned class is rejected. */
  await t.step("rejects error a plain Error", () => {
    assert(
      !isPrepareResponseContentErrorReturn(
        invalidatePrepareResponseContentErrorReturn({
          error: new Error("plain"),
        }),
      ),
    );
  });

  /** Contract: retriable absent is rejected. */
  await t.step("rejects retriable absent", () => {
    const { retriable: _omit, ...rest } =
      buildPrepareResponseContentErrorReturn();
    assert(!isPrepareResponseContentErrorReturn(rest));
  });

  /** Contract: retriable a non-boolean is rejected. */
  await t.step("rejects retriable non-boolean", () => {
    assert(
      !isPrepareResponseContentErrorReturn(
        invalidatePrepareResponseContentErrorReturn({ retriable: "yes" }),
      ),
    );
  });

  /** Contract: a non-record root is rejected. */
  await t.step("rejects a non-record root", () => {
    assert(!isPrepareResponseContentErrorReturn(null));
    assert(!isPrepareResponseContentErrorReturn(undefined));
    assert(!isPrepareResponseContentErrorReturn(42));
    assert(!isPrepareResponseContentErrorReturn("string"));
    assert(!isPrepareResponseContentErrorReturn([]));
  });
});

Deno.test("Type Guard: isPrepareResponseContentSanitizeError", async (t) => {
  /** Contract: its builder's instance is accepted. */
  await t.step("accepts its builder's instance", () => {
    assert(
      isPrepareResponseContentSanitizeError(
        buildPrepareResponseContentSanitizeError(),
      ),
    );
  });

  /** Contract: a plain Error is rejected. */
  await t.step("rejects a plain Error", () => {
    assert(!isPrepareResponseContentSanitizeError(new Error("plain")));
  });

  /** Contract: a plain object carrying the same members is rejected. */
  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildPrepareResponseContentSanitizeError();
    const plain = {
      message: instance.message,
      name: instance.name,
      jobId: instance.jobId,
      thrownValue: instance.thrownValue,
    };
    assert(!isPrepareResponseContentSanitizeError(plain));
  });

  /** Contract: the other owned error is rejected. */
  await t.step("rejects the other owned error", () => {
    assert(
      !isPrepareResponseContentSanitizeError(
        buildPrepareResponseContentContinuationError(),
      ),
    );
  });

  /** Contract: null is rejected. */
  await t.step("rejects null", () => {
    assert(!isPrepareResponseContentSanitizeError(null));
  });

  /** Contract: a primitive is rejected. */
  await t.step("rejects a primitive", () => {
    assert(!isPrepareResponseContentSanitizeError("string"));
  });
});

Deno.test("Type Guard: isPrepareResponseContentContinuationError", async (t) => {
  /** Contract: its builder's instance is accepted. */
  await t.step("accepts its builder's instance", () => {
    assert(
      isPrepareResponseContentContinuationError(
        buildPrepareResponseContentContinuationError(),
      ),
    );
  });

  /** Contract: a plain Error is rejected. */
  await t.step("rejects a plain Error", () => {
    assert(!isPrepareResponseContentContinuationError(new Error("plain")));
  });

  /** Contract: a plain object carrying the same members is rejected. */
  await t.step("rejects a plain object carrying the same members", () => {
    const instance = buildPrepareResponseContentContinuationError();
    const plain = {
      message: instance.message,
      name: instance.name,
      jobId: instance.jobId,
      thrownValue: instance.thrownValue,
    };
    assert(!isPrepareResponseContentContinuationError(plain));
  });

  /** Contract: the other owned error is rejected. */
  await t.step("rejects the other owned error", () => {
    assert(
      !isPrepareResponseContentContinuationError(
        buildPrepareResponseContentSanitizeError(),
      ),
    );
  });

  /** Contract: null is rejected. */
  await t.step("rejects null", () => {
    assert(!isPrepareResponseContentContinuationError(null));
  });

  /** Contract: a primitive is rejected. */
  await t.step("rejects a primitive", () => {
    assert(!isPrepareResponseContentContinuationError("string"));
  });
});
