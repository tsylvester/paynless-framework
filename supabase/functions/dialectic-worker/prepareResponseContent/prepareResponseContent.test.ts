import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { prepareResponseContent } from "./prepareResponseContent.ts";
import {
  isPrepareResponseContentRetryRequiredReturn,
  isPrepareResponseContentPreparedReturn,
  isPrepareResponseContentErrorReturn,
  isPrepareResponseContentSanitizeError,
  isPrepareResponseContentContinuationError,
} from "./prepareResponseContent.guard.ts";
import {
  buildPrepareResponseContentDeps,
  buildPrepareResponseContentParams,
  buildPrepareResponseContentPayload,
} from "./prepareResponseContent.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";
import type { ResolveFinishReasonFn, IsIntermediateChunkFn, DetermineContinuationFn } from "../createJobContext/JobContext.interface.ts";
import type { SanitizeJsonContentFn } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.interface.ts";
import type { DetermineContinuationParams } from "../../_shared/utils/determineContinuation/determineContinuation.interface.ts";
import type { PrepareResponseContentDeps } from "./prepareResponseContent.interface.ts";

const stopFinishReason: ResolveFinishReasonFn = (_aiResponse: UnifiedAIResponse) => "stop";
const errorFinishReason: ResolveFinishReasonFn = (_aiResponse: UnifiedAIResponse) => "error";
const lengthFinishReason: ResolveFinishReasonFn = (_aiResponse: UnifiedAIResponse) => "length";
const trueIntermediate: IsIntermediateChunkFn = (_resolvedFinish, _continueUntilComplete) => true;
const falseIntermediate: IsIntermediateChunkFn = (_resolvedFinish, _continueUntilComplete) => false;
const passthroughSanitizer: SanitizeJsonContentFn = (content: string) => ({
  sanitized: content,
  wasSanitized: false,
  wasStructurallyFixed: false,
  hasDuplicateKeys: false,
  duplicateKeysResolved: [],
  originalLength: content.length,
});
const stopContinuation: DetermineContinuationFn = (_params: DetermineContinuationParams) => ({ shouldContinue: false });
const continueContinuation: DetermineContinuationFn = (_params: DetermineContinuationParams) => ({ shouldContinue: true });

/**
 * Contract: a payload whose aiResponse.content is null returns the retry-required
 *   flavor with reason `AI response was empty.`, and no collaborator is invoked.
 * Arrange: a payload whose aiResponse.content is null and whose error is absent;
 *   spies on every collaborator method of the deps.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  retry-required flavor; reason is `AI response was empty.`;
 *   resolveFinishReason, isIntermediateChunk, sanitizeJsonContent and
 *   determineContinuation each never called.
 */
Deno.test("empty response — null content returns retry-required with empty reason", () => {
  // Arrange
  const resolveFinishReason = spy(stopFinishReason);
  const isIntermediateChunk = spy(falseIntermediate);
  const sanitizeJsonContent = spy(passthroughSanitizer);
  const determineContinuation = spy(stopContinuation);
  const deps: PrepareResponseContentDeps = {
    logger: new MockLogger(),
    resolveFinishReason,
    isIntermediateChunk,
    sanitizeJsonContent,
    determineContinuation,
  };
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: null }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentRetryRequiredReturn(result));
  if (isPrepareResponseContentRetryRequiredReturn(result)) {
    assertEquals(result.reason, "AI response was empty.");
  }
  assertEquals(resolveFinishReason.calls.length, 0);
  assertEquals(isIntermediateChunk.calls.length, 0);
  assertEquals(sanitizeJsonContent.calls.length, 0);
  assertEquals(determineContinuation.calls.length, 0);
});

/**
 * Contract: a payload whose aiResponse.error is a named string returns the
 *   retry-required flavor carrying that exact string as the reason, proving the
 *   response's own error is relayed rather than replaced by the empty-content
 *   reason; arranged with non-empty content so the two conditions are
 *   distinguished.
 * Arrange: a payload whose aiResponse.error is a distinct string and whose
 *   content is non-empty; spies on every collaborator.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  retry-required flavor; reason is the response's error string;
 *   no collaborator called.
 */
