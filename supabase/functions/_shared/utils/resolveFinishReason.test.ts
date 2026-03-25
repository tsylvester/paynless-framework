import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";
import type { FinishReason } from "../types.ts";
import { resolveFinishReason } from "./resolveFinishReason.ts";

Deno.test("resolveFinishReason", async (t: Deno.TestContext) => {
    await t.step(
        "returns finish_reason directly when aiResponse.finish_reason is a valid FinishReason (e.g., 'stop')",
        () => {
            const aiResponse: UnifiedAIResponse = {
                content: null,
                finish_reason: "stop",
            };
            const result: FinishReason = resolveFinishReason(aiResponse);
            assertEquals(result, "stop");
        },
    );

    await t.step(
        "returns finish_reason from rawProviderResponse when top-level finish_reason is not a valid FinishReason but rawProviderResponse['finish_reason'] is",
        () => {
            const aiResponse: UnifiedAIResponse = {
                content: null,
                rawProviderResponse: { finish_reason: "length" },
            };
            const result: FinishReason = resolveFinishReason(aiResponse);
            assertEquals(result, "length");
        },
    );

    await t.step(
        "returns null when neither top-level nor rawProviderResponse contain a valid FinishReason",
        () => {
            const aiResponse: UnifiedAIResponse = {
                content: null,
                rawProviderResponse: {},
            };
            const result: FinishReason = resolveFinishReason(aiResponse);
            assertEquals(result, null);
        },
    );

    await t.step(
        "returns null when rawProviderResponse is undefined",
        () => {
            const aiResponse: UnifiedAIResponse = {
                content: null,
            };
            const result: FinishReason = resolveFinishReason(aiResponse);
            assertEquals(result, null);
        },
    );

    await t.step(
        "returns null when rawProviderResponse is not a record (e.g., a string or number)",
        async (st: Deno.TestContext) => {
            await st.step("string", () => {
                const aiResponse: UnifiedAIResponse = {
                    content: null,
                    rawProviderResponse: "not-a-record",
                } as unknown as UnifiedAIResponse;
                const result: FinishReason = resolveFinishReason(aiResponse);
                assertEquals(result, null);
            });
            await st.step("number", () => {
                const aiResponse: UnifiedAIResponse = {
                    content: null,
                    rawProviderResponse: 42,
                } as unknown as UnifiedAIResponse;
                const result: FinishReason = resolveFinishReason(aiResponse);
                assertEquals(result, null);
            });
        },
    );

    await t.step(
        "prefers top-level finish_reason over rawProviderResponse when both are valid",
        () => {
            const aiResponse: UnifiedAIResponse = {
                content: null,
                finish_reason: "stop",
                rawProviderResponse: { finish_reason: "length" },
            };
            const result: FinishReason = resolveFinishReason(aiResponse);
            assertEquals(result, "stop");
        },
    );

    await t.step(
        "handles each FinishReason union member ('stop', 'length', 'error', 'max_tokens', 'content_truncated', 'next_document', etc.)",
        () => {
            const stringMembers: Exclude<FinishReason, null>[] = [
                "stop",
                "length",
                "tool_calls",
                "content_filter",
                "function_call",
                "error",
                "unknown",
                "max_tokens",
                "content_truncated",
                "next_document",
            ];
            for (const member of stringMembers) {
                const aiResponse: UnifiedAIResponse = {
                    content: null,
                    finish_reason: member,
                };
                const result: FinishReason = resolveFinishReason(aiResponse);
                assertEquals(result, member);
            }
            const nullResponse: UnifiedAIResponse = {
                content: null,
                finish_reason: null,
            };
            const nullResult: FinishReason = resolveFinishReason(nullResponse);
            assertEquals(nullResult, null);
        },
    );
});
