import {
    AssembleChunksClassified,
    AssembleChunksDeps,
    AssembleChunksParams,
    AssembleChunksPayload,
    AssembleChunksReturn,
    AssembleChunksSignature,
} from "./assembleChunks.interface.ts";

/**
 * Construction rationale (work plan): this is a shared utility because it eliminates duplication
 * between `gatherContinuationInputs` and `assembleAndSaveFinalDocument`. Dependencies are injected
 * for testability. `mergeObjects` is an internal helper for single responsibility (one exported
 * entry point) while preserving the same merge behavior as `file_manager.ts` lines 752–769.
 * Assembly order is always: classify chunks → group adjacent raw fragments → sanitize each raw
 * group → parse → strip continuation metadata at top level → deep-merge left to right.
 */
export const assembleChunks: AssembleChunksSignature = async (
    deps: AssembleChunksDeps,
    params: AssembleChunksParams,
    payload: AssembleChunksPayload,
): AssembleChunksReturn => {
    void params;
    const chunkCount: number = payload.chunks.length;

    if (chunkCount === 0) {
        const emptyMerged: Record<string, unknown> = {};
        return {
            success: true,
            mergedObject: emptyMerged,
            chunkCount: 0,
            rawGroupCount: 0,
            parseableCount: 0,
        };
    }

    for (let v = 0; v < payload.chunks.length; v++) {
        if (typeof payload.chunks[v] !== "string") {
            return {
                success: false,
                error: "Invalid chunk: expected string.",
                failedAtStep: "classification",
            };
        }
    }

    const toStringKeyRecord = (item: unknown): Record<string, unknown> | null => {
        if (!deps.isRecord(item)) {
            return null;
        }
        const out: Record<string, unknown> = {};
        const keys: string[] = Object.keys(item);
        for (let k = 0; k < keys.length; k++) {
            const key: string = keys[k];
            out[key] = item[key];
        }
        return out;
    };

    const stripContinuationMetadata = (
        obj: Record<string, unknown>,
    ): Record<string, unknown> => {
        const stripped: Record<string, unknown> = { ...obj };
        delete stripped.continuation_needed;
        delete stripped.stop_reason;
        delete stripped.resume_cursor;
        return stripped;
    };

    const mergeObjects = (
        target: Record<string, unknown>,
        source: Record<string, unknown>,
    ): Record<string, unknown> => {
        const merged: Record<string, unknown> = { ...target };
        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                const sourceValue: unknown = source[key];
                const targetValue: unknown = merged[key];
                if (
                    key === "content" &&
                    typeof targetValue === "string" &&
                    typeof sourceValue === "string"
                ) {
                    merged[key] = targetValue + sourceValue;
                } else if (deps.isRecord(targetValue) && deps.isRecord(sourceValue)) {
                    merged[key] = mergeObjects(targetValue, sourceValue);
                } else {
                    merged[key] = sourceValue;
                }
            }
        }
        return merged;
    };

    const classified: AssembleChunksClassified[] = [];
    let parseableCount: number = 0;

    for (let c = 0; c < payload.chunks.length; c++) {
        const chunk: string = payload.chunks[c];
        let parsedCandidate: unknown;
        try {
            parsedCandidate = JSON.parse(chunk);
        } catch {
            classified.push({ type: "raw", content: chunk });
            continue;
        }
        const recordValue: Record<string, unknown> | null = toStringKeyRecord(
            parsedCandidate,
        );
        if (recordValue !== null) {
            classified.push({ type: "parsed", value: recordValue });
            parseableCount += 1;
        } else {
            classified.push({ type: "raw", content: chunk });
        }
    }

    const groups: AssembleChunksClassified[] = [];
    let idx: number = 0;
    while (idx < classified.length) {
        const first: AssembleChunksClassified = classified[idx];
        if (first.type === "parsed") {
            groups.push({ type: "parsed", value: first.value });
            idx += 1;
            continue;
        }
        let concat: string = first.content;
        let next: number = idx + 1;
        while (next < classified.length) {
            const tail: AssembleChunksClassified = classified[next];
            if (tail.type !== "raw") {
                break;
            }
            concat += tail.content;
            next += 1;
        }
        groups.push({ type: "raw", content: concat });
        idx = next;
    }

    let rawGroupCount: number = 0;
    for (let g = 0; g < groups.length; g++) {
        if (groups[g].type === "raw") {
            rawGroupCount += 1;
        }
    }

    const records: Record<string, unknown>[] = [];

    for (let g = 0; g < groups.length; g++) {
        const group: AssembleChunksClassified = groups[g];
        if (group.type === "parsed") {
            records.push(stripContinuationMetadata(group.value));
            continue;
        }
        const sanitizationResult = deps.sanitizeJsonContent(group.content);
        let parsedRaw: unknown;
        try {
            parsedRaw = JSON.parse(sanitizationResult.sanitized);
        } catch {
            return {
                success: false,
                error: "Failed to parse sanitized raw chunk group as JSON.",
                failedAtStep: "sanitization",
            };
        }
        const rawRecord: Record<string, unknown> | null = toStringKeyRecord(parsedRaw);
        if (rawRecord === null) {
            return {
                success: false,
                error: "Sanitized raw chunk group did not parse to a record object.",
                failedAtStep: "parse",
            };
        }
        records.push(stripContinuationMetadata(rawRecord));
    }

    if (records.length === 0) {
        return {
            success: false,
            error: "Merge stage received no records to merge.",
            failedAtStep: "merge",
        };
    }

    let mergedObject: Record<string, unknown>;
    try {
        mergedObject = records[0];
        for (let r = 1; r < records.length; r++) {
            mergedObject = mergeObjects(mergedObject, records[r]);
        }
    } catch {
        return {
            success: false,
            error: "Deep merge failed.",
            failedAtStep: "merge",
        };
    }

    return {
        success: true,
        mergedObject,
        chunkCount,
        rawGroupCount,
        parseableCount,
    };
};
