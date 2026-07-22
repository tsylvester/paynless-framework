import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { MOCK_MODEL_CONFIG } from "../../_shared/_integration.test.utils.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { LangchainTextSplitter } from "../../_shared/utils/text_splitter.ts";
import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  FileType,
  DialecticStageSlug,
} from "../../_shared/types/file_manager.types.ts";
import {
  createMockDialecticExecuteJobPayload,
  createMockJobRow,
} from "../saveResponse/saveResponse.mock.ts";
import {
  BoundenqueueCompressJobsFn,
  CompressJobEnqueueError,
  CompressJobValidationError,
  DialecticCompressJobPayload,
  enqueueCompressJobsDeps,
  enqueueCompressJobsErrorReturn,
  enqueueCompressJobsFn,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsReturn,
  enqueueCompressJobsSuccessReturn,
} from "./enqueueCompressJobs.interface.ts";

export type enqueueCompressJobsDepsOverrides = {
  [K in keyof enqueueCompressJobsDeps]?: enqueueCompressJobsDeps[K] | null;
};

export type enqueueCompressJobsParamsOverrides = {
  [K in keyof enqueueCompressJobsParams]?: enqueueCompressJobsParams[K] | null;
};

export type enqueueCompressJobsPayloadOverrides = {
  [K in keyof enqueueCompressJobsPayload]?: enqueueCompressJobsPayload[K] | null;
};

export type DialecticCompressJobPayloadOverrides = {
  [K in keyof DialecticCompressJobPayload]?: DialecticCompressJobPayload[K] | null;
};

export type enqueueCompressJobsSuccessReturnOverrides = {
  [K in keyof enqueueCompressJobsSuccessReturn]?:
    | enqueueCompressJobsSuccessReturn[K]
    | null;
};

export type enqueueCompressJobsErrorReturnOverrides = {
  [K in keyof enqueueCompressJobsErrorReturn]?:
    | enqueueCompressJobsErrorReturn[K]
    | null;
};

export function buildenqueueCompressJobsDeps(
  overrides?: enqueueCompressJobsDepsOverrides,
): enqueueCompressJobsDeps {
  const base: enqueueCompressJobsDeps = {
    logger: new MockLogger(),
    textSplitter: new LangchainTextSplitter(),
    countTokens: createMockCountTokens(),
    constructStoragePath: constructStoragePath,
  };
  if (!overrides) {
    return base;
  }
  return {
    logger: overrides.logger !== undefined && overrides.logger !== null
      ? overrides.logger
      : base.logger,
    textSplitter: overrides.textSplitter !== undefined &&
        overrides.textSplitter !== null
      ? overrides.textSplitter
      : base.textSplitter,
    countTokens: overrides.countTokens !== undefined &&
        overrides.countTokens !== null
      ? overrides.countTokens
      : base.countTokens,
    constructStoragePath: overrides.constructStoragePath !== undefined &&
        overrides.constructStoragePath !== null
      ? overrides.constructStoragePath
      : base.constructStoragePath,
  };
}

export function buildenqueueCompressJobsParams(
  overrides?: enqueueCompressJobsParamsOverrides,
): enqueueCompressJobsParams {
  const mockSetup = createMockSupabaseClient("enqueue-compress-jobs");
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const parentJob = createMockJobRow(createMockDialecticExecuteJobPayload());

  const tokenizerDeps: CountTokensDeps = {
    getEncoding: () => ({ encode: () => [] }),
    countTokensAnthropic: () => 0,
    logger: new MockLogger(),
  };

  const base: enqueueCompressJobsParams = {
    dbClient,
    parentJob,
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    iterationNumber: 1,
    modelId: "model-1",
    walletId: "wallet-1",
    modelConfig: { ...MOCK_MODEL_CONFIG, provider_max_input_tokens: 1000 },
    tokenizerDeps,
  };
  if (!overrides) {
    return base;
  }
  return {
    dbClient: overrides.dbClient !== undefined && overrides.dbClient !== null
      ? overrides.dbClient
      : base.dbClient,
    parentJob: overrides.parentJob !== undefined &&
        overrides.parentJob !== null
      ? overrides.parentJob
      : base.parentJob,
    sessionId: overrides.sessionId !== undefined && overrides.sessionId !== null
      ? overrides.sessionId
      : base.sessionId,
    projectId: overrides.projectId !== undefined &&
        overrides.projectId !== null
      ? overrides.projectId
      : base.projectId,
    stageSlug: overrides.stageSlug !== undefined && overrides.stageSlug !== null
      ? overrides.stageSlug
      : base.stageSlug,
    targetKey: overrides.targetKey !== undefined && overrides.targetKey !== null
      ? overrides.targetKey
      : base.targetKey,
    iterationNumber: overrides.iterationNumber !== undefined &&
        overrides.iterationNumber !== null
      ? overrides.iterationNumber
      : base.iterationNumber,
    modelId: overrides.modelId !== undefined && overrides.modelId !== null
      ? overrides.modelId
      : base.modelId,
    walletId: overrides.walletId !== undefined && overrides.walletId !== null
      ? overrides.walletId
      : base.walletId,
    modelConfig: overrides.modelConfig !== undefined &&
        overrides.modelConfig !== null
      ? overrides.modelConfig
      : base.modelConfig,
    tokenizerDeps: overrides.tokenizerDeps !== undefined &&
        overrides.tokenizerDeps !== null
      ? overrides.tokenizerDeps
      : base.tokenizerDeps,
  };
}

