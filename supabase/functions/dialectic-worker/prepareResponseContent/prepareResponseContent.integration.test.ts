import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { prepareResponseContent } from "./prepareResponseContent.ts";
import { isPrepareResponseContentPreparedReturn } from "./prepareResponseContent.guard.ts";
import {
  buildPrepareResponseContentParams,
  buildPrepareResponseContentPayload,
} from "./prepareResponseContent.mock.ts";
import { buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import { resolveFinishReason } from "../../_shared/utils/resolveFinishReason.ts";
import { isIntermediateChunk } from "../../_shared/utils/isIntermediateChunk.ts";
import { sanitizeJsonContent } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.ts";
import { determineContinuation } from "../../_shared/utils/determineContinuation/determineContinuation.ts";
import type { PrepareResponseContentDeps } from "./prepareResponseContent.interface.ts";

// Boundary: the four collaborators. The real resolveFinishReason,
// isIntermediateChunk, sanitizeJsonContent and determineContinuation run against
// the real prepareResponseContent; no repo-owned function is mocked and nothing
// external participates.
// Mocked: nothing, so this test proves the chain from a raw model response to a
// completeness verdict and nothing about persistence.

const realDeps: PrepareResponseContentDeps = {
  logger: new MockLogger(),
  resolveFinishReason,
  isIntermediateChunk,
  sanitizeJsonContent,
  determineContinuation,
};

/**
 * Contract: a JSON-mode response whose parsed content omits a key present in
 *   sourceObject yields a prepared flavor with shouldContinue true — the
 *   source-verification trigger reached through the real determineContinuation,
 *   which is the behavior the missing member disabled.
 * Arrange: params with mode 'json', continueUntilComplete true, and a
 *   sourceObject carrying a key the parsed content does not; a payload whose
 *   content is valid JSON missing that key and whose finish_reason is 'stop'.
 * Act:     prepareResponseContent over the real collaborators.
 * Assert:  prepared flavor; shouldContinue is true.
 * Boundary: the four collaborators — real resolveFinishReason,
 *   isIntermediateChunk, sanitizeJsonContent and determineContinuation run
 *   against real prepareResponseContent.
 * Mocked: nothing — this proves the chain from raw model response to
 *   completeness verdict, nothing about persistence.
 */
Deno.test("prepareResponseContent integration: missing sourceObject key triggers shouldContinue true", () => {
  // Arrange
  const sourceObject = { alpha: "", beta: "", gamma: "" };
  const params = buildPrepareResponseContentParams({
    mode: "json",
    continueUntilComplete: true,
    sourceObject,
  });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({
      content: '{"alpha": "", "beta": ""}',
      finish_reason: "stop",
    }),
  });

  // Act
  const result = prepareResponseContent(realDeps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.shouldContinue, true);
  }
});

/**
 * Contract: a JSON-mode response whose parsed content carries every sourceObject
 *   key and whose finish reason is 'stop' yields shouldContinue false. Arranged
 *   beside the case above so neither assertion holds if sourceObject were
 *   dropped from the call.
 * Arrange: params with mode 'json', continueUntilComplete true, and the same
 *   sourceObject as the case above; a payload whose content is valid JSON
 *   carrying all three sourceObject keys and whose finish_reason is 'stop'.
 * Act:     prepareResponseContent over the real collaborators.
 * Assert:  prepared flavor; shouldContinue is false.
 * Boundary: the four collaborators — real resolveFinishReason,
 *   isIntermediateChunk, sanitizeJsonContent and determineContinuation run
 *   against real prepareResponseContent.
 * Mocked: nothing — this proves the chain from raw model response to
 *   completeness verdict, nothing about persistence.
 */
Deno.test("prepareResponseContent integration: complete sourceObject keys yield shouldContinue false", () => {
  // Arrange
  const sourceObject = { alpha: "", beta: "", gamma: "" };
  const params = buildPrepareResponseContentParams({
    mode: "json",
    continueUntilComplete: true,
    sourceObject,
  });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({
      content: '{"alpha": "", "beta": "", "gamma": ""}',
      finish_reason: "stop",
    }),
  });

  // Act
  const result = prepareResponseContent(realDeps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.shouldContinue, false);
  }
});

/**
 * Contract: a response requiring structural repair yields shouldContinue true
 *   through the real sanitizer's wasStructurallyFixed, proving that trigger
 *   survives the extraction.
 * Arrange: params with mode 'json', continueUntilComplete false, and a
 *   sourceObject whose keys the parsed content carries; a payload whose content
 *   is JSON missing its closing brace (so the real sanitizer repairs it,
 *   setting wasStructurallyFixed true) and whose finish_reason is 'stop'.
 * Act:     prepareResponseContent over the real collaborators.
 * Assert:  prepared flavor; shouldContinue is true.
 * Boundary: the four collaborators — real resolveFinishReason,
 *   isIntermediateChunk, sanitizeJsonContent and determineContinuation run
 *   against real prepareResponseContent.
 * Mocked: nothing — this proves the chain from raw model response to
 *   completeness verdict, nothing about persistence.
 */
Deno.test("prepareResponseContent integration: structural repair triggers shouldContinue true", () => {
  // Arrange
  const sourceObject = { alpha: "" };
  const params = buildPrepareResponseContentParams({
    mode: "json",
    continueUntilComplete: false,
    sourceObject,
  });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({
      content: '{"alpha": ""',
      finish_reason: "stop",
    }),
  });

  // Act
  const result = prepareResponseContent(realDeps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.shouldContinue, true);
  }
});

/**
 * Contract: a text-mode response of freeform prose yields a prepared flavor
 *   whose content is the prose unchanged, with shouldContinue taken from the
 *   finish reason alone.
 * Arrange: params with mode 'text' and continueUntilComplete true; a payload
 *   whose content is freeform prose and whose finish_reason is 'stop'.
 * Act:     prepareResponseContent over the real collaborators.
 * Assert:  prepared flavor; contentForStorage is the prose unchanged;
 *   shouldContinue is false (stop is not a continue reason).
 * Boundary: the four collaborators — real resolveFinishReason,
 *   isIntermediateChunk, sanitizeJsonContent and determineContinuation run
 *   against real prepareResponseContent.
 * Mocked: nothing — this proves the chain from raw model response to
 *   completeness verdict, nothing about persistence.
 */
Deno.test("prepareResponseContent integration: text-mode prose passed through unchanged", () => {
  // Arrange
  const prose = "This is freeform prose content for text mode compression.";
  const params = buildPrepareResponseContentParams({
    mode: "text",
    continueUntilComplete: true,
  });
  const payload = buildPrepareResponseContentPayload({
    aiResponse: buildUnifiedAIResponse({
      content: prose,
      finish_reason: "stop",
    }),
  });

  // Act
  const result = prepareResponseContent(realDeps, params, payload);

  // Assert
  assert(isPrepareResponseContentPreparedReturn(result));
  if (isPrepareResponseContentPreparedReturn(result)) {
    assertEquals(result.contentForStorage, prose);
    assertEquals(result.shouldContinue, false);
  }
});
