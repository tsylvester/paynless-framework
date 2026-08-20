import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  ResolveContributionIdentityDeps,
  ResolveContributionIdentityParams,
  ResolveContributionIdentityPayload,
  ResolveContributionIdentitySuccessReturn,
  ResolveContributionIdentityErrorReturn,
  ResolveContributionIdentityReturn,
  ResolveContributionIdentityFn,
  BoundResolveContributionIdentityFn,
  DocumentKeyErrorParams,
  ProviderIdentifierErrorParams,
  RelationshipsErrorParams,
  ContinuationCountErrorParams,
  RawProviderResponseErrorParams,
  SourceGroupErrorParams,
  RecipeStepReadErrorParams,
} from "./resolveContributionIdentity.interface.ts";
import {
  ResolveContributionIdentityDocumentKeyError,
  ResolveContributionIdentityProviderIdentifierError,
  ResolveContributionIdentityRelationshipsError,
  ResolveContributionIdentityContinuationCountError,
  ResolveContributionIdentityRawProviderResponseError,
  ResolveContributionIdentitySourceGroupError,
  ResolveContributionIdentityRecipeStepReadError,
} from "./resolveContributionIdentity.interface.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import { buildCanonicalPathParams } from "../../_shared/services/file_manager.mock.ts";
import {
  createMockDialecticExecuteJobPayload,
  createMockJobRow,
  saveResponseTestPayloadDocumentArtifact,
} from "../saveResponse/saveResponse.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";

// --- ResolveContributionIdentityDeps ---

export type ResolveContributionIdentityDepsOverrides =
  Partial<ResolveContributionIdentityDeps>;