export function buildenqueueCompressJobsPayload(
  overrides?: enqueueCompressJobsPayloadOverrides,
): enqueueCompressJobsPayload {
  const base: enqueueCompressJobsPayload = {
    victim: {
      mode: "text",
      content: "some content",
      sourceType: "contribution",
      documentKey: FileType.business_case,
      docType: FileType.business_case,
      sourceStageSlug: DialecticStageSlug.Thesis,
    },
  };
  if (!overrides) {
    return base;
  }
  return {
    victim: overrides.victim !== undefined && overrides.victim !== null
      ? { ...base.victim, ...overrides.victim }
      : base.victim,
  };
}

export function buildDialecticCompressJobPayload(
  overrides?: DialecticCompressJobPayloadOverrides,
): DialecticCompressJobPayload {
  const base: DialecticCompressJobPayload = {
    job_type: "COMPRESS",
    sessionId: "session-1",
    projectId: "project-1",
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    iterationNumber: 1,
    model_id: "model-1",
    mode: "text",
    content: "some content",
    sourceType: "contribution",
    documentKey: FileType.business_case,
    docType: FileType.business_case,
    sourceStageSlug: DialecticStageSlug.Thesis,
    walletId: "wallet-1",
    user_id: "user-1",
  };
  if (!overrides) {
    return base;
  }
  return {
    job_type: overrides.job_type !== undefined && overrides.job_type !== null
      ? overrides.job_type
      : base.job_type,
    sessionId: overrides.sessionId !== undefined &&
        overrides.sessionId !== null
      ? overrides.sessionId
      : base.sessionId,
    projectId: overrides.projectId !== undefined &&
        overrides.projectId !== null
      ? overrides.projectId
      : base.projectId,
    stageSlug: overrides.stageSlug !== undefined &&
        overrides.stageSlug !== null
      ? overrides.stageSlug
      : base.stageSlug,
    targetKey: overrides.targetKey !== undefined &&
        overrides.targetKey !== null
      ? overrides.targetKey
      : base.targetKey,
    iterationNumber: overrides.iterationNumber !== undefined &&
        overrides.iterationNumber !== null
      ? overrides.iterationNumber
      : base.iterationNumber,
    model_id: overrides.model_id !== undefined && overrides.model_id !== null
      ? overrides.model_id
      : base.model_id,
    mode: overrides.mode !== undefined && overrides.mode !== null
      ? overrides.mode
      : base.mode,
    content: overrides.content !== undefined && overrides.content !== null
      ? overrides.content
      : base.content,
    sourceType: overrides.sourceType !== undefined &&
        overrides.sourceType !== null
      ? overrides.sourceType
      : base.sourceType,
    sourceId: overrides.sourceId !== undefined && overrides.sourceId !== null
      ? overrides.sourceId
      : base.sourceId,
    documentKey: overrides.documentKey !== undefined &&
        overrides.documentKey !== null
      ? overrides.documentKey
      : base.documentKey,
    docType: overrides.docType !== undefined && overrides.docType !== null
      ? overrides.docType
      : base.docType,
    sourceStageSlug: overrides.sourceStageSlug !== undefined &&
        overrides.sourceStageSlug !== null
      ? overrides.sourceStageSlug
      : base.sourceStageSlug,
    walletId: overrides.walletId !== undefined && overrides.walletId !== null
      ? overrides.walletId
      : base.walletId,
    user_id: overrides.user_id !== undefined && overrides.user_id !== null
      ? overrides.user_id
      : base.user_id,
  };
}

export function buildenqueueCompressJobsSuccessReturn(
  overrides?: enqueueCompressJobsSuccessReturnOverrides,
): enqueueCompressJobsSuccessReturn {
  const base: enqueueCompressJobsSuccessReturn = { createdCount: 0 };
  if (!overrides) {
    return base;
  }
  return {
    createdCount: overrides.createdCount !== undefined &&
        overrides.createdCount !== null
      ? overrides.createdCount
      : base.createdCount,
  };
}

export type CompressJobEnqueueErrorOverrides = {
  [K in keyof CompressJobEnqueueError]?: CompressJobEnqueueError[K] | null;
};

