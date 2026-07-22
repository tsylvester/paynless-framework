import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import { createMockDownloadFromStorage } from "../../../supabase_storage_utils.mock.ts";
import { createMockSanitizeJsonContent } from "../../../utils/jsonSanitizer/jsonSanitizer.mock.ts";
import { MockLogger } from "../../../logger.mock.ts";
import { buildContributionRow } from "../assembleContributionChain/assembleContributionChain.mock.ts";
import type {
  BoundMergeChunkContentFn,
  DownloadedChunkText,
  MergeChunkContentDeps,
  MergeChunkContentErrorReturn,
  MergeChunkContentFn,
  MergeChunkContentParams,
  MergeChunkContentPayload,
  MergeChunkContentSuccessReturn,
} from "./mergeChunkContent.interface.ts";

export type DownloadedChunkTextOverrides = Partial<DownloadedChunkText>;
export type MergeChunkContentDepsOverrides = Partial<MergeChunkContentDeps>;
export type MergeChunkContentParamsOverrides = Partial<MergeChunkContentParams>;
export type MergeChunkContentPayloadOverrides = Partial<MergeChunkContentPayload>;
export type MergeChunkContentSuccessReturnOverrides = Partial<MergeChunkContentSuccessReturn>;
export type MergeChunkContentErrorReturnOverrides = Partial<MergeChunkContentErrorReturn>;

export type DownloadedChunkTextCorruptions = {
  [K in keyof DownloadedChunkText]?: unknown;
};
export type MergeChunkContentDepsCorruptions = {
  [K in keyof MergeChunkContentDeps]?: unknown;
};
export type MergeChunkContentParamsCorruptions = {
  [K in keyof MergeChunkContentParams]?: unknown;
};
export type MergeChunkContentPayloadCorruptions = {
  [K in keyof MergeChunkContentPayload]?: unknown;
};
export type MergeChunkContentSuccessReturnCorruptions = {
  [K in keyof MergeChunkContentSuccessReturn]?: unknown;
};
export type MergeChunkContentErrorReturnCorruptions = {
  [K in keyof MergeChunkContentErrorReturn]?: unknown;
};

export function buildDownloadedChunkText(
  overrides?: DownloadedChunkTextOverrides,
): DownloadedChunkText {
  const base: DownloadedChunkText = {
    chunkId: "chunk-1",
    text: "",
    rawJsonPath: "content/proj_x/session_s/iteration_1/thesis/documents/mock-model_0_business_case_raw.json",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildMergeChunkContentDeps(
  overrides?: MergeChunkContentDepsOverrides,
): MergeChunkContentDeps {
  const base: MergeChunkContentDeps = {
    downloadFromStorage: createMockDownloadFromStorage({
      mode: "success",
      data: new ArrayBuffer(0),
    }),
    logger: new MockLogger(),
    sanitizeJsonContent: createMockSanitizeJsonContent(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildMergeChunkContentParams(
  overrides?: MergeChunkContentParamsOverrides,
): MergeChunkContentParams {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: MergeChunkContentParams = { dbClient };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildMergeChunkContentPayload(
  overrides?: MergeChunkContentPayloadOverrides,
): MergeChunkContentPayload {
  const base: MergeChunkContentPayload = {
    orderedChunks: [buildContributionRow()],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildMergeChunkContentSuccessReturn(
  overrides?: MergeChunkContentSuccessReturnOverrides,
): MergeChunkContentSuccessReturn {
  const base: MergeChunkContentSuccessReturn = { mergedStructuredData: {} };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildMergeChunkContentErrorReturn(
  overrides?: MergeChunkContentErrorReturnOverrides,
): MergeChunkContentErrorReturn {
  const base: MergeChunkContentErrorReturn = {
    error: new Error("mock error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateDownloadedChunkText(
  corruptions: DownloadedChunkTextCorruptions,
): unknown {
  return { ...buildDownloadedChunkText(), ...corruptions };
}

export function invalidateMergeChunkContentDeps(
  corruptions: MergeChunkContentDepsCorruptions,
): unknown {
  return { ...buildMergeChunkContentDeps(), ...corruptions };
}

export function invalidateMergeChunkContentParams(
  corruptions: MergeChunkContentParamsCorruptions,
): unknown {
  return { ...buildMergeChunkContentParams(), ...corruptions };
}

export function invalidateMergeChunkContentPayload(
  corruptions: MergeChunkContentPayloadCorruptions,
): unknown {
  return { ...buildMergeChunkContentPayload(), ...corruptions };
}

export function invalidateMergeChunkContentSuccessReturn(
  corruptions: MergeChunkContentSuccessReturnCorruptions,
): unknown {
  return { ...buildMergeChunkContentSuccessReturn(), ...corruptions };
}

export function invalidateMergeChunkContentErrorReturn(
  corruptions: MergeChunkContentErrorReturnCorruptions,
): unknown {
  return { ...buildMergeChunkContentErrorReturn(), ...corruptions };
}

export const mockMergeChunkContent: MergeChunkContentFn = async () => {
  return buildMergeChunkContentSuccessReturn();
};

export const mockBoundMergeChunkContent: BoundMergeChunkContentFn = async () => {
  return buildMergeChunkContentSuccessReturn();
};
