// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.interface.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  AiModelExtendedConfig,
  ILogger,
  Messages,
} from "../../_shared/types.ts";
import type {
  DialecticJobRow,
  RelevanceRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  BoundGetSortedCompressionCandidatesFn,
} from "../../_shared/utils/vector_utils/vector_utils.provides.ts";
import type {
  BoundenqueueCompressJobsFn,
} from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import type {
  BoundResolveCompressionSourceFn,
  ResourceDocument,
  ResourceDocuments,
} from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import type {
  ConstructStoragePathFn,
} from "../../_shared/utils/path_constructor.types.ts";
import type {
  DownloadFromStorageFn,
} from "../../_shared/supabase_storage_utils.ts";
import type {
  CountTokensFn,
} from "../../_shared/types/tokenizer.types.ts";

export interface CompressPromptDeps {
  logger: ILogger;
  getSortedCompressionCandidates: BoundGetSortedCompressionCandidatesFn;
  enqueueCompressJobs: BoundenqueueCompressJobsFn;
  resolveCompressionSource: BoundResolveCompressionSourceFn;
  constructStoragePath: ConstructStoragePathFn;
  downloadFromStorage: DownloadFromStorageFn;
  countTokens: CountTokensFn;
}

export interface CompressPromptParams {
  dbClient: SupabaseClient<Database>;
  isContinuationFlowInitial: boolean;
  finalTargetThreshold: number;
  balanceAfterCompression: number;
  walletBalance: number;
}

export interface CompressPromptPayload {
  parentJob: DialecticJobRow;
  extendedModelConfig: AiModelExtendedConfig;
  inputsRelevance: RelevanceRule[];
  resourceDocuments: ResourceDocuments;
  conversationHistory: Messages[];
  currentUserPrompt: string;
}

export interface CompressPromptFitsReturn {
  fits: true;
  resourceDocuments: ResourceDocuments;
  conversationHistory: Messages[];
  resolvedInputTokenCount: number;
}

export interface CompressPromptPendingReturn {
  fits: false;
}

export type CompressPromptSuccessReturn =
  | CompressPromptFitsReturn
  | CompressPromptPendingReturn;

export interface CompressPromptErrorReturn {
  error: Error;
  retriable: boolean;
}

export type CompressPromptReturn =
  | CompressPromptSuccessReturn
  | CompressPromptErrorReturn;

export type CompressPromptFn = (
  deps: CompressPromptDeps,
  params: CompressPromptParams,
  payload: CompressPromptPayload,
) => Promise<CompressPromptReturn>;

export type BoundCompressPromptFn = (
  params: CompressPromptParams,
  payload: CompressPromptPayload,
) => Promise<CompressPromptReturn>;
