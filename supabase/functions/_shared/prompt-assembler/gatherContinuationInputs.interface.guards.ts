import {
    GatherContinuationInputsError,
    GatherContinuationInputsReturn,
    GatherContinuationInputsSuccess,
} from "./gatherContinuationInputs.interface.ts";
import { isRecord } from "../utils/type-guards/type_guards.common.ts";

function isMessagesRole(value: unknown): value is GatherContinuationInputsSuccess["messages"][number]["role"] {
    return (
        value === "system" ||
        value === "user" ||
        value === "assistant" ||
        value === "function"
    );
}

function isMessageItem(value: unknown): value is GatherContinuationInputsSuccess["messages"][number] {
    if (!isRecord(value)) return false;
    if (!("role" in value) || !isMessagesRole(value.role)) {
        return false;
    }
    if (!("content" in value)) {
        return false;
    }
    const content: unknown = value.content;
    if (typeof content !== "string" && content !== null) {
        return false;
    }
    if ("id" in value && value.id !== undefined && typeof value.id !== "string") {
        return false;
    }
    if ("name" in value && value.name !== undefined && typeof value.name !== "string") {
        return false;
    }
    return true;
}

/**
 * Narrows `Awaited<GatherContinuationInputsReturn>` to `GatherContinuationInputsSuccess` via `success === true`.
 */
export function isGatherContinuationInputsSuccess(
    value: Awaited<GatherContinuationInputsReturn>,
): value is GatherContinuationInputsSuccess {
    if (!isRecord(value)) return false;
    if (value.success === true) {
        if (!("messages" in value) || !Array.isArray(value.messages)) {
            return false;
        }
        const messages: unknown[] = value.messages;
        for (let i = 0; i < messages.length; i++) {
            if (!isMessageItem(messages[i])) {
                return false;
            }
        }
        return true;
    }
    return false;
}

/**
 * Narrows `Awaited<GatherContinuationInputsReturn>` to `GatherContinuationInputsError` via `success === false`.
 */
export function isGatherContinuationInputsError(
    value: Awaited<GatherContinuationInputsReturn>,
): value is GatherContinuationInputsError {
    if (!isRecord(value)) return false;
    if (value.success === false) {
        if (!("error" in value) || typeof value.error !== "string") {
            return false;
        }
        return true;
    }
    return false;
}
