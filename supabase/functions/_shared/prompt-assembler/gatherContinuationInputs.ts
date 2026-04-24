import { Database } from "../../types_db.ts";
import { ContextForDocument } from "../../dialectic-service/dialectic.interface.ts";
import { sanitizeJsonContent } from "../utils/jsonSanitizer/jsonSanitizer.ts";
import { isRecord } from "../utils/type-guards/type_guards.common.ts";
import { Messages } from "../types.ts";
import {
    GatherContinuationInputsError,
    GatherContinuationInputsReturn,
    GatherContinuationInputsSignature,
} from "./gatherContinuationInputs.interface.ts";

const GENERIC_CONTINUATION_INSTRUCTION = "Please continue from where it ends.";

const TRUNCATION_INSTRUCTION_BASE: string =
    "Continue the JSON object from exactly where it ends. Do not restart the object or repeat prior content.";

function buildTruncationContinuationInstruction(anchorKey: string | null): string {
    if (anchorKey === null) {
        return TRUNCATION_INSTRUCTION_BASE;
    }
    return `${TRUNCATION_INSTRUCTION_BASE} The incomplete or empty value is at top-level key "${anchorKey}".`;
}

/**
 * Paths 1/3 (`Continuation-to-Retry bug.md` §3.2): when the last chunk is a raw fragment or was
 * structurally repaired, anchor continuation at the last top-level key of the assembled object
 * when structural fix indicates truncation at that key; otherwise base-only when the merged object
 * is empty.
 */
function findTruncationAnchorKey(
    assembledObject: Record<string, unknown>,
    wasStructurallyFixed: boolean,
): string | null {
    const keys: string[] = Object.keys(assembledObject);
    if (keys.length === 0) {
        return null;
    }
    if (wasStructurallyFixed) {
        const lastKey: string | undefined = keys[keys.length - 1];
        return lastKey === undefined ? null : lastKey;
    }
    return null;
}

function createError(error: string): Awaited<GatherContinuationInputsReturn> {
    const result: GatherContinuationInputsError = {
        success: false,
        error,
    };
    return result;
}

function listMissingTopLevelKeys(
    assembledObject: Record<string, unknown>,
    expectedSchema: ContextForDocument,
): string[] {
    const expectedKeys: string[] = Object.keys(expectedSchema.content_to_include);
    const missingKeys: string[] = [];
    for (let i = 0; i < expectedKeys.length; i++) {
        const key: string = expectedKeys[i];
        if (!(key in assembledObject)) {
            missingKeys.push(key);
        }
    }
    return missingKeys;
}

function buildMissingKeysInstruction(missingKeys: string[]): string {
    return `Please continue from where it ends and include the missing keys: ${
        missingKeys.join(", ")
    }.`;
}

function buildResumeCursorInstruction(resumeCursor: unknown): string {
    return `Please continue from resume_cursor ${JSON.stringify(resumeCursor)}.`;
}

/**
 * Construction rationale: this function uses a DI signature (`deps`, `params`, `payload`) to keep
 * storage/database/chunk-assembly dependencies injected and testable. `ContextForDocument` is used
 * for schema-aware missing-key guidance instead of a primitive record. The function always returns
 * exactly three messages: user seed prompt, assistant assembled document JSON, and user continuation instruction.
 */
