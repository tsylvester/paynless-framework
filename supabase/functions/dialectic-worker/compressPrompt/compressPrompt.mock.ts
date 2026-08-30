// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.mock.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptDeps,
  CompressPromptErrorReturn,
  CompressPromptFitsReturn,
  CompressPromptFn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptPendingReturn,
} from "./compressPrompt.interface.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildDialecticJobRow, buildDialecticExecuteJobPayload } from "../../_shared/dialectic.mock.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import {
  buildResourceDocument,
  mockBoundResolveCompressionSource,
} from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { mockBoundGetSortedCompressionCandidates } from "../../_shared/utils/vector_utils/vector_utils.provides.ts";
import { mockBoundenqueueCompressJobsFn } from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import type { ConstructStoragePathFn } from "../../_shared/utils/path_constructor.types.ts";
import type { ConstructedPath } from "../../_shared/utils/path_constructor.ts";
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";

const defaultConstructStoragePath: ConstructStoragePathFn = (_context): ConstructedPath => {
  return {
    storagePath: "mock/storage/path",
    fileName: "mock-file.md",
  };
};

const defaultDownloadFromStorage: DownloadFromStorageFn = async (_supabase, _bucket, _path) => {
  return {
    data: null,
    error: null,
  };
};

export type CompressPromptDepsOverrides = Partial<CompressPromptDeps>;

export type CompressPromptDepsCorruptions = { [K in keyof CompressPromptDeps]?: unknown };

export function buildCompressPromptDeps(overrides?: CompressPromptDepsOverrides): CompressPromptDeps {
  const base: CompressPromptDeps = {
    logger: new MockLogger(),
    getSortedCompressionCandidates: mockBoundGetSortedCompressionCandidates,
    enqueueCompressJobs: mockBoundenqueueCompressJobsFn,
    resolveCompressionSource: mockBoundResolveCompressionSource,
    constructStoragePath: defaultConstructStoragePath,
    downloadFromStorage: defaultDownloadFromStorage,
    countTokens: createMockCountTokens(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressPromptDeps(corruptions: CompressPromptDepsCorruptions): unknown {
  return { ...buildCompressPromptDeps(), ...corruptions };
}

export type CompressPromptParamsOverrides = Partial<CompressPromptParams>;

export type CompressPromptParamsCorruptions = { [K in keyof CompressPromptParams]?: unknown };

export function buildCompressPromptParams(overrides?: CompressPromptParamsOverrides): CompressPromptParams {
  const base: CompressPromptParams = {
    dbClient: createMockSupabaseClient().client as unknown as SupabaseClient<Database>,
    isContinuationFlowInitial: false,
    finalTargetThreshold: 50000,
    balanceAfterCompression: 900000,
    walletBalance: 1_000_000,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressPromptParams(corruptions: CompressPromptParamsCorruptions): unknown {
  return { ...buildCompressPromptParams(), ...corruptions };
}

export type CompressPromptPayloadOverrides = Partial<CompressPromptPayload>;

export type CompressPromptPayloadCorruptions = { [K in keyof CompressPromptPayload]?: unknown };

export function buildCompressPromptPayload(overrides?: CompressPromptPayloadOverrides): CompressPromptPayload {
  const executeJobPayload = buildDialecticExecuteJobPayload();
  if (!isJson(executeJobPayload)) throw new Error("buildDialecticExecuteJobPayload must produce a Json-compatible value");
  const base: CompressPromptPayload = {
    parentJob: buildDialecticJobRow({ payload: executeJobPayload }),
    extendedModelConfig: buildExtendedModelConfig(),
    inputsRelevance: [],
    resourceDocuments: [buildResourceDocument()],
    conversationHistory: [],
    currentUserPrompt: "mock user prompt",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressPromptPayload(corruptions: CompressPromptPayloadCorruptions): unknown {
  return { ...buildCompressPromptPayload(), ...corruptions };
}

export type CompressPromptFitsReturnOverrides = Partial<CompressPromptFitsReturn>;

export type CompressPromptFitsReturnCorruptions = { [K in keyof CompressPromptFitsReturn]?: unknown };

export function buildCompressPromptFitsReturn(overrides?: CompressPromptFitsReturnOverrides): CompressPromptFitsReturn {
  const base: CompressPromptFitsReturn = {
    fits: true,
    resourceDocuments: [buildResourceDocument()],
    conversationHistory: [],
    resolvedInputTokenCount: 0,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressPromptFitsReturn(corruptions: CompressPromptFitsReturnCorruptions): unknown {
  return { ...buildCompressPromptFitsReturn(), ...corruptions };
}

export type CompressPromptPendingReturnOverrides = Partial<CompressPromptPendingReturn>;

export type CompressPromptPendingReturnCorruptions = { [K in keyof CompressPromptPendingReturn]?: unknown };

export function buildCompressPromptPendingReturn(overrides?: CompressPromptPendingReturnOverrides): CompressPromptPendingReturn {
  const base: CompressPromptPendingReturn = {
    fits: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressPromptPendingReturn(corruptions: CompressPromptPendingReturnCorruptions): unknown {
  return { ...buildCompressPromptPendingReturn(), ...corruptions };
}

export type CompressPromptErrorReturnOverrides = Partial<CompressPromptErrorReturn>;

export type CompressPromptErrorReturnCorruptions = { [K in keyof CompressPromptErrorReturn]?: unknown };

export function buildCompressPromptErrorReturn(overrides?: CompressPromptErrorReturnOverrides): CompressPromptErrorReturn {
  const base: CompressPromptErrorReturn = {
    error: new Error("mock-compress-prompt-error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCompressPromptErrorReturn(corruptions: CompressPromptErrorReturnCorruptions): unknown {
  return { ...buildCompressPromptErrorReturn(), ...corruptions };
}

export const mockCompressPrompt: CompressPromptFn = async (_deps, _params, _payload) => {
  return buildCompressPromptFitsReturn();
};

export const mockBoundCompressPrompt: BoundCompressPromptFn = async (_params, _payload) => {
  return buildCompressPromptFitsReturn();
};
