import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import type { DownloadFromStorageFn } from "../../../supabase_storage_utils.ts";
import { isRecord } from "../../../utils/type_guards.ts";
import { isJsonSanitizationResult } from "../../../utils/jsonSanitizer/jsonSanitizer.guard.ts";
import type { JsonSanitizationResult } from "../../../utils/jsonSanitizer/jsonSanitizer.interface.ts";
import type {
  DownloadedChunkText,
  MergeChunkContentDeps,
  MergeChunkContentParams,
  MergeChunkContentPayload,
  MergeChunkContentReturn,
} from "./mergeChunkContent.interface.ts";

export class ChunkMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChunkMergeError";
  }
}

async function downloadText(
  supabase: SupabaseClient<Database>,
  downloadFromStorage: DownloadFromStorageFn,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await downloadFromStorage(supabase, bucket, path);
  if (error) throw error;
  if (!data) return "";
  return new TextDecoder().decode(data);
}

function mergeParsedIntoMerged(merged: Record<string, unknown>, parsed: unknown): void {
  if (!isRecord(parsed)) return;
  const structuredData: Record<string, unknown> = isRecord(parsed.content) ? parsed.content : parsed;
  delete structuredData.continuation_needed;
  delete structuredData.stop_reason;
  for (const key in structuredData) {
    if (Object.prototype.hasOwnProperty.call(structuredData, key)) {
      const value = structuredData[key];
      if (typeof value === "string" && key in merged && typeof merged[key] === "string") {
        merged[key] = (merged[key]) + "\n\n" + value;
      } else {
        merged[key] = value;
      }
    }
  }
}