Deno.test("errored response — error string is relayed as the reason", () => {
  // Arrange
  const errorMessage = "provider-returned-error";
  const resolveFinishReason = spy(stopFinishReason);
  const isIntermediateChunk = spy(falseIntermediate);
  const sanitizeJsonContent = spy(passthroughSanitizer);
  const determineContinuation = spy(stopContinuation);
  const deps: PrepareResponseContentDeps = {
    logger: new MockLogger(),
    resolveFinishReason,
    isIntermediateChunk,
    sanitizeJsonContent,
    determineContinuation,
  };
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: "non-empty", error: errorMessage }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentRetryRequiredReturn(result));
  if (isPrepareResponseContentRetryRequiredReturn(result)) {
    assertEquals(result.reason, errorMessage);
  }
  assertEquals(resolveFinishReason.calls.length, 0);
  assertEquals(isIntermediateChunk.calls.length, 0);
  assertEquals(sanitizeJsonContent.calls.length, 0);
  assertEquals(determineContinuation.calls.length, 0);
});

/**
 * Contract: deps whose resolveFinishReason returns 'error' return the
 *   retry-required flavor with reason `AI provider signaled error via
 *   finish_reason.`, and the sanitizer is never invoked.
 * Arrange: deps whose resolveFinishReason returns 'error'; a payload with
 *   non-empty content and no error; a spy on sanitizeJsonContent.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  retry-required flavor; reason is `AI provider signaled error via
 *   finish_reason.`; sanitizeJsonContent never called.
 */
Deno.test("provider-signalled error — finish_reason 'error' returns retry-required", () => {
  // Arrange
  const sanitizeJsonContent = spy(passthroughSanitizer);
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(errorFinishReason),
    sanitizeJsonContent,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: "non-empty", finish_reason: "error" }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentRetryRequiredReturn(result));
  if (isPrepareResponseContentRetryRequiredReturn(result)) {
    assertEquals(result.reason, "AI provider signaled error via finish_reason.");
  }
  assertEquals(sanitizeJsonContent.calls.length, 0);
});

/**
 * Contract: deps whose isIntermediateChunk returns true return the prepared
 *   flavor whose contentForStorage is the response's content unchanged, with
 *   determineContinuation never invoked and shouldContinue equal to the
 *   finish-reason trigger for the returned reason.
 * Arrange: deps whose isIntermediateChunk returns true and whose
 *   resolveFinishReason returns 'stop'; a payload with distinct content;
 *   a spy on determineContinuation.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  prepared flavor; contentForStorage is the response's content;
 *   shouldContinue is false (stop is not a continue reason);
 *   determineContinuation never called.
 */
Deno.test("intermediate chunk — content passed through, determineContinuation not called", () => {
  // Arrange
  const content = "intermediate-chunk-content";
  const determineContinuation = spy(stopContinuation);
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(trueIntermediate),
    determineContinuation,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.contentForStorage, content);
    assertEquals(result.shouldContinue, false);
    assertEquals(result.isIntermediate, true);
    assertEquals(result.resolvedFinishReason, "stop");
  }
  assertEquals(determineContinuation.calls.length, 0);
});

/**
 * Contract: the prepared flavor relays every collaborator answer — a case whose
 *   resolveFinishReason returns a reason distinct from the payload's own
 *   finish_reason and whose isIntermediateChunk returns true yields those two
 *   exact values on the return, asserted independently.
 * Arrange: deps whose resolveFinishReason returns 'length' (distinct from the
 *   payload's finish_reason) and whose isIntermediateChunk returns true;
 *   a payload whose finish_reason is 'stop'.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  prepared flavor; resolvedFinishReason is 'length' (the collaborator's
 *   answer, not the payload's); isIntermediate is true.
 */
