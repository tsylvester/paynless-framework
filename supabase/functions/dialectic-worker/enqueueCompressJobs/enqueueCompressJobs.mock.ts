import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
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
  buildDialecticBaseJobPayload,
  buildDialecticJobRow,
} from "../../_shared/dialectic.mock.ts";
import {
  BoundenqueueCompressJobsFn,
  CompressJobEnqueueError,
  CompressJobEnqueueErrorConstructorParams,
  CompressJobValidationError,
  CompressJobValidationErrorConstructorParams,
  DialecticCompressJobPayload,
  enqueueCompressJobsDeps,
  enqueueCompressJobsErrorReturn,
  enqueueCompressJobsFn,
  enqueueCompressJobsParams,
  enqueueCompressJobsPayload,
  enqueueCompressJobsReturn,
  enqueueCompressJobsSuccessReturn,
  enqueueCompressJobsVictim,
} from "./enqueueCompressJobs.interface.ts";

export type enqueueCompressJobsDepsOverrides = Partial<enqueueCompressJobsDeps>;

export type enqueueCompressJobsParamsOverrides = Partial<enqueueCompressJobsParams>;

export type enqueueCompressJobsPayloadOverrides = Partial<enqueueCompressJobsPayload>;

export type enqueueCompressJobsVictimOverrides = Partial<enqueueCompressJobsVictim>;

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

  const base: enqueueCompressJobsParams = {
    dbClient,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildenqueueCompressJobsVictim(
  overrides?: enqueueCompressJobsVictimOverrides,
): enqueueCompressJobsVictim {
  const base: enqueueCompressJobsVictim = {
    mode: "text",
    content: "some content",
    sourceType: "contribution",
    documentKey: FileType.business_case,
    docType: FileType.business_case,
    sourceStageSlug: DialecticStageSlug.Thesis,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildenqueueCompressJobsPayload(
  overrides?: enqueueCompressJobsPayloadOverrides,
): enqueueCompressJobsPayload {
  const base: enqueueCompressJobsPayload = {
    victim: buildenqueueCompressJobsVictim(),
    parentJob: buildDialecticJobRow(),
    modelConfig: { ...MOCK_MODEL_CONFIG, provider_max_input_tokens: 1000 },
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildDialecticCompressJobPayload(
  overrides?: DialecticCompressJobPayloadOverrides,
): DialecticCompressJobPayload {
  const base: DialecticCompressJobPayload = {
    ...buildDialecticBaseJobPayload(),
    stageSlug: DialecticStageSlug.Thesis,
    iterationNumber: 1,
    model_slug: "gpt-4o",
    output_type: FileType.business_case,
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

export type CompressJobValidationErrorConstructorParamsOverrides = Partial<CompressJobValidationErrorConstructorParams>;

export function buildCompressJobValidationErrorConstructorParams(
  overrides?: CompressJobValidationErrorConstructorParamsOverrides,
): CompressJobValidationErrorConstructorParams {
  const base: CompressJobValidationErrorConstructorParams = {
    message: "mock-compress-job-validation-error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type CompressJobValidationErrorConstructorParamsCorruptions = { [K in keyof CompressJobValidationErrorConstructorParams]?: unknown };

export function invalidateCompressJobValidationErrorConstructorParams(
  corruptions: CompressJobValidationErrorConstructorParamsCorruptions,
): unknown {
  return { ...buildCompressJobValidationErrorConstructorParams(), ...corruptions };
}

export function buildCompressJobValidationError(
  overrides?: CompressJobValidationErrorConstructorParamsOverrides,
): CompressJobValidationError {
  return new CompressJobValidationError(buildCompressJobValidationErrorConstructorParams(overrides));
}

export type CompressJobEnqueueErrorConstructorParamsOverrides = Partial<CompressJobEnqueueErrorConstructorParams>;

export function buildCompressJobEnqueueErrorConstructorParams(
  overrides?: CompressJobEnqueueErrorConstructorParamsOverrides,
): CompressJobEnqueueErrorConstructorParams {
  const base: CompressJobEnqueueErrorConstructorParams = {
    message: "mock-compress-job-enqueue-error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type CompressJobEnqueueErrorConstructorParamsCorruptions = { [K in keyof CompressJobEnqueueErrorConstructorParams]?: unknown };

export function invalidateCompressJobEnqueueErrorConstructorParams(
  corruptions: CompressJobEnqueueErrorConstructorParamsCorruptions,
): unknown {
  return { ...buildCompressJobEnqueueErrorConstructorParams(), ...corruptions };
}

export function buildCompressJobEnqueueError(
  overrides?: CompressJobEnqueueErrorConstructorParamsOverrides,
): CompressJobEnqueueError {
  return new CompressJobEnqueueError(buildCompressJobEnqueueErrorConstructorParams(overrides));
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

export type enqueueCompressJobsVictimCorruptions = { [K in keyof enqueueCompressJobsVictim]?: unknown };

export function invalidateEnqueueCompressJobsVictim(
  corruptions: enqueueCompressJobsVictimCorruptions,
): unknown {
  return { ...buildenqueueCompressJobsVictim(), ...corruptions };
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

export const mockenqueueCompressJobsFn: enqueueCompressJobsFn =
  async (
    _deps: enqueueCompressJobsDeps,
    _params: enqueueCompressJobsParams,
    _payload: unknown,
  ): Promise<enqueueCompressJobsReturn> => {
    return buildenqueueCompressJobsSuccessReturn();
  };

export const mockBoundenqueueCompressJobsFn: BoundenqueueCompressJobsFn =
  async (
    _params: enqueueCompressJobsParams,
    _payload: enqueueCompressJobsPayload,
  ): Promise<enqueueCompressJobsReturn> => {
    return buildenqueueCompressJobsSuccessReturn();
  };
