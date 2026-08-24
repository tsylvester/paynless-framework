import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AssembleAiResponseTokenCountError } from "./assembleAiResponse.interface.ts";
import type {
  AssembleAiResponseDeps,
  AssembleAiResponseParams,
  AssembleAiResponsePayload,
  AssembleAiResponseSuccessReturn,
  AssembleAiResponseErrorReturn,
  AssembleAiResponseReturn,
  AssembleAiResponseFn,
  AssembleAiResponseMissingPreflightErrorConstructorParams,
  AssembleAiResponseTokenCountErrorConstructorParams,
} from "./assembleAiResponse.interface.ts";

/** Contract: AssembleAiResponseDeps' required key surface is exactly countTokens. */
Deno.test("AssembleAiResponseDeps has the required surface", () => {
  const surface: Record<keyof AssembleAiResponseDeps, true> = {
    countTokens: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: AssembleAiResponseParams' required key surface is exactly processingTimeMs, preflightInputTokens and modelConfig. */
Deno.test("AssembleAiResponseParams has the required surface", () => {
  const surface: Record<keyof AssembleAiResponseParams, true> = {
    processingTimeMs: true,
    preflightInputTokens: true,
    modelConfig: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

/** Contract: AssembleAiResponsePayload's required key surface is exactly assembledContent, tokenUsage and finishReason, proving the stream result is the payload and the caller's measurements are not. */
Deno.test("AssembleAiResponsePayload has the required surface", () => {
  const surface: Record<keyof AssembleAiResponsePayload, true> = {
    assembledContent: true,
    tokenUsage: true,
    finishReason: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});

/** Contract: AssembleAiResponseSuccessReturn's required key surface is exactly aiResponse. */
Deno.test("AssembleAiResponseSuccessReturn has the required surface", () => {
  const surface: Record<keyof AssembleAiResponseSuccessReturn, true> = {
    aiResponse: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: AssembleAiResponseErrorReturn's required key surface is exactly error and retriable. */
Deno.test("AssembleAiResponseErrorReturn has the required surface", () => {
  const surface: Record<keyof AssembleAiResponseErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: AssembleAiResponseErrorReturn is a member of AssembleAiResponseReturn, proving the union admits the error arm. */
Deno.test("AssembleAiResponseErrorReturn is a member of AssembleAiResponseReturn", () => {
  const errorReturn: AssembleAiResponseErrorReturn = {
    error: new AssembleAiResponseTokenCountError({
      apiIdentifier: "test-api-identifier",
      thrownValue: "test thrown value",
    }),
    retriable: false,
  };
  const result: AssembleAiResponseReturn = errorReturn;
  assertEquals(result, errorReturn);
});

/** Contract: AssembleAiResponseTokenCountErrorConstructorParams' required key surface is exactly apiIdentifier and thrownValue. */
Deno.test("AssembleAiResponseTokenCountErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof AssembleAiResponseTokenCountErrorConstructorParams,
    true
  > = {
    apiIdentifier: true,
    thrownValue: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: AssembleAiResponseFn's declared return is AssembleAiResponseReturn, proving the signature is synchronous — the module performs no IO and awaits nothing. */
Deno.test("AssembleAiResponseFn resolves to its declared return type", () => {
  const errorReturn: AssembleAiResponseErrorReturn = {
    error: new AssembleAiResponseTokenCountError({
      apiIdentifier: "test-api-identifier",
      thrownValue: "test thrown value",
    }),
    retriable: false,
  };
  const returned: ReturnType<AssembleAiResponseFn> = errorReturn;
  const declared: AssembleAiResponseReturn = returned;
  assertEquals(declared, errorReturn);
});

/** Contract: AssembleAiResponseParams.preflightInputTokens admits undefined, proving the count is optional. */
Deno.test("AssembleAiResponseParams.preflightInputTokens admits undefined", () => {
  const preflightInputTokens: AssembleAiResponseParams["preflightInputTokens"] =
    undefined;
  assertEquals(preflightInputTokens, undefined);
});

/** Contract: AssembleAiResponseMissingPreflightErrorConstructorParams' required key surface is exactly apiIdentifier. */
Deno.test("AssembleAiResponseMissingPreflightErrorConstructorParams has the required surface", () => {
  const surface: Record<
    keyof AssembleAiResponseMissingPreflightErrorConstructorParams,
    true
  > = {
    apiIdentifier: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});