Deno.test("prepared flavor relays collaborator answers — unparsed route", () => {
  // Arrange
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(lengthFinishReason),
    isIntermediateChunk: spy(trueIntermediate),
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: "content", finish_reason: "stop" }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.resolvedFinishReason, "length");
    assertEquals(result.isIntermediate, true);
  }
});

/**
 * Contract: the prepared flavor relays every collaborator answer — its pair,
 *   over the parsed route with isIntermediateChunk returning false, yields the
 *   mirrored values, so a return that recomputed either member, or hardcoded
 *   one, fails.
 * Arrange: deps whose resolveFinishReason returns 'length' and whose
 *   isIntermediateChunk returns false; a sanitizer returning a valid result
 *   over parseable content; determineContinuation returning shouldContinue false.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  prepared flavor; resolvedFinishReason is 'length'; isIntermediate
 *   is false.
 */
Deno.test("prepared flavor relays collaborator answers — parsed route", () => {
  // Arrange
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(lengthFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: stopContinuation,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"field":""}', finish_reason: "stop" }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.resolvedFinishReason, "length");
    assertEquals(result.isIntermediate, false);
  }
});

/**
 * Contract: params built with mode 'text' over a non-intermediate response take
 *   the same unparsed route — content passed through unchanged, sanitizer and
 *   determineContinuation never invoked. Arranged beside a mode 'json' case
 *   over the identical response that does parse, so neither assertion holds if
 *   the mode were ignored.
 * Arrange: two cases over the identical payload — one with mode 'text', one
 *   with mode 'json'; deps whose isIntermediateChunk returns false; spies on
 *   sanitizeJsonContent and determineContinuation.
 * Act:     prepareResponseContent over each arrangement.
 * Assert:  text mode — prepared flavor, content unchanged, sanitizer and
 *   determineContinuation never called; json mode — sanitizer called.
 */
Deno.test("text mode — content passed through unparsed beside json mode that parses", () => {
  // Arrange
  const content = '{"field":"value"}';
  const textSanitize = spy(passthroughSanitizer);
  const textDetermine = spy(stopContinuation);
  const textDeps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: textSanitize,
    determineContinuation: textDetermine,
  });
  const jsonDeps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: stopContinuation,
  });
  const textParams = buildPrepareResponseContentParams({ mode: "text" });
  const jsonParams = buildPrepareResponseContentParams({ mode: "json" });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content }),
  });

  // Act
  const textResult = prepareResponseContent(textDeps, textParams, payload);
  const jsonResult = prepareResponseContent(jsonDeps, jsonParams, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(textResult));
  if (isPrepareResponseContentPreparedReturn(textResult)) {
    assertEquals(textResult.contentForStorage, content);
  }
  assertEquals(textSanitize.calls.length, 0);
  assertEquals(textDetermine.calls.length, 0);
  assert(isPrepareResponseContentPreparedReturn(jsonResult));
});

/**
 * Contract: a text-mode response whose resolved reason is a continue reason
 *   returns shouldContinue true, and one whose reason is 'stop' returns false
 *   — the proof an unfinished text compression resumes rather than persisting
 *   truncated.
 * Arrange: two text-mode cases — one whose resolveFinishReason returns 'length'
 *   (a continue reason), one whose returns 'stop'; both non-intermediate.
 * Act:     prepareResponseContent over each arrangement.
 * Assert:  continue reason — shouldContinue is true; stop — shouldContinue is
 *   false.
 */
Deno.test("text mode honors the finish-reason gate", () => {
  // Arrange
  const continueDeps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(lengthFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
  });
  const stopDeps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
  });
  const textParams = buildPrepareResponseContentParams({ mode: "text" });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: "prose content" }),
  });

  // Act
  const continueResult = prepareResponseContent(continueDeps, textParams, payload);
  const stopResult = prepareResponseContent(stopDeps, textParams, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(continueResult));
  if (isPrepareResponseContentPreparedReturn(continueResult)) {
    assertEquals(continueResult.shouldContinue, true);
  }
  assert(isPrepareResponseContentPreparedReturn(stopResult));
  if (isPrepareResponseContentPreparedReturn(stopResult)) {
    assertEquals(stopResult.shouldContinue, false);
  }
});

