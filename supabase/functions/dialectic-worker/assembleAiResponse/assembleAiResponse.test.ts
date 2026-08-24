import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { BoundCountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import { assembleAiResponse } from "./assembleAiResponse.ts";
import {
  isAssembleAiResponseSuccessReturn,
  isAssembleAiResponseErrorReturn,
  isAssembleAiResponseTokenCountError,
  isAssembleAiResponseMissingPreflightError,
} from "./assembleAiResponse.guard.ts";
import {
  buildAssembleAiResponseDeps,
  buildAssembleAiResponseParams,
  buildAssembleAiResponsePayload,
} from "./assembleAiResponse.mock.ts";
import { isDialecticContinueReason } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";

/**
 * Contract: given a payload whose tokenUsage is not null and no preflight count, the response
 *   carries those counts unchanged and the counter is never invoked.
 * Arrange: payload with tokenUsage { 10, 20, 30 }; params with preflightInputTokens omitted;
 *   deps whose countTokens returns 999.
 * Act:     assembleAiResponse over the reported-usage payload.
 * Assert:  success arm; tokenUsage is { 10, 20, 30 }; countTokens spy has zero calls.
 */
Deno.test("reported usage is used as given — counter never invoked", () => {
  // Arrange
  const countTokensFn: BoundCountTokensFn = (_payload, _modelConfig) => 999;
  const countTokens = spy(countTokensFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const { preflightInputTokens: _omit, ...params } = buildAssembleAiResponseParams();
  const payload = buildAssembleAiResponsePayload({
    tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.tokenUsage, { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
  }
  assertEquals(countTokens.calls.length, 0);
});

/**
 * Contract: given a payload whose tokenUsage is null and whose content is non-empty,
 *   the response's completion_tokens equals the counter's return, not the content's length.
 * Arrange: payload with tokenUsage null, content "synthesis test content" (22 chars);
 *   deps whose countTokens returns 7.
 * Act:     assembleAiResponse over the synthesis payload.
 * Assert:  success arm; completion_tokens is 7 (not 22).
 */
Deno.test("synthesis counts real tokens — completion_tokens is the counted value", () => {
  // Arrange
  const countTokensFn: BoundCountTokensFn = (_payload, _modelConfig) => 7;
  const countTokens = spy(countTokensFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const params = buildAssembleAiResponseParams({ preflightInputTokens: 200 });
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "synthesis test content",
    tokenUsage: null,
  });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.tokenUsage!.completion_tokens, 7);
  }
});

/**
 * Contract: given the same synthesis arrangement, prompt_tokens equals
 *   params.preflightInputTokens and total_tokens equals that plus the counted number.
 * Arrange: payload with tokenUsage null, content "synthesis test content";
 *   params with preflightInputTokens 200; deps whose countTokens returns 7.
 * Act:     assembleAiResponse over the synthesis payload.
 * Assert:  success arm; prompt_tokens is 200; total_tokens is 207.
 */
Deno.test("synthesis uses the params' preflight — prompt_tokens and total_tokens", () => {
  // Arrange
  const countTokensFn: BoundCountTokensFn = (_payload, _modelConfig) => 7;
  const countTokens = spy(countTokensFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const params = buildAssembleAiResponseParams({ preflightInputTokens: 200 });
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "synthesis test content",
    tokenUsage: null,
  });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.tokenUsage!.prompt_tokens, 200);
    assertEquals(result.aiResponse.tokenUsage!.total_tokens, 207);
  }
});

/**
 * Contract: given the same synthesis arrangement with padded content, the counter is
 *   called once with payload.message set to the trimmed content and the params' modelConfig.
 * Arrange: payload with tokenUsage null, content "  hello world  " (trimmed "hello world");
 *   params with a built modelConfig; deps whose countTokens returns 5.
 * Act:     assembleAiResponse over the padded synthesis payload.
 * Assert:  countTokens called once; first arg message is "hello world"; second arg is params.modelConfig.
 */
