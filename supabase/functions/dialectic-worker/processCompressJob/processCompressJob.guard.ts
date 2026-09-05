import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticJobRow } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import type {
    BoundProcessCompressJobFn,
    ProcessCompressJobDeps,
    ProcessCompressJobErrorReturn,
    ProcessCompressJobFn,
    ProcessCompressJobParams,
    ProcessCompressJobPayload,
    ProcessCompressJobReturn,
    ProcessCompressJobSuccessReturn,
} from "./processCompressJob.interface.ts";

export function isProcessCompressJobDeps(
    value: unknown,
): value is ProcessCompressJobDeps {
    if (!isRecord(value)) {
        return false;
    }

    const requiredKeys: (keyof ProcessCompressJobDeps)[] = [
        "assembleCompressionPrompt",
        "assembleContinuationPrompt",
        "prepareModelJob",
        "constructStoragePath",
        "logger",
    ];
    for (const key of requiredKeys) {
        if (!(key in value)) {
            return false;
        }
    }

    if (typeof value.assembleCompressionPrompt !== "function") {
        return false;
    }
    if (typeof value.assembleContinuationPrompt !== "function") {
        return false;
    }
    if (typeof value.prepareModelJob !== "function") {
        return false;
    }
    if (typeof value.constructStoragePath !== "function") {
        return false;
    }
    if (!isRecord(value.logger)) {
        return false;
    }

    return true;
}

export function isProcessCompressJobParams(
    value: unknown,
): value is ProcessCompressJobParams {
    if (!isRecord(value)) {
        return false;
    }

    const requiredKeys: (keyof ProcessCompressJobParams)[] = [
        "dbClient",
    ];
    for (const key of requiredKeys) {
        if (!(key in value)) {
            return false;
        }
    }

    if (!isRecord(value.dbClient)) {
        return false;
    }

    return true;
}

export function isProcessCompressJobPayload(
    value: unknown,
): value is ProcessCompressJobPayload {
    if (!isRecord(value)) {
        return false;
    }
    if (!("job" in value) || !isDialecticJobRow(value.job)) {
        return false;
    }
    return true;
}

export function isProcessCompressJobSuccessReturn(
    value: unknown,
): value is ProcessCompressJobSuccessReturn {
    if (!isRecord(value)) {
        return false;
    }
    if (!("queued" in value)) {
        return false;
    }
    if ("error" in value) {
        return false;
    }
    return typeof value.queued === "boolean";
}

export function isProcessCompressJobErrorReturn(
    value: unknown,
): value is ProcessCompressJobErrorReturn {
    if (!isRecord(value)) {
        return false;
    }
    if (!("error" in value) || !("retriable" in value)) {
        return false;
    }
    if (typeof value.retriable !== "boolean") {
        return false;
    }
    return value.error instanceof Error;
}

export function isProcessCompressJobReturn(
    value: unknown,
): value is ProcessCompressJobReturn {
    return (
        isProcessCompressJobSuccessReturn(value) ||
        isProcessCompressJobErrorReturn(value)
    );
}

export function isProcessCompressJobFn(
    value: unknown,
): value is ProcessCompressJobFn {
    return typeof value === "function";
}

export function isBoundProcessCompressJobFn(
    value: unknown,
): value is BoundProcessCompressJobFn {
    return typeof value === "function";
}