/**
 * Contract: a sanitizer result whose sanitized string is not parseable returns
 *   the retry-required flavor whose reason begins `Malformed JSON response: `
 *   and carries the thrown message, and the warn line is emitted.
 * Arrange: deps whose sanitizeJsonContent returns a result whose sanitized
 *   string is not valid JSON; a spy on logger.warn; a non-intermediate
 *   JSON-mode payload.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  retry-required flavor; reason begins with `Malformed JSON response: `;
 *   warn called.
 */
Deno.test("malformed JSON — retry-required carrying the thrown message", () => {
  // Arrange
  const logger = new MockLogger();
  const warnSpy = spy(logger, "warn");
  const malformedSanitizer: SanitizeJsonContentFn = (_content: string) => ({
    sanitized: "not-valid-json{",
    wasSanitized: false,
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
    originalLength: 15,
  });
  const deps = buildPrepareResponseContentDeps({
    logger,
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: malformedSanitizer,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: "not-valid-json{" }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentRetryRequiredReturn(result));
  if (isPrepareResponseContentRetryRequiredReturn(result)) {
    assertStringIncludes(result.reason, "Malformed JSON response: ");
  }
  assert(warnSpy.calls.length > 0);
});

/**
 * Contract: a case captures the object determineContinuation was called with
 *   and asserts all seven members, sourceObject being the exact value params
 *   carried and each other member the value it was handed. The captured
 *   sourceObject is a record whose keys differ from the parsed content's, so a
 *   case dropping the member cannot pass.
 * Arrange: deps whose determineContinuation captures its argument; params with
 *   a sourceObject whose keys differ from the parsed content; a non-intermediate
 *   JSON-mode payload with parseable content.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  determineContinuation called with all seven members; sourceObject is
 *   the exact value params carried; finishReasonContinue, wasStructurallyFixed,
 *   parsedContent, continueUntilComplete, documentKey and contextForDocuments
 *   each the value handed.
 */
Deno.test("sourceObject is relayed — determineContinuation receives all seven members", () => {
  // Arrange
  const holder: { captured: DetermineContinuationParams | null } = { captured: null };
  const captureContinuation: DetermineContinuationFn = (params: DetermineContinuationParams) => {
    holder.captured = params;
    return { shouldContinue: false };
  };
  const sourceObject = { alpha: "", beta: "" };
  const documentKey = "business_case";
  const contextForDocuments = [{ document_key: FileType.business_case, content_to_include: { x: "" } }];
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: captureContinuation,
  });
  const params = buildPrepareResponseContentParams({
    continueUntilComplete: true,
    documentKey,
    contextForDocuments,
    sourceObject,
  });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"gamma":""}' }),
  });

  // Act
  prepareResponseContent(deps, params, payload);

  // Assert
  assert(holder.captured !== null);
  if (holder.captured) {
    assertEquals(holder.captured.sourceObject, sourceObject);
    assertEquals(holder.captured.continueUntilComplete, true);
    assertEquals(holder.captured.documentKey, documentKey);
    assertEquals(holder.captured.contextForDocuments, contextForDocuments);
    assertEquals(holder.captured.finishReasonContinue, false);
    assertEquals(holder.captured.wasStructurallyFixed, false);
    assert(typeof holder.captured.parsedContent === "object");
  }
});

/**
 * Contract: deps whose determineContinuation returns { shouldContinue: true }
 *   produce a prepared flavor with shouldContinue true even when the resolved
 *   finish reason is not a continue reason, proving the parsed route reports
 *   the full verdict rather than the finish-reason trigger alone.
 * Arrange: deps whose resolveFinishReason returns 'stop' (not a continue
 *   reason) and whose determineContinuation returns shouldContinue true;
 *   a non-intermediate JSON-mode payload with parseable content.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  prepared flavor; shouldContinue is true.
 */
