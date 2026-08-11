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
import { buildDialecticBaseJobPayload } from "../../_shared/dialectic.mock.ts";
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

export type enqueueCompressJobsDepsOverrides = Partial<enqueueCompressJobsDeps>;

export type enqueueCompressJobsParamsOverrides = Partial<enqueueCompressJobsParams>;

export type enqueueCompressJobsPayloadOverrides = {
  victim?: Partial<enqueueCompressJobsPayload["victim"]>;
};

export type DialecticCompressJobPayloadOverrides = Partial<DialecticCompressJobPayload>;

export type enqueueCompressJobsSuccessReturnOverrides = Partial<enqueueCompressJobsSuccessReturn>;

export type enqueueCompressJobsErrorReturnOverrides = Partial<enqueueCompressJobsErrorReturn>;

export function buildenqueueCompressJobsDeps(
  overrides?: enqueueCompressJobsDepsOverrides,
): enqueueCompressJobsDeps {
  const base: enqueueCompressJobsDeps = {
    logger: new MockLogger(),
    textSplitter: new LangchainTextSplitter(),
    countTokens: createMockCountTokens(),
    constructStoragePath: constructStoragePath,
  };
  return overrides ? { ...base, ...overrides } : base;
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
    modelSlug: "gpt-4o",
    userJwt: "jwt-1",
    walletId: "wallet-1",
    modelConfig: { ...MOCK_MODEL_CONFIG, provider_max_input_tokens: 1000 },
    tokenizerDeps,
  };
  return overrides ? { ...base, ...overrides } : base;
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
    victim: overrides.victim !== undefined
      ? { ...base.victim, ...overrides.victim }
      : base.victim,
  };
}

export function buildDialecticCompressJobPayload(
  overrides?: DialecticCompressJobPayloadOverrides,
): DialecticCompressJobPayload {
  const base: DialecticCompressJobPayload = {
    ...buildDialecticBaseJobPayload(),
    stageSlug: DialecticStageSlug.Thesis,
    iterationNumber: 1,
    model_slug: "gpt-4o",
    targetKey: FileType.business_case,
    mode: "text",
    content: "some content",
    sourceType: "contribution",
    documentKey: FileType.business_case,
    docType: FileType.business_case,
    sourceStageSlug: DialecticStageSlug.Thesis,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildenqueueCompressJobsSuccessReturn(
  overrides?: enqueueCompressJobsSuccessReturnOverrides,
): enqueueCompressJobsSuccessReturn {
  const base: enqueueCompressJobsSuccessReturn = { createdCount: 0 };
  return overrides ? { ...base, ...overrides } : base;
}

export type CompressJobEnqueueErrorOverrides = Partial<CompressJobEnqueueError>;

export type CompressJobValidationErrorOverrides = Partial<CompressJobValidationError>;

export function buildCompressJobEnqueueError(
  overrides?: CompressJobEnqueueErrorOverrides,
): CompressJobEnqueueError {
  const baseMessage = "mock-compress-job-enqueue-error";
  const message = overrides?.message !== undefined
    ? overrides.message
    : baseMessage;
  const error = new CompressJobEnqueueError(message);
  if (overrides?.name !== undefined) {
    error.name = overrides.name;
  }
  if (overrides?.stack !== undefined) {
    error.stack = overrides.stack;
  }
  if (overrides?.cause !== undefined) {
    error.cause = overrides.cause;
  }
  return error;
}

export function buildCompressJobValidationError(
  overrides?: CompressJobValidationErrorOverrides,
): CompressJobValidationError {
  const baseMessage = "mock-compress-job-validation-error";
  const message = overrides?.message !== undefined
    ? overrides.message
    : baseMessage;
  const error = new CompressJobValidationError(message);
  if (overrides?.name !== undefined) {
    error.name = overrides.name;
  }
  if (overrides?.stack !== undefined) {
    error.stack = overrides.stack;
  }
  if (overrides?.cause !== undefined) {
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
  return overrides ? { ...base, ...overrides } : base;
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

export const mockBoundenqueueCompressJobsFn: BoundenqueueCompressJobsFn =
  async (
    _params: enqueueCompressJobsParams,
    _payload: enqueueCompressJobsPayload,
  ): Promise<enqueueCompressJobsReturn> => {
    return buildenqueueCompressJobsSuccessReturn();
  };
