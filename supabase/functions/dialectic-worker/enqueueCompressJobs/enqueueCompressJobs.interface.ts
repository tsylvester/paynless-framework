import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { AiModelExtendedConfig, ILogger } from "../../_shared/types.ts";
import type { CompressionMode, CompressionSourceType } from "../../_shared/types/file_manager.types.ts";
import type { CountTokensDeps, CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { ConstructStoragePathFn } from "../../_shared/utils/path_constructor.types.ts";
import type { ITextSplitter } from "../../_shared/utils/text_splitter.interface.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";

export interface DialecticCompressJobPayload {
  job_type: "COMPRESS";
  sessionId: string;
  projectId: string;
  stageSlug: string;
  targetKey: string;
  iterationNumber: number;
  model_id: string;
  mode: CompressionMode;
  content: string;
  sourceType: CompressionSourceType;
  sourceId?: string;
  documentKey?: string;
  docType?: string;
  sourceStageSlug?: string;
  chunk_index?: number;
  chunk_total?: number;
  walletId: string;
  user_id: string;
}

export interface enqueueCompressJobsDeps {
  logger: ILogger;
  textSplitter: ITextSplitter;
  countTokens: CountTokensFn;
  constructStoragePath: ConstructStoragePathFn;
}

export interface enqueueCompressJobsParams {
  dbClient: SupabaseClient<Database>;
  parentJob: DialecticJobRow;
  sessionId: string;
  projectId: string;
  stageSlug: string;
  targetKey: string;
  iterationNumber: number;
  modelId: string;
  walletId: string;
  modelConfig: AiModelExtendedConfig;
  tokenizerDeps: CountTokensDeps;
}

export interface enqueueCompressJobsPayload {
  victim: {
    mode: CompressionMode;
    content: string;
    sourceType: CompressionSourceType;
    sourceId?: string;
    documentKey?: string;
    docType?: string;
    sourceStageSlug?: string;
  };
}

export class CompressJobValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompressJobValidationError";
  }
}

export class CompressJobEnqueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompressJobEnqueueError";
  }
}

export interface enqueueCompressJobsSuccessReturn {
  createdCount: number;
}

export interface enqueueCompressJobsErrorReturn {
  error: CompressJobValidationError | CompressJobEnqueueError;
  retriable: boolean;
}

export type enqueueCompressJobsReturn =
  | enqueueCompressJobsSuccessReturn
  | enqueueCompressJobsErrorReturn;

export type enqueueCompressJobsFn = (
  deps: enqueueCompressJobsDeps,
  params: enqueueCompressJobsParams,
  payload: enqueueCompressJobsPayload,
) => Promise<enqueueCompressJobsReturn>;

export type BoundenqueueCompressJobsFn = (
  params: enqueueCompressJobsParams,
  payload: enqueueCompressJobsPayload,
) => Promise<enqueueCompressJobsReturn>;
