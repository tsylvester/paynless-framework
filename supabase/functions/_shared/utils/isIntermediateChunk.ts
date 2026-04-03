import type { FinishReason } from "../types.ts";
import { isDialecticContinueReason } from "./type_guards.ts";

export function isIntermediateChunk(
    resolvedFinish: FinishReason,
    continueUntilComplete: boolean,
): boolean {
    return isDialecticContinueReason(resolvedFinish) && continueUntilComplete;
}
