import type { DownloadFromStorageFn } from "../../../supabase_storage_utils.ts";
import type { ILogger } from "../../../types.ts";
import type { SanitizeJsonContentFn } from "../../../utils/jsonSanitizer/jsonSanitizer.interface.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import type { DialecticContributionRow } from "../../../../dialectic-service/dialectic.interface.ts";

/** One downloaded chunk's text for the concatenate-then-sanitize/parse pipeline in mergeChunkContent. */
export type DownloadedChunkText = {
  chunkId: string;
  text: string;
  rawJsonPath: string;
};

export interface MergeChunkContentDeps {
  downloadFromStorage: DownloadFromStorageFn;
  logger: ILogger;
  sanitizeJsonContent: SanitizeJsonContentFn;
}

export interface MergeChunkContentParams {
  dbClient: SupabaseClient<Database>;
}

export interface MergeChunkContentPayload {
  orderedChunks: DialecticContributionRow[];
}

export type MergeChunkContentSuccessReturn = {
  mergedStructuredData: Record<string, unknown>;
};

export type MergeChunkContentErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type MergeChunkContentReturn =
  | MergeChunkContentSuccessReturn
  | MergeChunkContentErrorReturn;

export type MergeChunkContentFn = (
  deps: MergeChunkContentDeps,
  params: MergeChunkContentParams,
  payload: MergeChunkContentPayload,
) => Promise<MergeChunkContentReturn>;

export type BoundMergeChunkContentFn = (
  params: MergeChunkContentParams,
  payload: MergeChunkContentPayload,
) => Promise<MergeChunkContentReturn>;