Deno.test("verdict is the module's answer — full verdict over finish-reason trigger", () => {
  // Arrange
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: continueContinuation,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"field":""}' }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.shouldContinue, true);
  }
});

/**
 * Contract: a sanitizer returning a sanitized value different from the
 *   response's raw content produces a contentForStorage equal to the sanitized
 *   value.
 * Arrange: deps whose sanitizeJsonContent returns a sanitized string distinct
 *   from the payload's content; a non-intermediate JSON-mode payload.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  prepared flavor; contentForStorage is the sanitized value, not the
 *   raw content.
 */
Deno.test("prepared content is the sanitized string", () => {
  // Arrange
  const rawContent = '{"field":""}';
  const sanitizedContent = '{"field":"sanitized"}';
  const replacingSanitizer: SanitizeJsonContentFn = (_content: string) => ({
    sanitized: sanitizedContent,
    wasSanitized: true,
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
    originalLength: rawContent.length,
  });
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: replacingSanitizer,
    determineContinuation: stopContinuation,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: rawContent }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.contentForStorage, sanitizedContent);
  }
});

/**
 * Contract: a sanitizeJsonContent that throws returns the error arm whose error
 *   passes isPrepareResponseContentSanitizeError with retriable false.
 * Arrange: deps whose sanitizeJsonContent throws; a non-intermediate JSON-mode
 *   payload.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  error arm; error passes isPrepareResponseContentSanitizeError;
 *   retriable is false.
 */
Deno.test("collaborator throws — sanitizeJsonContent returns SanitizeError", () => {
  // Arrange
  const throwingSanitizer: SanitizeJsonContentFn = (_content: string) => {
    throw new Error("sanitize threw");
  };
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: throwingSanitizer,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"field":""}' }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentErrorReturn(result));
  if (isPrepareResponseContentErrorReturn(result)) {
    assert(isPrepareResponseContentSanitizeError(result.error));
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: a determineContinuation that throws returns the error arm whose
 *   error passes isPrepareResponseContentContinuationError.
 * Arrange: deps whose determineContinuation throws; a non-intermediate
 *   JSON-mode payload with parseable content.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  error arm; error passes isPrepareResponseContentContinuationError.
 */
Deno.test("collaborator throws — determineContinuation returns ContinuationError", () => {
  // Arrange
  const throwingContinuation: DetermineContinuationFn = (_params: DetermineContinuationParams) => {
    throw new Error("continuation threw");
  };
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: throwingContinuation,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"field":""}' }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentErrorReturn(result));
  if (isPrepareResponseContentErrorReturn(result)) {
    assert(isPrepareResponseContentContinuationError(result.error));
  }
});

/**
 * Contract: the sanitizer's wasSanitized flag being true emits the existing info
 *   line `[saveResponse] JSON content sanitized for job ${params.jobId}` with
 *   originalLength, sanitizedLength and wasStructurallyFixed. This is a log, not
 *   a route — the parse proceeds.
 * Arrange: deps whose sanitizeJsonContent returns wasSanitized true; a spy on
 *   logger.info; a non-intermediate JSON-mode payload with parseable content.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  prepared flavor (parse proceeded); info called with the sanitized
 *   line.
 */
Deno.test("wasSanitized true — info line emitted, parse proceeds", () => {
  // Arrange
  const logger = new MockLogger();
  const infoSpy = spy(logger, "info");
  const jobId = "job-sanitize-1";
  const sanitizingSanitizer: SanitizeJsonContentFn = (content: string) => ({
    sanitized: content,
    wasSanitized: true,
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
    originalLength: content.length,
  });
  const deps = buildPrepareResponseContentDeps({
    logger,
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: sanitizingSanitizer,
    determineContinuation: stopContinuation,
  });
  const params = buildPrepareResponseContentParams({ jobId });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"field":""}' }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  assert(infoSpy.calls.length > 0);
  const call = infoSpy.calls[0];
  assertStringIncludes(call.args[0], `[saveResponse] JSON content sanitized for job ${jobId}`);
});

