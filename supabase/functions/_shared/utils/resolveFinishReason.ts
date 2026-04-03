import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";
import type { FinishReason } from "../types.ts";
import { isFinishReason, isRecord } from "./type_guards.ts";

export function resolveFinishReason(aiResponse: UnifiedAIResponse): FinishReason {
    if (isFinishReason(aiResponse.finish_reason)) {
        return aiResponse.finish_reason;
    }
    if (
        isRecord(aiResponse.rawProviderResponse) &&
        isFinishReason(aiResponse.rawProviderResponse["finish_reason"])
    ) {
        return aiResponse.rawProviderResponse["finish_reason"];
    }
    return null;
}
