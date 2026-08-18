import { assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import {
    buildAssembleAiResponseDeps,
    invalidateAssembleAiResponseDeps,
    buildAssembleAiResponseParams,
    invalidateAssembleAiResponseParams,
    buildAssembleAiResponsePayload,
    invalidateAssembleAiResponsePayload,
    buildAssembleAiResponseSuccessReturn,
    invalidateAssembleAiResponseSuccessReturn,
    buildAssembleAiResponseErrorReturn,
    invalidateAssembleAiResponseErrorReturn,
    buildAssembleAiResponseTokenCountError,
} from "./assembleAiResponse.mock.ts";
import { invalidateTokenUsage, invalidateUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import {
    isAssembleAiResponseDeps,
    isAssembleAiResponseParams,
    isAssembleAiResponsePayload,
    isAssembleAiResponseSuccessReturn,
    isAssembleAiResponseErrorReturn,
    isAssembleAiResponseTokenCountError,
} from "./assembleAiResponse.guard.ts";

Deno.test("Type Guard: isAssembleAiResponseDeps", async (t) => {
    await t.step("accepts the built deps", () => {
        assert(isAssembleAiResponseDeps(buildAssembleAiResponseDeps()));
    });

    await t.step("rejects countTokens absent", () => {
        const { countTokens: _omit, ...rest } = buildAssembleAiResponseDeps();
        assert(!isAssembleAiResponseDeps(rest));
    });

    await t.step("rejects countTokens non-function", () => {
        assert(!isAssembleAiResponseDeps(invalidateAssembleAiResponseDeps({ countTokens: "not-a-fn" })));
    });

    await t.step("rejects countTokens a plain object", () => {
        assert(!isAssembleAiResponseDeps(invalidateAssembleAiResponseDeps({ countTokens: { foo: "bar" } })));
    });

    await t.step("rejects a non-record root", () => {
        assert(!isAssembleAiResponseDeps(null));
        assert(!isAssembleAiResponseDeps("string"));
        assert(!isAssembleAiResponseDeps(42));
    });
});

Deno.test("Type Guard: isAssembleAiResponseParams", async (t) => {
    await t.step("accepts the built params", () => {
        assert(isAssembleAiResponseParams(buildAssembleAiResponseParams()));
    });

    await t.step("rejects processingTimeMs absent", () => {
        const { processingTimeMs: _omit, ...rest } = buildAssembleAiResponseParams();
        assert(!isAssembleAiResponseParams(rest));
    });

    await t.step("rejects processingTimeMs non-numeric", () => {
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ processingTimeMs: "fast" })));
    });

    await t.step("rejects processingTimeMs non-finite", () => {
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ processingTimeMs: Infinity })));
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ processingTimeMs: NaN })));
    });

    await t.step("rejects processingTimeMs negative", () => {
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ processingTimeMs: -1 })));
    });

    await t.step("rejects preflightInputTokens absent", () => {
        const { preflightInputTokens: _omit, ...rest } = buildAssembleAiResponseParams();
        assert(!isAssembleAiResponseParams(rest));
    });

    await t.step("rejects preflightInputTokens non-numeric", () => {
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ preflightInputTokens: "many" })));
    });

    await t.step("rejects preflightInputTokens non-finite", () => {
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ preflightInputTokens: Infinity })));
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ preflightInputTokens: NaN })));
    });

    await t.step("rejects preflightInputTokens negative", () => {
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ preflightInputTokens: -1 })));
    });

    await t.step("rejects modelConfig absent", () => {
        const { modelConfig: _omit, ...rest } = buildAssembleAiResponseParams();
        assert(!isAssembleAiResponseParams(rest));
    });

    await t.step("rejects modelConfig set to a corrupted config (delegation)", () => {
        assert(!isAssembleAiResponseParams(invalidateAssembleAiResponseParams({ modelConfig: { corrupted: true } })));
    });

    await t.step("rejects a non-record root", () => {
        assert(!isAssembleAiResponseParams(null));
        assert(!isAssembleAiResponseParams("string"));
        assert(!isAssembleAiResponseParams(42));
    });
});