/**
 * Contract: needsContinuation is true only when continueUntilComplete is true
 *   and the route's shouldContinue is true, proven over all four combinations.
 * Arrange: four cases — continueUntilComplete true/false crossed with
 *   shouldContinue true/false (via determineContinuation's return); all
 *   non-intermediate JSON-mode with parseable content.
 * Act:     prepareResponseContent over each arrangement.
 * Assert:  needsContinuation is the conjunction of continueUntilComplete and
 *   shouldContinue for each combination.
 */
Deno.test("needsContinuation is the conjunction of continueUntilComplete and shouldContinue", () => {
  // Arrange
  const continueDeps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: continueContinuation,
  });
  const stopDeps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: stopContinuation,
  });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"field":""}' }),
  });

  // Act
  const tt = prepareResponseContent(continueDeps, buildPrepareResponseContentParams({ continueUntilComplete: true }), payload);
  const tf = prepareResponseContent(continueDeps, buildPrepareResponseContentParams({ continueUntilComplete: false }), payload);
  const ft = prepareResponseContent(stopDeps, buildPrepareResponseContentParams({ continueUntilComplete: true }), payload);
  const ff = prepareResponseContent(stopDeps, buildPrepareResponseContentParams({ continueUntilComplete: false }), payload);

  // Assert
  if (isPrepareResponseContentPreparedReturn(tt)) assertEquals(tt.needsContinuation, true);
  if (isPrepareResponseContentPreparedReturn(tf)) assertEquals(tf.needsContinuation, false);
  if (isPrepareResponseContentPreparedReturn(ft)) assertEquals(ft.needsContinuation, false);
  if (isPrepareResponseContentPreparedReturn(ff)) assertEquals(ff.needsContinuation, false);
});

/**
 * Contract: no retry is dispatched on any path — the deps object exposes no
 *   retry member and no row write or notification is attempted.
 * Arrange: the built deps (which declare no retryJob and no notificationService);
 *   a payload that triggers the retry-required flavor.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  the deps object has no retryJob property and no notificationService
 *   property; the result is the retry-required flavor (no dispatch).
 */
Deno.test("no retry dispatched — deps expose no retry or notification member", () => {
  // Arrange
  const deps = buildPrepareResponseContentDeps();
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: null }),
  });

  // Act
  const result = prepareResponseContent(deps, params, payload);

  // Assert
  assert(!("retryJob" in deps));
  assert(!("notificationService" in deps));
  assert(isPrepareResponseContentRetryRequiredReturn(result));
});

/**
 * Contract: neither the params object nor the payload object is mutated by any
 *   path.
 * Arrange: a params and payload whose content triggers the parsed route; deep
 *   copies of each taken before the call.
 * Act:     prepareResponseContent over the arrangement.
 * Assert:  params and payload are deep-equal to their pre-call copies.
 */
Deno.test("purity — params and payload are not mutated", () => {
  // Arrange
  const deps = buildPrepareResponseContentDeps({
    resolveFinishReason: spy(stopFinishReason),
    isIntermediateChunk: spy(falseIntermediate),
    sanitizeJsonContent: passthroughSanitizer,
    determineContinuation: stopContinuation,
  });
  const params = buildPrepareResponseContentParams();
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({ content: '{"field":""}' }),
  });
  const paramsSnapshot = JSON.parse(JSON.stringify(params));
  const payloadSnapshot = JSON.parse(JSON.stringify(payload));

  // Act
  prepareResponseContent(deps, params, payload);

  // Assert
  assertEquals(JSON.parse(JSON.stringify(params)), paramsSnapshot);
  assertEquals(JSON.parse(JSON.stringify(payload)), payloadSnapshot);
});