export function buildResolveContributionIdentityDeps(
  overrides?: ResolveContributionIdentityDepsOverrides,
): ResolveContributionIdentityDeps {
  const base: ResolveContributionIdentityDeps = {
    logger: new MockLogger(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveContributionIdentityDepsCorruptions = {
  [K in keyof ResolveContributionIdentityDeps]?: unknown;
};

export function invalidateResolveContributionIdentityDeps(
  corruptions: ResolveContributionIdentityDepsCorruptions,
): unknown {
  return { ...buildResolveContributionIdentityDeps(), ...corruptions };
}

// --- ResolveContributionIdentityParams ---

export type ResolveContributionIdentityParamsOverrides =
  Partial<ResolveContributionIdentityParams>;

export function buildResolveContributionIdentityParams(
  overrides?: ResolveContributionIdentityParamsOverrides,
): ResolveContributionIdentityParams {
  const mockSetup = createMockSupabaseClient();
  const base: ResolveContributionIdentityParams = {
    dbClient: mockSetup.client as unknown as SupabaseClient<Database>,
    job: createMockJobRow(saveResponseTestPayloadDocumentArtifact),
    providerRow: buildMockProvider(),
    aiResponse: buildUnifiedAIResponse({
      rawProviderResponse: { token_usage: null, finish_reason: "stop" },
    }),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveContributionIdentityParamsCorruptions = {
  [K in keyof ResolveContributionIdentityParams]?: unknown;
};

export function invalidateResolveContributionIdentityParams(
  corruptions: ResolveContributionIdentityParamsCorruptions,
): unknown {
  return { ...buildResolveContributionIdentityParams(), ...corruptions };
}

// --- ResolveContributionIdentityPayload ---

export type ResolveContributionIdentityPayloadOverrides =
  Partial<ResolveContributionIdentityPayload>;

export function buildResolveContributionIdentityPayload(
  overrides?: ResolveContributionIdentityPayloadOverrides,
): ResolveContributionIdentityPayload {
  const base: ResolveContributionIdentityPayload = {
    ...createMockDialecticExecuteJobPayload(),
    canonicalPathParams: buildCanonicalPathParams(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveContributionIdentityPayloadCorruptions = {
  [K in keyof ResolveContributionIdentityPayload]?: unknown;
};

export function invalidateResolveContributionIdentityPayload(
  corruptions: ResolveContributionIdentityPayloadCorruptions,
): unknown {
  return { ...buildResolveContributionIdentityPayload(), ...corruptions };
}

// --- ResolveContributionIdentitySuccessReturn ---

export type ResolveContributionIdentitySuccessReturnOverrides =
  Partial<ResolveContributionIdentitySuccessReturn>;

export function buildResolveContributionIdentitySuccessReturn(
  overrides?: ResolveContributionIdentitySuccessReturnOverrides,
): ResolveContributionIdentitySuccessReturn {
  const base: ResolveContributionIdentitySuccessReturn = {
    restOfCanonicalPathParams: buildCanonicalPathParams(),
    storageFileType: FileType.ModelContributionRawJson,
    isContinuationForStorage: false,
    description: "test contribution",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveContributionIdentitySuccessReturnCorruptions = {
  [K in keyof ResolveContributionIdentitySuccessReturn]?: unknown;
};

export function invalidateResolveContributionIdentitySuccessReturn(
  corruptions: ResolveContributionIdentitySuccessReturnCorruptions,
): unknown {
  return { ...buildResolveContributionIdentitySuccessReturn(), ...corruptions };
}

// --- ResolveContributionIdentityErrorReturn ---

export type ResolveContributionIdentityErrorReturnOverrides =
  Partial<ResolveContributionIdentityErrorReturn>;

export function buildResolveContributionIdentityErrorReturn(
  overrides?: ResolveContributionIdentityErrorReturnOverrides,
): ResolveContributionIdentityErrorReturn {
  const base: ResolveContributionIdentityErrorReturn = {
    error: buildResolveContributionIdentitySourceGroupError(),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveContributionIdentityErrorReturnCorruptions = {
  [K in keyof ResolveContributionIdentityErrorReturn]?: unknown;
};

export function invalidateResolveContributionIdentityErrorReturn(
  corruptions: ResolveContributionIdentityErrorReturnCorruptions,
): unknown {
  return { ...buildResolveContributionIdentityErrorReturn(), ...corruptions };
}

// --- DocumentKeyErrorParams ---

export type DocumentKeyErrorParamsOverrides = Partial<DocumentKeyErrorParams>;

export function buildDocumentKeyErrorParams(
  overrides?: DocumentKeyErrorParamsOverrides,
): DocumentKeyErrorParams {
  const base: DocumentKeyErrorParams = {
    jobId: "job-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DocumentKeyErrorParamsCorruptions = {
  [K in keyof DocumentKeyErrorParams]?: unknown;
};

export function invalidateDocumentKeyErrorParams(
  corruptions: DocumentKeyErrorParamsCorruptions,
): unknown {
  return { ...buildDocumentKeyErrorParams(), ...corruptions };
}

export function buildResolveContributionIdentityDocumentKeyError(
  overrides?: DocumentKeyErrorParamsOverrides,
): ResolveContributionIdentityDocumentKeyError {
  return new ResolveContributionIdentityDocumentKeyError(
    buildDocumentKeyErrorParams(overrides),
  );
}

// --- ProviderIdentifierErrorParams ---

export type ProviderIdentifierErrorParamsOverrides =
  Partial<ProviderIdentifierErrorParams>;

export function buildProviderIdentifierErrorParams(
  overrides?: ProviderIdentifierErrorParamsOverrides,
): ProviderIdentifierErrorParams {
  const base: ProviderIdentifierErrorParams = {
    jobId: "job-1",
    providerId: "model-def",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ProviderIdentifierErrorParamsCorruptions = {
  [K in keyof ProviderIdentifierErrorParams]?: unknown;
};

export function invalidateProviderIdentifierErrorParams(
  corruptions: ProviderIdentifierErrorParamsCorruptions,
): unknown {
  return { ...buildProviderIdentifierErrorParams(), ...corruptions };
}

export function buildResolveContributionIdentityProviderIdentifierError(
  overrides?: ProviderIdentifierErrorParamsOverrides,
): ResolveContributionIdentityProviderIdentifierError {
  return new ResolveContributionIdentityProviderIdentifierError(
    buildProviderIdentifierErrorParams(overrides),
  );
}

// --- RelationshipsErrorParams ---

export type RelationshipsErrorParamsOverrides =
  Partial<RelationshipsErrorParams>;

export function buildRelationshipsErrorParams(
  overrides?: RelationshipsErrorParamsOverrides,
): RelationshipsErrorParams {
  const base: RelationshipsErrorParams = {
    jobId: "job-1",
    targetContributionId: "contrib-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RelationshipsErrorParamsCorruptions = {
  [K in keyof RelationshipsErrorParams]?: unknown;
};

export function invalidateRelationshipsErrorParams(
  corruptions: RelationshipsErrorParamsCorruptions,
): unknown {
  return { ...buildRelationshipsErrorParams(), ...corruptions };
}

export function buildResolveContributionIdentityRelationshipsError(
  overrides?: RelationshipsErrorParamsOverrides,
): ResolveContributionIdentityRelationshipsError {
  return new ResolveContributionIdentityRelationshipsError(
    buildRelationshipsErrorParams(overrides),
  );
}

// --- ContinuationCountErrorParams ---

export type ContinuationCountErrorParamsOverrides =
  Partial<ContinuationCountErrorParams>;

export function buildContinuationCountErrorParams(
  overrides?: ContinuationCountErrorParamsOverrides,
): ContinuationCountErrorParams {
  const base: ContinuationCountErrorParams = {
    jobId: "job-1",
    targetContributionId: "contrib-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ContinuationCountErrorParamsCorruptions = {
  [K in keyof ContinuationCountErrorParams]?: unknown;
};

export function invalidateContinuationCountErrorParams(
  corruptions: ContinuationCountErrorParamsCorruptions,
): unknown {
  return { ...buildContinuationCountErrorParams(), ...corruptions };
}

export function buildResolveContributionIdentityContinuationCountError(
  overrides?: ContinuationCountErrorParamsOverrides,
): ResolveContributionIdentityContinuationCountError {
  return new ResolveContributionIdentityContinuationCountError(
    buildContinuationCountErrorParams(overrides),
  );
}

// --- RawProviderResponseErrorParams ---

export type RawProviderResponseErrorParamsOverrides =
  Partial<RawProviderResponseErrorParams>;

export function buildRawProviderResponseErrorParams(
  overrides?: RawProviderResponseErrorParamsOverrides,
): RawProviderResponseErrorParams {
  const base: RawProviderResponseErrorParams = {
    jobId: "job-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RawProviderResponseErrorParamsCorruptions = {
  [K in keyof RawProviderResponseErrorParams]?: unknown;
};

export function invalidateRawProviderResponseErrorParams(
  corruptions: RawProviderResponseErrorParamsCorruptions,
): unknown {
  return { ...buildRawProviderResponseErrorParams(), ...corruptions };
}

export function buildResolveContributionIdentityRawProviderResponseError(
  overrides?: RawProviderResponseErrorParamsOverrides,
): ResolveContributionIdentityRawProviderResponseError {
  return new ResolveContributionIdentityRawProviderResponseError(
    buildRawProviderResponseErrorParams(overrides),
  );
}

// --- SourceGroupErrorParams ---

export type SourceGroupErrorParamsOverrides =
  Partial<SourceGroupErrorParams>;

export function buildSourceGroupErrorParams(
  overrides?: SourceGroupErrorParamsOverrides,
): SourceGroupErrorParams {
  const base: SourceGroupErrorParams = {
    jobId: "job-1",
    outputType: FileType.ModelContributionRawJson,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type SourceGroupErrorParamsCorruptions = {
  [K in keyof SourceGroupErrorParams]?: unknown;
};

export function invalidateSourceGroupErrorParams(
  corruptions: SourceGroupErrorParamsCorruptions,
): unknown {
  return { ...buildSourceGroupErrorParams(), ...corruptions };
}

export function buildResolveContributionIdentitySourceGroupError(
  overrides?: SourceGroupErrorParamsOverrides,
): ResolveContributionIdentitySourceGroupError {
  return new ResolveContributionIdentitySourceGroupError(
    buildSourceGroupErrorParams(overrides),
  );
}

// --- RecipeStepReadErrorParams ---

export type RecipeStepReadErrorParamsOverrides =
  Partial<RecipeStepReadErrorParams>;

export function buildRecipeStepReadErrorParams(
  overrides?: RecipeStepReadErrorParamsOverrides,
): RecipeStepReadErrorParams {
  const base: RecipeStepReadErrorParams = {
    recipeStepId: "recipe-step-1",
    table: "dialectic_stage_recipe_steps",
    driverMessage: "row not found",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RecipeStepReadErrorParamsCorruptions = {
  [K in keyof RecipeStepReadErrorParams]?: unknown;
};

export function invalidateRecipeStepReadErrorParams(
  corruptions: RecipeStepReadErrorParamsCorruptions,
): unknown {
  return { ...buildRecipeStepReadErrorParams(), ...corruptions };
}

export function buildResolveContributionIdentityRecipeStepReadError(
  overrides?: RecipeStepReadErrorParamsOverrides,
): ResolveContributionIdentityRecipeStepReadError {
  return new ResolveContributionIdentityRecipeStepReadError(
    buildRecipeStepReadErrorParams(overrides),
  );
}

// --- Function mock ---

export const mockResolveContributionIdentity: ResolveContributionIdentityFn =
  async (
    _deps,
    _params,
    _payload,
  ): Promise<ResolveContributionIdentityReturn> => {
    return buildResolveContributionIdentitySuccessReturn();
  };

export const mockBoundResolveContributionIdentity: BoundResolveContributionIdentityFn =
  async (
    _params,
    _payload,
  ): Promise<ResolveContributionIdentityReturn> => {
    return buildResolveContributionIdentitySuccessReturn();
  };
