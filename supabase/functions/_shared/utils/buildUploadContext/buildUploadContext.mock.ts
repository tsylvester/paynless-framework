import { FileType, DialecticStageSlug } from "../../types/file_manager.types.ts";
import type {
  ModelContributionUploadContext,
  ResourceUploadContext,
} from "../../types/file_manager.types.ts";
import type {
  BuildUploadContextAiResponseSlice,
  BuildUploadContextParams,
  BuildUploadContextProviderDetails,
  BuildUploadContextResourceParams,
} from "./buildUploadContext.interface.ts";
import type { BuildUploadContextFn } from "../../../dialectic-worker/createJobContext/JobContext.interface.ts";
import { buildCanonicalPathParams } from "../../services/file_manager.mock.ts";

export type BuildUploadContextProviderDetailsOverrides = Partial<BuildUploadContextProviderDetails>;

export function buildBuildUploadContextProviderDetails(
  overrides?: BuildUploadContextProviderDetailsOverrides,
): BuildUploadContextProviderDetails {
  const base: BuildUploadContextProviderDetails = {
    id: "prov-1",
    name: "Test Provider",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type BuildUploadContextProviderDetailsCorruptions = {
  [K in keyof BuildUploadContextProviderDetails]?: unknown;
};

export function invalidateBuildUploadContextProviderDetails(
  corruptions: BuildUploadContextProviderDetailsCorruptions,
): unknown {
  return { ...buildBuildUploadContextProviderDetails(), ...corruptions };
}

export type BuildUploadContextAiResponseSliceOverrides = Partial<BuildUploadContextAiResponseSlice>;

export function buildBuildUploadContextAiResponseSlice(
  overrides?: BuildUploadContextAiResponseSliceOverrides,
): BuildUploadContextAiResponseSlice {
  const base: BuildUploadContextAiResponseSlice = {
    inputTokens: 100,
    outputTokens: 200,
    processingTimeMs: 500,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type BuildUploadContextAiResponseSliceCorruptions = {
  [K in keyof BuildUploadContextAiResponseSlice]?: unknown;
};

export function invalidateBuildUploadContextAiResponseSlice(
  corruptions: BuildUploadContextAiResponseSliceCorruptions,
): unknown {
  return { ...buildBuildUploadContextAiResponseSlice(), ...corruptions };
}

export type BuildUploadContextParamsOverrides = Partial<BuildUploadContextParams>;

export function buildBuildUploadContextParams(
  overrides?: BuildUploadContextParamsOverrides,
): BuildUploadContextParams {
  const { contributionType: _omit, ...restOfCanonicalPathParams } = buildCanonicalPathParams();
  const base: BuildUploadContextParams = {
    projectId: "proj-1",
    storageFileType: FileType.ModelContributionRawJson,
    sessionId: "sess-1",
    iterationNumber: 1,
    modelSlug: "gpt-4",
    attemptCount: 0,
    restOfCanonicalPathParams,
    documentKey: "business_case",
    contributionType: "thesis",
    isContinuationForStorage: false,
    continuationCount: undefined,
    sourceGroupFragment: undefined,
    contentForStorage: '{"key":"value"}',
    projectOwnerUserId: "owner-1",
    description: "model_contribution_raw_json for stage 'thesis' by model Test Provider",
    providerDetails: buildBuildUploadContextProviderDetails(),
    aiResponse: buildBuildUploadContextAiResponseSlice(),
    sourcePromptResourceId: undefined,
    targetContributionId: undefined,
    documentRelationships: null,
    isIntermediate: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type BuildUploadContextParamsCorruptions = {
  [K in keyof BuildUploadContextParams]?: unknown;
};

export function invalidateBuildUploadContextParams(
  corruptions: BuildUploadContextParamsCorruptions,
): unknown {
  return { ...buildBuildUploadContextParams(), ...corruptions };
}

export type BuildUploadContextResourceParamsOverrides = Partial<BuildUploadContextResourceParams>;

export function buildBuildUploadContextResourceParams(
  overrides?: BuildUploadContextResourceParamsOverrides,
): BuildUploadContextResourceParams {
  const base: BuildUploadContextResourceParams = {
    projectId: "proj-1",
    storageFileType: FileType.CompressedContextRawJson,
    sessionId: "sess-1",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    sourceType: "contribution",
    documentKey: FileType.feature_spec,
    sourceId: undefined,
    chunkIndex: undefined,
    chunkTotal: undefined,
    contentForStorage: '{"compressed":true}',
    projectOwnerUserId: "owner-1",
    description: "compressed_context_raw_json for stage 'thesis' target 'business_case'",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type BuildUploadContextResourceParamsCorruptions = {
  [K in keyof BuildUploadContextResourceParams]?: unknown;
};

export function invalidateBuildUploadContextResourceParams(
  corruptions: BuildUploadContextResourceParamsCorruptions,
): unknown {
  return { ...buildBuildUploadContextResourceParams(), ...corruptions };
}

export const mockBuildUploadContext: BuildUploadContextFn = (
  _params: Parameters<BuildUploadContextFn>[0],
): ModelContributionUploadContext | ResourceUploadContext => {
  return {
    fileContent: "",
    mimeType: "application/json",
    sizeBytes: 0,
    userId: "owner-1",
    description: "mock upload context",
    pathContext: {
      projectId: "proj-1",
      fileType: FileType.ModelContributionRawJson,
    },
    contributionMetadata: {
      sessionId: "sess-1",
      modelIdUsed: "prov-1",
      modelNameDisplay: "Test Provider",
      stageSlug: "thesis",
      iterationNumber: 1,
    },
  };
};