export async function mergeChunkContent(
  deps: MergeChunkContentDeps,
  params: MergeChunkContentParams,
  payload: MergeChunkContentPayload,
): Promise<MergeChunkContentReturn> {
  const mergedStructuredData: Record<string, unknown> = {};
  const contentBucket = payload.orderedChunks[0].storage_bucket;

  // Phase 1: download all chunks into ordered array
  const downloadedChunks: DownloadedChunkText[] = [];
  for (const chunk of payload.orderedChunks) {
    const fileName = chunk.file_name;
    if (!fileName || typeof fileName !== "string") {
      return {
        error: new ChunkMergeError(`Contribution ${chunk.id} is missing file_name`),
        retriable: false,
      };
    }
    const rawJsonPath = `${chunk.storage_path}/${fileName}`;
    let text: string;
    try {
      text = await downloadText(
        params.dbClient,
        deps.downloadFromStorage,
        contentBucket,
        rawJsonPath,
      );
    } catch (e) {
      const caughtError = e instanceof Error ? e : new Error(String(e));
      return { error: caughtError, retriable: false };
    }
    const entry: DownloadedChunkText = { chunkId: chunk.id, text, rawJsonPath };
    downloadedChunks.push(entry);
    deps.logger?.info?.("[mergeChunkContent] DEBUG: Raw text length", {
      chunkId: chunk.id,
      rawJsonPath,
      textLength: text.length,
      trimmedTextLength: text.trim().length,
      textFirst100: text.substring(0, 100),
      textLast100: text.substring(Math.max(0, text.length - 100)),
    });
  }

  const allJsonLike = downloadedChunks.every(
    (d) => d.text.trim().startsWith("{") || d.text.trim().startsWith("["),
  );
  const firstChunkJsonLike =
    downloadedChunks.length > 0 &&
    (downloadedChunks[0].text.trim().startsWith("{") ||
      downloadedChunks[0].text.trim().startsWith("["));
  const tryConcatenatedParse =
    downloadedChunks.length > 0 &&
    (allJsonLike || (downloadedChunks.length > 1 && firstChunkJsonLike));
  let phase2Success = false;

  // Phase 2: concatenated sanitize/parse (normal path for continuation fragments)
  if (tryConcatenatedParse) {
    const concatenated = downloadedChunks.map((d) => d.text).join("");
    const sanitizationResult: JsonSanitizationResult = deps.sanitizeJsonContent(concatenated);
    if (isJsonSanitizationResult(sanitizationResult)) {
      try {
        const parsed: unknown = JSON.parse(sanitizationResult.sanitized);
        if (typeof parsed === "object" && parsed !== null) {
          mergeParsedIntoMerged(mergedStructuredData, parsed);
          phase2Success = true;
          if (sanitizationResult.wasSanitized) {
            deps.logger?.info?.("[mergeChunkContent] JSON content sanitized (concatenated)", {
              originalLength: sanitizationResult.originalLength,
              sanitizedLength: sanitizationResult.sanitized.length,
              wasStructurallyFixed: sanitizationResult.wasStructurallyFixed,
              hasDuplicateKeys: sanitizationResult.hasDuplicateKeys,
            });
          }
          deps.logger?.info?.("[mergeChunkContent] Extracted structured data from content object", {
            chunkIds: downloadedChunks.map((d) => d.chunkId),
            dataKeys: Object.keys(mergedStructuredData),
          });
        }
      } catch (phase2Error) {
        deps.logger?.warn?.("[mergeChunkContent] Phase 2 concatenated parse failed; falling through to Phase 3", {
          error: phase2Error,
          chunkIds: downloadedChunks.map((d) => d.chunkId).join(", "),
          paths: downloadedChunks.map((d) => d.rawJsonPath).join("; "),
        });
      }
    }
  }

  // Phase 3: per-chunk sanitize/parse (normal path for independently-complete chunks) or plain-text
  if (!phase2Success) {
    for (const d of downloadedChunks) {
      const sanitizationResult: JsonSanitizationResult = deps.sanitizeJsonContent(d.text);
      if (!isJsonSanitizationResult(sanitizationResult)) {
        const chunkIds = downloadedChunks.map((c) => c.chunkId).join(", ");
        const paths = downloadedChunks.map((c) => c.rawJsonPath).join("; ");
        return {
          error: new ChunkMergeError(
            `Failed to parse JSON content: invalid sanitization result (chunk IDs: ${chunkIds}; paths: ${paths})`,
          ),
          retriable: false,
        };
      }
      const trimmedText = sanitizationResult.sanitized.trim();
      if (trimmedText.startsWith("{") || trimmedText.startsWith("[")) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(sanitizationResult.sanitized);
        } catch (e) {
          const chunkIds = downloadedChunks.map((c) => c.chunkId).join(", ");
          const paths = downloadedChunks.map((c) => c.rawJsonPath).join("; ");
          const parseMsg = e instanceof Error ? e.message : String(e);
          deps.logger?.error?.("[mergeChunkContent] JSON.parse failed for chunk", {
            chunkId: d.chunkId,
            rawJsonPath: d.rawJsonPath,
            error: e,
            parseMsg,
            chunkIds,
            paths,
          });
          return {
            error: e instanceof Error ? e : new Error(String(e)),
            retriable: false,
          };
        }
        if (typeof parsed !== "object" || parsed === null) {
          return {
            error: new ChunkMergeError(
              `Parsed JSON is not an object for contribution ${d.chunkId}`,
            ),
            retriable: false,
          };
        }
        mergeParsedIntoMerged(mergedStructuredData, parsed);
        if (sanitizationResult.wasSanitized) {
          deps.logger?.info?.("[mergeChunkContent] JSON content sanitized (per-chunk)", {
            chunkId: d.chunkId,
            rawJsonPath: d.rawJsonPath,
            originalLength: sanitizationResult.originalLength,
            sanitizedLength: sanitizationResult.sanitized.length,
            wasStructurallyFixed: sanitizationResult.wasStructurallyFixed,
            hasDuplicateKeys: sanitizationResult.hasDuplicateKeys,
          });
        }
        deps.logger?.info?.("[mergeChunkContent] Extracted structured data from content object", {
          chunkId: d.chunkId,
          rawJsonPath: d.rawJsonPath,
          dataKeys: Object.keys(mergedStructuredData),
        });
      } else {
        const extraContentKey = "_extra_content";
        const current: unknown = mergedStructuredData[extraContentKey];
        if (current === undefined || current === null) {
          mergedStructuredData[extraContentKey] = [d.text];
        } else if (Array.isArray(current)) {
          const contentArray: string[] = [];
          for (const item of current) {
            contentArray.push(typeof item === "string" ? item : JSON.stringify(item));
          }
          contentArray.push(d.text);
          mergedStructuredData[extraContentKey] = contentArray;
        } else {
          const serialized =
            typeof current === "object" && current !== null
              ? JSON.stringify(current)
              : String(current);
          mergedStructuredData[extraContentKey] = [serialized, d.text];
          deps.logger?.warn?.("[mergeChunkContent] _extra_content was not a string array; normalized for chunk", {
            chunkId: d.chunkId,
            rawJsonPath: d.rawJsonPath,
          });
        }
      }
    }
  }

  // Array-join normalization: for each key whose value is a non-empty array of strings, join with '\n\n'
  for (const key in mergedStructuredData) {
    if (Object.prototype.hasOwnProperty.call(mergedStructuredData, key)) {
      const value = mergedStructuredData[key];
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
        mergedStructuredData[key] = value.join("\n\n");
      }
    }
  }

  return { mergedStructuredData };
}