export const gatherContinuationInputs: GatherContinuationInputsSignature = async (
    deps,
    params,
    payload,
): GatherContinuationInputsReturn => {
    const chunkId: string = params.chunkId;

    const { data: rootChunk, error: rootChunkError } = await deps.dbClient
        .from("dialectic_contributions")
        .select("*")
        .eq("id", chunkId)
        .single();

    if (rootChunkError || !rootChunk) {
        return createError(`Failed to retrieve root contribution for id ${chunkId}.`);
    }

    if (
        !rootChunk.stage || typeof rootChunk.stage !== "string" ||
        rootChunk.stage.trim().length === 0
    ) {
        return createError(`Root contribution ${chunkId} has no stage information`);
    }

    const stageSlug: string = rootChunk.stage;
    const queryMatcher: Record<string, string> = { [stageSlug]: chunkId };
    const { data: allChunks, error: chunksError } = await deps.dbClient
        .from("dialectic_contributions")
        .select("*")
        .contains("document_relationships", queryMatcher);

    if (chunksError) {
        return createError(`Failed to retrieve contribution chunks for root ${chunkId}.`);
    }

    const chunksForAssembly: Database["public"]["Tables"]["dialectic_contributions"]["Row"][] = Array.isArray(allChunks)
        ? allChunks
        : [];
    const combinedChunks: Database["public"]["Tables"]["dialectic_contributions"]["Row"][] = [...chunksForAssembly];
    if (!combinedChunks.some((c) => c.id === rootChunk.id)) {
        combinedChunks.push(rootChunk);
    }

    const getTurnIndex = (
        contribution: Database["public"]["Tables"]["dialectic_contributions"]["Row"],
    ): number => {
        const relationships = contribution.document_relationships;
        if (
            relationships && typeof relationships === "object" &&
            !Array.isArray(relationships) && "turnIndex" in relationships
        ) {
            const turnIndex: unknown = relationships.turnIndex;
            if (typeof turnIndex === "number") {
                return turnIndex;
            }
        }
        return Number.POSITIVE_INFINITY;
    };
    const parseTimestamp = (value?: string): number => (value ? Date.parse(value) : 0);
    const allChunksSorted = combinedChunks.slice().sort((a, b) => {
        if (a.id === chunkId) return -1;
        if (b.id === chunkId) return 1;
        const turnIndexA: number = getTurnIndex(a);
        const turnIndexB: number = getTurnIndex(b);
        if (turnIndexA !== turnIndexB) {
            return turnIndexA - turnIndexB;
        }
        return parseTimestamp(a.created_at) - parseTimestamp(b.created_at);
    });

    const { data: seedPromptResource, error: seedResourceError } = await deps.dbClient
        .from("dialectic_project_resources")
        .select("storage_path, file_name, storage_bucket")
        .eq("resource_type", "seed_prompt")
        .eq("session_id", rootChunk.session_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (seedResourceError || !seedPromptResource) {
        return createError(`Failed to query seed prompt for session ${rootChunk.session_id}.`);
    }

    if (
        !seedPromptResource.storage_path ||
        !seedPromptResource.file_name ||
        !seedPromptResource.storage_bucket
    ) {
        return createError(`Seed prompt resource incomplete for session ${rootChunk.session_id}.`);
    }

    const seedPromptPath: string = `${seedPromptResource.storage_path}/${seedPromptResource.file_name}`;
    const { data: seedPromptContentData, error: seedDownloadError } =
        await deps.downloadFromStorageFn(seedPromptResource.storage_bucket, seedPromptPath);

    if (seedDownloadError || !seedPromptContentData) {
        return createError(`Failed to download seed prompt for root ${chunkId}.`);
    }
    const seedPromptContent: string = new TextDecoder().decode(seedPromptContentData);

    const chunkContentStrings: string[] = [];
    for (let i = 0; i < allChunksSorted.length; i++) {
        const chunk = allChunksSorted[i];
        if (!chunk.storage_path || !chunk.file_name || !chunk.storage_bucket) {
            return createError(`Failed to download content for chunk ${chunk.id}.`);
        }
        const chunkPath: string = `${chunk.storage_path}/${chunk.file_name}`;
        const { data: chunkContentData, error: chunkDownloadError } =
            await deps.downloadFromStorageFn(chunk.storage_bucket, chunkPath);
        if (chunkDownloadError || !chunkContentData) {
            return createError(`Failed to download content for chunk ${chunk.id}.`);
        }
        const chunkContent: string = new TextDecoder().decode(chunkContentData);
        chunkContentStrings.push(chunkContent);
    }

    const assembleChunksResult = await deps.assembleChunks(
        {
            sanitizeJsonContent,
            isRecord,
        },
        {},
        { chunks: chunkContentStrings },
    );

    if (assembleChunksResult.success === false) {
        return createError(assembleChunksResult.error);
    }

    const assembledObject: Record<string, unknown> = assembleChunksResult.mergedObject;
    const lastChunkContent: string = chunkContentStrings.length > 0
        ? chunkContentStrings[chunkContentStrings.length - 1]
        : "";

    let continuationInstruction: string = GENERIC_CONTINUATION_INSTRUCTION;
    let parsedLastChunk: unknown;
    let lastChunkParsed = false;
    try {
        parsedLastChunk = JSON.parse(lastChunkContent);
        lastChunkParsed = true;
    } catch {
        lastChunkParsed = false;
    }

    if (lastChunkParsed && isRecord(parsedLastChunk) && "resume_cursor" in parsedLastChunk) {
        continuationInstruction = buildResumeCursorInstruction(parsedLastChunk.resume_cursor);
    } else {
        const sanitizationResult = sanitizeJsonContent(lastChunkContent);
        if (!lastChunkParsed || sanitizationResult.wasStructurallyFixed) {
            const anchorKey: string | null = findTruncationAnchorKey(
                assembledObject,
                sanitizationResult.wasStructurallyFixed,
            );
            continuationInstruction = buildTruncationContinuationInstruction(anchorKey);
        } else if (payload.expectedSchema) {
            const missingKeys: string[] = listMissingTopLevelKeys(
                assembledObject,
                payload.expectedSchema,
            );
            if (missingKeys.length > 0) {
                continuationInstruction = buildMissingKeysInstruction(missingKeys);
            }
        }
    }

    const messages: Messages[] = [
        { role: "user", content: seedPromptContent },
        { role: "assistant", content: JSON.stringify(assembledObject) },
        { role: "user", content: continuationInstruction },
    ];

    return {
        success: true,
        messages,
    };
};
