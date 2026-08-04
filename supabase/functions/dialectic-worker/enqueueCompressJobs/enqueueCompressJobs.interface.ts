import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { AiModelExtendedConfig, ILogger, Messages } from "../../_shared/types.ts";
import type {
  CompressionMode,
  CompressionSourceType,
  FileType,
  ModelContributionFileTypes,
  DialecticStageSlug,
} from "../../_shared/types/file_manager.types.ts";
import type { CountTokensDeps, CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { ConstructStoragePathFn } from "../../_shared/utils/path_constructor.types.ts";
import type { ITextSplitter } from "../../_shared/utils/text_splitter.interface.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";

export interface DialecticCompressJobPayload {
  job_type: "COMPRESS";
  sessionId: string;
  projectId: string;
  stageSlug: DialecticStageSlug;
  targetKey: ModelContributionFileTypes;
  iterationNumber: number;
  model_id: string;
  model_slug: string; // parent EXECUTE payload's own slug, so prompt assemblers can name a CompressionPrompt without a provider lookup
  mode: CompressionMode;
  content: string;
  sourceType: CompressionSourceType;
  sourceId?: string;
  role?: Messages['role']; // REQUIRED when sourceType is 'history'
  documentKey?: FileType;
  docType?: ModelContributionFileTypes;
  sourceStageSlug?: DialecticStageSlug;
  chunk_index?: number;
  chunk_total?: number;
  continuation_count?: number; // present only on a continuation row, written by continueJob
  source_prompt_resource_id?: string; // written onto the job row by processCompressJob after assembly, read by saveResponse
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
  stageSlug: DialecticStageSlug;
  targetKey: ModelContributionFileTypes;
  iterationNumber: number;
  modelId: string;
  modelSlug: string; // parent EXECUTE payload's own slug, so prompt assemblers can name a CompressionPrompt without a provider lookup
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
    role?: Messages['role']; // REQUIRED when sourceType is 'history'
    documentKey?: FileType;
    docType?: ModelContributionFileTypes;
    sourceStageSlug?: DialecticStageSlug;
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
  payload: unknown,
) => Promise<enqueueCompressJobsReturn>;

export type BoundenqueueCompressJobsFn = (
  params: enqueueCompressJobsParams,
  payload: enqueueCompressJobsPayload,
) => Promise<enqueueCompressJobsReturn>;