Deno.test("counter is called with the trimmed content and the params' config", () => {
  // Arrange
  const countTokensFn: BoundCountTokensFn = (_payload, _modelConfig) => 5;
  const countTokens = spy(countTokensFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const params = buildAssembleAiResponseParams();
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "  hello world  ",
    tokenUsage: null,
  });

  // Act
  assembleAiResponse(deps, params, payload);

  // Assert
  assertEquals(countTokens.calls.length, 1);
  assertEquals(countTokens.calls[0].args[0], { message: "hello world" });
  assertEquals(countTokens.calls[0].args[1], params.modelConfig);
});

/**
 * Contract: given a payload whose tokenUsage is null and whose content is whitespace, with no
 *   preflight count, the response's content is null, tokenUsage is null, inputTokens and
 *   outputTokens are absent, and the counter is never invoked.
 * Arrange: payload with tokenUsage null, content "   " (whitespace); params with
 *   preflightInputTokens omitted; deps with a countTokens spy.
 * Act:     assembleAiResponse over the empty-content payload.
 * Assert:  success arm; content is null; tokenUsage is null; inputTokens and outputTokens are undefined;
 *   countTokens spy has zero calls.
 */
Deno.test("empty content suppresses synthesis — null content, null usage, no counter call", () => {
  // Arrange
  const countTokensFn: BoundCountTokensFn = (_payload, _modelConfig) => 999;
  const countTokens = spy(countTokensFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const { preflightInputTokens: _omit, ...params } = buildAssembleAiResponseParams();
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "   ",
    tokenUsage: null,
  });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.content, null);
    assertEquals(result.aiResponse.tokenUsage, null);
    assertEquals(result.aiResponse.inputTokens, undefined);
    assertEquals(result.aiResponse.outputTokens, undefined);
  }
  assertEquals(countTokens.calls.length, 0);
});

/**
 * Contract: given params with a distinct processingTimeMs, the response carries that number,
 *   which differs from every other number in the arrangement.
 * Arrange: params with processingTimeMs 555; payload with reported tokenUsage (no synthesis).
 * Act:     assembleAiResponse over the reported-usage payload.
 * Assert:  success arm; processingTimeMs is 555.
 */
Deno.test("elapsed time is the params' processingTimeMs", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const params = buildAssembleAiResponseParams({ processingTimeMs: 555 });
  const payload = buildAssembleAiResponsePayload();

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.processingTimeMs, 555);
  }
});

/**
 * Contract: given a payload with finishReason null, the resolved reason is 'unknown'
 *   on both the response's finish_reason and its rawProviderResponse.
 * Arrange: payload with finishReason null; reported tokenUsage (no synthesis).
 * Act:     assembleAiResponse over the null-reason payload.
 * Assert:  success arm; finish_reason is 'unknown'; rawProviderResponse.finish_reason is 'unknown'.
 */
Deno.test("reported-none reason — finishReason null resolves to 'unknown'", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const payload = buildAssembleAiResponsePayload({ finishReason: null });

  // Act
  const result = assembleAiResponse(deps, buildAssembleAiResponseParams(), payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.finish_reason, "unknown");
    assertEquals(result.aiResponse.rawProviderResponse!.finish_reason, "unknown");
  }
});

/**
 * Contract: given a payload with finishReason 'length', the resolved reason is 'length'
 *   on both the response's finish_reason and its rawProviderResponse.
 * Arrange: payload with finishReason 'length'; reported tokenUsage (no synthesis).
 * Act:     assembleAiResponse over the recognized-reason payload.
 * Assert:  success arm; finish_reason is 'length'; rawProviderResponse.finish_reason is 'length'.
 */
Deno.test("recognized reason — finishReason 'length' resolves to 'length'", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const payload = buildAssembleAiResponsePayload({ finishReason: "length" });

  // Act
  const result = assembleAiResponse(deps, buildAssembleAiResponseParams(), payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.finish_reason, "length");
    assertEquals(result.aiResponse.rawProviderResponse!.finish_reason, "length");
  }
});

/**
 * Contract: given a payload with finishReason 'not_a_reason', the resolved reason is 'unknown'
 *   on both the response's finish_reason and its rawProviderResponse, and assembly proceeds.
 * Arrange: payload with finishReason 'not_a_reason'; reported tokenUsage (no synthesis).
 * Act:     assembleAiResponse over the unrecognized-reason payload.
 * Assert:  success arm; finish_reason is 'unknown'; rawProviderResponse.finish_reason is 'unknown'.
 */