export type CompressJobValidationErrorOverrides = {
  [K in keyof CompressJobValidationError]?:
    | CompressJobValidationError[K]
    | null;
};

export function buildCompressJobEnqueueError(
  overrides?: CompressJobEnqueueErrorOverrides,
): CompressJobEnqueueError {
  const baseMessage = "mock-compress-job-enqueue-error";
  const message = overrides?.message !== undefined &&
      overrides?.message !== null
    ? overrides.message
    : baseMessage;
  const error = new CompressJobEnqueueError(message);
  if (overrides?.name !== undefined && overrides?.name !== null) {
    error.name = overrides.name;
  }
  if (overrides?.stack !== undefined && overrides?.stack !== null) {
    error.stack = overrides.stack;
  }
  if (overrides?.cause !== undefined && overrides?.cause !== null) {
    error.cause = overrides.cause;
  }
  return error;
}

export function buildCompressJobValidationError(
  overrides?: CompressJobValidationErrorOverrides,
): CompressJobValidationError {
  const baseMessage = "mock-compress-job-validation-error";
  const message = overrides?.message !== undefined &&
      overrides?.message !== null
    ? overrides.message
    : baseMessage;
  const error = new CompressJobValidationError(message);
  if (overrides?.name !== undefined && overrides?.name !== null) {
    error.name = overrides.name;
  }
  if (overrides?.stack !== undefined && overrides?.stack !== null) {
    error.stack = overrides.stack;
  }
  if (overrides?.cause !== undefined && overrides?.cause !== null) {
    error.cause = overrides.cause;
  }
  return error;
}

export function buildenqueueCompressJobsErrorReturn(
  overrides?: enqueueCompressJobsErrorReturnOverrides,
): enqueueCompressJobsErrorReturn {
  const base: enqueueCompressJobsErrorReturn = {
    error: buildCompressJobEnqueueError(),
    retriable: false,
  };
  if (!overrides) {
    return base;
  }
  return {
    error: overrides.error !== undefined && overrides.error !== null
      ? overrides.error
      : base.error,
    retriable: overrides.retriable !== undefined && overrides.retriable !== null
      ? overrides.retriable
      : base.retriable,
  };
}

export type enqueueCompressJobsDepsCorruptions = { [K in keyof enqueueCompressJobsDeps]?: unknown };

export function invalidateEnqueueCompressJobsDeps(
  corruptions: enqueueCompressJobsDepsCorruptions,
): unknown {
  return { ...buildenqueueCompressJobsDeps(), ...corruptions };
}

export type enqueueCompressJobsParamsCorruptions = { [K in keyof enqueueCompressJobsParams]?: unknown };

export function invalidateEnqueueCompressJobsParams(
  corruptions: enqueueCompressJobsParamsCorruptions,
): unknown {
  return { ...buildenqueueCompressJobsParams(), ...corruptions };
}

export type enqueueCompressJobsPayloadCorruptions = { [K in keyof enqueueCompressJobsPayload]?: unknown };

export function invalidateEnqueueCompressJobsPayload(
  corruptions: enqueueCompressJobsPayloadCorruptions,
): unknown {
  return { ...buildenqueueCompressJobsPayload(), ...corruptions };
}

export type DialecticCompressJobPayloadCorruptions = { [K in keyof DialecticCompressJobPayload]?: unknown };

export function invalidateDialecticCompressJobPayload(
  corruptions: DialecticCompressJobPayloadCorruptions,
): unknown {
  return { ...buildDialecticCompressJobPayload(), ...corruptions };
}

export type enqueueCompressJobsSuccessReturnCorruptions = { [K in keyof enqueueCompressJobsSuccessReturn]?: unknown };

export function invalidateEnqueueCompressJobsSuccessReturn(
  corruptions: enqueueCompressJobsSuccessReturnCorruptions,
): unknown {
  return { ...buildenqueueCompressJobsSuccessReturn(), ...corruptions };
}

export type enqueueCompressJobsErrorReturnCorruptions = { [K in keyof enqueueCompressJobsErrorReturn]?: unknown };

export function invalidateEnqueueCompressJobsErrorReturn(
  corruptions: enqueueCompressJobsErrorReturnCorruptions,
): unknown {
  return { ...buildenqueueCompressJobsErrorReturn(), ...corruptions };
}

export function mockBoundenqueueCompressJobsFn(options?: {
  result?: enqueueCompressJobsReturn;
  handler?: BoundenqueueCompressJobsFn;
}): BoundenqueueCompressJobsFn {
  return async (
    params: enqueueCompressJobsParams,
    payload: enqueueCompressJobsPayload,
  ): Promise<enqueueCompressJobsReturn> => {
    if (options?.handler !== undefined) {
      return await options.handler(params, payload);
    }
    if (options?.result !== undefined) {
      return options.result;
    }
    return buildenqueueCompressJobsSuccessReturn();
  };
}
