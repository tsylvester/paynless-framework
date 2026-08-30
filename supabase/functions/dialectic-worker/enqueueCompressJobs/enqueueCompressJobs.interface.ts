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
import type { CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { ConstructStoragePathFn } from "../../_shared/utils/path_constructor.types.ts";
import type { ITextSplitter } from "../../_shared/utils/text_splitter.interface.ts";
import type { DialecticBaseJobPayload, DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";

export interface DialecticCompressJobPayload extends DialecticBaseJobPayload {
  output_type: ModelContributionFileTypes;
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
  stageSlug: DialecticStageSlug; // narrowed from optional on the base to required
  iterationNumber: number; // narrowed from optional on the base to required
  model_slug: string; // narrowed from optional on the base to required; parent EXECUTE payload's own slug, so prompt assemblers can name a CompressionPrompt without a provider lookup
}

export interface enqueueCompressJobsDeps {
  logger: ILogger;
  textSplitter: ITextSplitter;
  countTokens: CountTokensFn;
  constructStoragePath: ConstructStoragePathFn;
}

export interface enqueueCompressJobsParams {
  dbClient: SupabaseClient<Database>;
}

export interface enqueueCompressJobsVictim {
  mode: CompressionMode;
  content: string;
  sourceType: CompressionSourceType;
  sourceId?: string;
  role?: Messages['role']; // REQUIRED when sourceType is 'history'
  documentKey?: FileType;
  docType?: ModelContributionFileTypes;
  sourceStageSlug?: DialecticStageSlug;
}

export interface enqueueCompressJobsPayload {
  victim: enqueueCompressJobsVictim;
  parentJob: DialecticJobRow;
  modelConfig: AiModelExtendedConfig;
}

export interface CompressJobValidationErrorConstructorParams {
  message: string;
}

export class CompressJobValidationError extends Error {
  constructor(params: CompressJobValidationErrorConstructorParams) {
    super(params.message);
    this.name = "CompressJobValidationError";
  }
}

export interface CompressJobEnqueueErrorConstructorParams {
  message: string;
}

export class CompressJobEnqueueError extends Error {
  constructor(params: CompressJobEnqueueErrorConstructorParams) {
    super(params.message);
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