Deno.test("unrecognized reason — finishReason 'not_a_reason' resolves to 'unknown'", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const payload = buildAssembleAiResponsePayload({ finishReason: "not_a_reason" });

  // Act
  const result = assembleAiResponse(deps, buildAssembleAiResponseParams(), payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.finish_reason, "unknown");
    assertEquals(result.aiResponse.rawProviderResponse!.finish_reason, "unknown");
  }
});

/**
 * Contract: a response whose resolved reason is 'unknown' passes isDialecticContinueReason,
 *   which is what makes a truncated object resume rather than complete.
 * Arrange: payload with finishReason null (resolves to 'unknown'); reported tokenUsage.
 * Act:     assembleAiResponse, then check the resolved reason against isDialecticContinueReason.
 * Assert:  isDialecticContinueReason(finish_reason) is true.
 */
Deno.test("unresolved reason resumes — 'unknown' passes isDialecticContinueReason", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const payload = buildAssembleAiResponsePayload({ finishReason: null });

  // Act
  const result = assembleAiResponse(deps, buildAssembleAiResponseParams(), payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assert(isDialecticContinueReason(result.aiResponse.finish_reason));
  }
});

/**
 * Contract: given deps whose countTokens throws a named Error, over a payload that would
 *   synthesize, the return is the error arm; the error passes isAssembleAiResponseTokenCountError,
 *   its apiIdentifier is the config's identifier, its thrownValue is the stringified error,
 *   and retriable is false.
 * Arrange: payload with tokenUsage null, non-empty content; deps whose countTokens throws
 *   new Error("boom"); params with default modelConfig (api_identifier "dummy-model-v1").
 * Act:     assembleAiResponse over the throwing-counter payload.
 * Assert:  error arm; error is AssembleAiResponseTokenCountError; apiIdentifier is "dummy-model-v1";
 *   thrownValue is "Error: boom"; retriable is false.
 */
Deno.test("counter threw an Error — error arm with stringified thrown value", () => {
  // Arrange
  const throwingFn: BoundCountTokensFn = (_payload, _modelConfig) => {
    throw new Error("boom");
  };
  const countTokens = spy(throwingFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "content that would synthesize",
    tokenUsage: null,
  });

  // Act
  const result = assembleAiResponse(deps, buildAssembleAiResponseParams(), payload);

  // Assert
  assert(isAssembleAiResponseErrorReturn(result));
  if (isAssembleAiResponseErrorReturn(result)) {
    assert(isAssembleAiResponseTokenCountError(result.error));
    assertEquals(result.error.apiIdentifier, "dummy-model-v1");
    assertEquals(result.error.thrownValue, "Error: boom");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: given the same arrangement but countTokens throws a string, the return is the
 *   same error arm carrying that string as thrownValue.
 * Arrange: payload with tokenUsage null, non-empty content; deps whose countTokens throws "oops".
 * Act:     assembleAiResponse over the throwing-counter payload.
 * Assert:  error arm; thrownValue is "oops"; retriable is false.
 */
Deno.test("counter threw a non-Error — string carried as thrownValue", () => {
  // Arrange
  const throwingFn: BoundCountTokensFn = (_payload, _modelConfig) => {
    throw "oops";
  };
  const countTokens = spy(throwingFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "content that would synthesize",
    tokenUsage: null,
  });

  // Act
  const result = assembleAiResponse(deps, buildAssembleAiResponseParams(), payload);

  // Assert
  assert(isAssembleAiResponseErrorReturn(result));
  if (isAssembleAiResponseErrorReturn(result)) {
    assert(isAssembleAiResponseTokenCountError(result.error));
    assertEquals(result.error.thrownValue, "oops");
    assertEquals(result.retriable, false);
  }
});

/**
 * Contract: a successful assembly's rawProviderResponse carries the same usage object
 *   contents and the same resolved reason as the response's own members.
 * Arrange: payload with reported tokenUsage { 10, 20, 30 } and finishReason 'length'.
 * Act:     assembleAiResponse over the reported-usage, recognized-reason payload.
 * Assert:  success arm; rawProviderResponse.token_usage equals tokenUsage;
 *   rawProviderResponse.finish_reason equals finish_reason.
 */
Deno.test("raw provider composition — same usage and reason as the response", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const payload = buildAssembleAiResponsePayload({
    tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finishReason: "length",
  });

  // Act
  const result = assembleAiResponse(deps, buildAssembleAiResponseParams(), payload);

  // Assert
  assert(isAssembleAiResponseSuccessReturn(result));
  if (isAssembleAiResponseSuccessReturn(result)) {
    assertEquals(result.aiResponse.rawProviderResponse!.token_usage, { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
    assertEquals(result.aiResponse.rawProviderResponse!.finish_reason, "length");
  }
});

/**
 * Contract: neither the params object nor the payload object is mutated by any path,
 *   asserted on their members after the call.
 * Arrange: params with distinct values; payload with whitespace content and null tokenUsage
 *   (the synthesis-suppression path, which trims and reads members but must not mutate).
 * Act:     assembleAiResponse over the purity-test arrangement.
 * Assert:  params members unchanged; payload members unchanged.
 */
Deno.test("purity — params and payload are not mutated", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const params = buildAssembleAiResponseParams({ processingTimeMs: 555, preflightInputTokens: 777 });
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "  purity test  ",
    tokenUsage: null,
    finishReason: null,
  });

  // Act
  assembleAiResponse(deps, params, payload);

  // Assert
  assertEquals(params.processingTimeMs, 555);
  assertEquals(params.preflightInputTokens, 777);
  assertEquals(params.modelConfig.api_identifier, "dummy-model-v1");
  assertEquals(payload.assembledContent, "  purity test  ");
  assertEquals(payload.tokenUsage, null);
  assertEquals(payload.finishReason, null);
});