Deno.test("Type Guard: isAssembleAiResponsePayload", async (t) => {
    await t.step("accepts the built payload", () => {
        assert(isAssembleAiResponsePayload(buildAssembleAiResponsePayload()));
    });

    await t.step("accepts assembledContent set to the empty string", () => {
        assert(isAssembleAiResponsePayload(buildAssembleAiResponsePayload({ assembledContent: "" })));
    });

    await t.step("accepts tokenUsage null", () => {
        assert(isAssembleAiResponsePayload(buildAssembleAiResponsePayload({ tokenUsage: null })));
    });

    await t.step("accepts finishReason null", () => {
        assert(isAssembleAiResponsePayload(buildAssembleAiResponsePayload({ finishReason: null })));
    });

    await t.step("rejects assembledContent absent", () => {
        const { assembledContent: _omit, ...rest } = buildAssembleAiResponsePayload();
        assert(!isAssembleAiResponsePayload(rest));
    });

    await t.step("rejects assembledContent non-string", () => {
        assert(!isAssembleAiResponsePayload(invalidateAssembleAiResponsePayload({ assembledContent: 123 })));
    });

    await t.step("rejects tokenUsage set to that type's invalidator output", () => {
        assert(!isAssembleAiResponsePayload(invalidateAssembleAiResponsePayload({ tokenUsage: invalidateTokenUsage({ prompt_tokens: "bad" }) })));
    });

    await t.step("rejects finishReason absent", () => {
        const { finishReason: _omit, ...rest } = buildAssembleAiResponsePayload();
        assert(!isAssembleAiResponsePayload(rest));
    });

    await t.step("rejects finishReason non-string", () => {
        assert(!isAssembleAiResponsePayload(invalidateAssembleAiResponsePayload({ finishReason: 123 })));
    });

    await t.step("rejects a non-record root", () => {
        assert(!isAssembleAiResponsePayload(null));
        assert(!isAssembleAiResponsePayload("string"));
        assert(!isAssembleAiResponsePayload(42));
    });
});

Deno.test("Type Guard: isAssembleAiResponseSuccessReturn", async (t) => {
    await t.step("accepts the built return", () => {
        assert(isAssembleAiResponseSuccessReturn(buildAssembleAiResponseSuccessReturn()));
    });

    await t.step("rejects aiResponse absent", () => {
        const { aiResponse: _omit, ...rest } = buildAssembleAiResponseSuccessReturn();
        assert(!isAssembleAiResponseSuccessReturn(rest));
    });

    await t.step("rejects aiResponse set to invalidateUnifiedAIResponse({ content: 42 })", () => {
        assert(!isAssembleAiResponseSuccessReturn(invalidateAssembleAiResponseSuccessReturn({ aiResponse: invalidateUnifiedAIResponse({ content: 42 }) })));
    });

    await t.step("rejects a non-record root", () => {
        assert(!isAssembleAiResponseSuccessReturn(null));
        assert(!isAssembleAiResponseSuccessReturn("string"));
        assert(!isAssembleAiResponseSuccessReturn(42));
    });
});

Deno.test("Type Guard: isAssembleAiResponseErrorReturn", async (t) => {
    await t.step("accepts the built return", () => {
        assert(isAssembleAiResponseErrorReturn(buildAssembleAiResponseErrorReturn()));
    });

    await t.step("rejects error absent", () => {
        const { error: _omit, ...rest } = buildAssembleAiResponseErrorReturn();
        assert(!isAssembleAiResponseErrorReturn(rest));
    });

    await t.step("rejects error a plain object", () => {
        assert(!isAssembleAiResponseErrorReturn(invalidateAssembleAiResponseErrorReturn({ error: { message: "oops" } })));
    });

    await t.step("rejects error a plain Error that is not the owned class", () => {
        assert(!isAssembleAiResponseErrorReturn(invalidateAssembleAiResponseErrorReturn({ error: new Error("plain") })));
    });

    await t.step("rejects retriable absent", () => {
        const { retriable: _omit, ...rest } = buildAssembleAiResponseErrorReturn();
        assert(!isAssembleAiResponseErrorReturn(rest));
    });

    await t.step("rejects retriable non-boolean", () => {
        assert(!isAssembleAiResponseErrorReturn(invalidateAssembleAiResponseErrorReturn({ retriable: "yes" })));
    });

    await t.step("rejects a non-record root", () => {
        assert(!isAssembleAiResponseErrorReturn(null));
        assert(!isAssembleAiResponseErrorReturn("string"));
        assert(!isAssembleAiResponseErrorReturn(42));
    });
});

Deno.test("Type Guard: isAssembleAiResponseTokenCountError", async (t) => {
    await t.step("accepts its builder's instance", () => {
        assert(isAssembleAiResponseTokenCountError(buildAssembleAiResponseTokenCountError()));
    });

    await t.step("rejects a plain Error", () => {
        assert(!isAssembleAiResponseTokenCountError(new Error("plain")));
    });

    await t.step("rejects a plain object carrying the same members", () => {
        const instance = buildAssembleAiResponseTokenCountError();
        const plain = {
            message: instance.message,
            name: instance.name,
            apiIdentifier: instance.apiIdentifier,
            thrownValue: instance.thrownValue,
        };
        assert(!isAssembleAiResponseTokenCountError(plain));
    });

    await t.step("rejects null", () => {
        assert(!isAssembleAiResponseTokenCountError(null));
    });

    await t.step("rejects a primitive", () => {
        assert(!isAssembleAiResponseTokenCountError("string"));
    });
});
