// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.mock.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import type { ShouldEnqueueRenderJobFn } from "../../_shared/types/shouldEnqueueRenderJob.interface.ts";
import type { BoundResolveTemplateFilenameFn } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts";
import { RenderJobValidationError } from "../../_shared/utils/errors.ts";
import type {
  DialecticRenderCompressedContextJobPayload,
  EnqueueRenderCompressedContextPayload,
  EnqueueRenderJobDeps,
  EnqueueRenderJobErrorReturn,
  EnqueueRenderJobFn,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobSuccessReturn,
} from "./enqueueRenderJob.interface.ts";

export type EnqueueRenderJobDepsOverrides = Partial<EnqueueRenderJobDeps>;

export type EnqueueRenderJobParamsOverrides = Partial<EnqueueRenderJobParams>;

export type EnqueueRenderJobPayloadOverrides = Partial<EnqueueRenderJobPayload>;

export type EnqueueRenderJobSuccessReturnOverrides =
  Partial<EnqueueRenderJobSuccessReturn>;

export type EnqueueRenderJobErrorReturnOverrides =
  Partial<EnqueueRenderJobErrorReturn>;

export type EnqueueRenderCompressedContextPayloadOverrides =
  Partial<EnqueueRenderCompressedContextPayload>;

export type DialecticRenderCompressedContextJobPayloadOverrides =
  Partial<DialecticRenderCompressedContextJobPayload>;

export type EnqueueRenderJobDepsCorruptions = {
  [K in keyof EnqueueRenderJobDeps]?: unknown;
};

export type EnqueueRenderJobParamsCorruptions = {
  [K in keyof EnqueueRenderJobParams]?: unknown;
};

export type EnqueueRenderJobPayloadCorruptions = {
  [K in keyof EnqueueRenderJobPayload]?: unknown;
};

export type EnqueueRenderJobSuccessReturnCorruptions = {
  [K in keyof EnqueueRenderJobSuccessReturn]?: unknown;
};

export type EnqueueRenderJobErrorReturnCorruptions = {
  [K in keyof EnqueueRenderJobErrorReturn]?: unknown;
};

export type EnqueueRenderCompressedContextPayloadCorruptions = {
  [K in keyof EnqueueRenderCompressedContextPayload]?: unknown;
};

export type DialecticRenderCompressedContextJobPayloadCorruptions = {
  [K in keyof DialecticRenderCompressedContextJobPayload]?: unknown;
};

const defaultShouldEnqueueRenderJob: ShouldEnqueueRenderJobFn = async () => ({
  shouldRender: false,
  reason: "is_json",
});

const defaultResolveTemplateFilename: BoundResolveTemplateFilenameFn = async () => ({
  templateFilename: "thesis_business_case.md",
});

export function buildEnqueueRenderJobDeps(
  overrides?: EnqueueRenderJobDepsOverrides,
): EnqueueRenderJobDeps {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: EnqueueRenderJobDeps = {
    dbClient,
    logger: new MockLogger(),
    shouldEnqueueRenderJob: defaultShouldEnqueueRenderJob,
    resolveTemplateFilename: defaultResolveTemplateFilename,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildEnqueueRenderJobParams(
  overrides?: EnqueueRenderJobParamsOverrides,
): EnqueueRenderJobParams {
  const base: EnqueueRenderJobParams = {
    jobId: "exec-job-1",
    sessionId: "session-1",
    stageSlug: DialecticStageSlug.Thesis,
    iterationNumber: 1,
    outputType: FileType.business_case,
    projectId: "project-1",
    projectOwnerUserId: "owner-1",
    userAuthToken: "jwt-token",
    modelId: "model-1",
    walletId: "wallet-1",
    isTestJob: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildEnqueueRenderJobPayload(
  overrides?: EnqueueRenderJobPayloadOverrides,
): EnqueueRenderJobPayload {
  const base: EnqueueRenderJobPayload = {
    contributionId: "contrib-1",
    needsContinuation: false,
    documentKey: FileType.business_case,
    stageRelationshipForStage: "doc-identity-1",
    fileType: FileType.business_case,
    storageFileType: FileType.ModelContributionRawJson,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildEnqueueRenderJobSuccessReturn(
  overrides?: EnqueueRenderJobSuccessReturnOverrides,
): EnqueueRenderJobSuccessReturn {
  const base: EnqueueRenderJobSuccessReturn = { renderJobId: "render-job-1" };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildEnqueueRenderJobErrorReturn(
  overrides?: EnqueueRenderJobErrorReturnOverrides,
): EnqueueRenderJobErrorReturn {
  const base: EnqueueRenderJobErrorReturn = {
    error: new RenderJobValidationError("validation failed"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueRenderJobDeps(
  corruptions: EnqueueRenderJobDepsCorruptions,
): unknown {
  return { ...buildEnqueueRenderJobDeps(), ...corruptions };
}

export function invalidateEnqueueRenderJobParams(
  corruptions: EnqueueRenderJobParamsCorruptions,
): unknown {
  return { ...buildEnqueueRenderJobParams(), ...corruptions };
}

export function invalidateEnqueueRenderJobPayload(
  corruptions: EnqueueRenderJobPayloadCorruptions,
): unknown {
  return { ...buildEnqueueRenderJobPayload(), ...corruptions };
}

export function invalidateEnqueueRenderJobSuccessReturn(
  corruptions: EnqueueRenderJobSuccessReturnCorruptions,
): unknown {
  return { ...buildEnqueueRenderJobSuccessReturn(), ...corruptions };
}

export function invalidateEnqueueRenderJobErrorReturn(
  corruptions: EnqueueRenderJobErrorReturnCorruptions,
): unknown {
  return { ...buildEnqueueRenderJobErrorReturn(), ...corruptions };
}

export function buildEnqueueRenderCompressedContextPayload(
  overrides?: EnqueueRenderCompressedContextPayloadOverrides,
): EnqueueRenderCompressedContextPayload {
  const base: EnqueueRenderCompressedContextPayload = {
    sourceType: "contribution",
    documentKey: FileType.business_case,
    docType: FileType.business_case,
    sourceStageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.technical_approach,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildDialecticRenderCompressedContextJobPayload(
  overrides?: DialecticRenderCompressedContextJobPayloadOverrides,
): DialecticRenderCompressedContextJobPayload {
  const base: DialecticRenderCompressedContextJobPayload = {
    idempotencyKey: "session-1_1_thesis_compress_render_contribution_business_case_technical_approach",
    projectId: "project-1",
    sessionId: "session-1",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.technical_approach,
    sourceType: "contribution",
    documentKey: FileType.business_case,
    template_filename: "thesis_business_case.md",
    user_jwt: "jwt-token",
    model_id: "model-1",
    walletId: "wallet-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueRenderCompressedContextPayload(
  corruptions: EnqueueRenderCompressedContextPayloadCorruptions,
): unknown {
  return { ...buildEnqueueRenderCompressedContextPayload(), ...corruptions };
}

export function invalidateDialecticRenderCompressedContextJobPayload(
  corruptions: DialecticRenderCompressedContextJobPayloadCorruptions,
): unknown {
  return { ...buildDialecticRenderCompressedContextJobPayload(), ...corruptions };
}

export const mockEnqueueRenderJob: EnqueueRenderJobFn = async (
  _deps: EnqueueRenderJobDeps,
  _params: EnqueueRenderJobParams,
  _payload: EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload,
): Promise<EnqueueRenderJobSuccessReturn> => {
  return buildEnqueueRenderJobSuccessReturn();
};