/**
 * Contract: given no provider usage, non-empty content, and no preflight count, the return is
 *   the error arm carrying AssembleAiResponseMissingPreflightError with retriable false, and
 *   the counter is never invoked.
 * Arrange: payload with tokenUsage null, content "content that would synthesize"; params with
 *   preflightInputTokens omitted; deps with a countTokens spy.
 * Act:     assembleAiResponse over the no-count synthesis payload.
 * Assert:  error arm; error is AssembleAiResponseMissingPreflightError; retriable is false;
 *   countTokens spy has zero calls.
 */
Deno.test("no preflight count — error arm with AssembleAiResponseMissingPreflightError", () => {
  // Arrange
  const countTokensFn: BoundCountTokensFn = (_payload, _modelConfig) => 999;
  const countTokens = spy(countTokensFn);
  const deps = buildAssembleAiResponseDeps({ countTokens });
  const { preflightInputTokens: _omit, ...params } = buildAssembleAiResponseParams();
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "content that would synthesize",
    tokenUsage: null,
  });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseErrorReturn(result));
  if (isAssembleAiResponseErrorReturn(result)) {
    assert(isAssembleAiResponseMissingPreflightError(result.error));
    assertEquals(result.retriable, false);
  }
  assertEquals(countTokens.calls.length, 0);
});

/**
 * Contract: the missing-preflight error's apiIdentifier is the params' modelConfig.api_identifier,
 *   asserted against an independent literal.
 * Arrange: payload with tokenUsage null, non-empty content; params with preflightInputTokens
 *   omitted and the default modelConfig (api_identifier "dummy-model-v1").
 * Act:     assembleAiResponse over the no-count synthesis payload.
 * Assert:  error arm; error's apiIdentifier is "dummy-model-v1".
 */
Deno.test("missing-preflight error's apiIdentifier is the params' modelConfig.api_identifier", () => {
  // Arrange
  const deps = buildAssembleAiResponseDeps();
  const { preflightInputTokens: _omit, ...params } = buildAssembleAiResponseParams();
  const payload = buildAssembleAiResponsePayload({
    assembledContent: "content that would synthesize",
    tokenUsage: null,
  });

  // Act
  const result = assembleAiResponse(deps, params, payload);

  // Assert
  assert(isAssembleAiResponseErrorReturn(result));
  if (isAssembleAiResponseErrorReturn(result)) {
    assert(isAssembleAiResponseMissingPreflightError(result.error));
    assertEquals(result.error.apiIdentifier, "dummy-model-v1");
  }
});
