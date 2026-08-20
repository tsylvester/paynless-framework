import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { buildDialecticJobRow, buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import { buildMockProvider, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { mockBuildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import { mockBoundResolveContributionIdentity } from "../resolveContributionIdentity/resolveContributionIdentity.mock.ts";
import { mockBoundPersistContributionRelationships } from "../persistContributionRelationships/persistContributionRelationships.mock.ts";
import { mockBoundFinalizeContributionJob } from "../finalizeContributionJob/finalizeContributionJob.mock.ts";
import {
	SaveContributionResponseBuildContextError,
	SaveContributionResponseUploadError,
	SaveContributionResponseContributionRecordError,
} from "./saveContributionResponse.interface.ts";
import type {
	SaveContributionResponseDeps,
	SaveContributionResponseParams,
	SaveContributionResponseSuccessReturn,
	SaveContributionResponseErrorReturn,
	SaveContributionResponseFn,
	BoundSaveContributionResponseFn,
	SaveContributionResponseBuildContextErrorConstructorParams,
	SaveContributionResponseUploadErrorConstructorParams,
	SaveContributionResponseContributionRecordErrorConstructorParams,
} from "./saveContributionResponse.interface.ts";

// --- SaveContributionResponseDeps ---

export type SaveContributionResponseDepsOverrides = Partial<SaveContributionResponseDeps>;

export function buildSaveContributionResponseDeps(
	overrides?: SaveContributionResponseDepsOverrides,
): SaveContributionResponseDeps {
	const base: SaveContributionResponseDeps = {
		fileManager: createMockFileManagerService(),
		buildUploadContext: mockBuildUploadContext,
		resolveContributionIdentity: mockBoundResolveContributionIdentity,
		persistContributionRelationships: mockBoundPersistContributionRelationships,
		finalizeContributionJob: mockBoundFinalizeContributionJob,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveContributionResponseDepsCorruptions = {
	[K in keyof SaveContributionResponseDeps]?: unknown;
};

export function invalidateSaveContributionResponseDeps(
	corruptions: SaveContributionResponseDepsCorruptions,
): unknown {
	return { ...buildSaveContributionResponseDeps(), ...corruptions };
}

// --- SaveContributionResponseParams ---

export type SaveContributionResponseParamsOverrides = Partial<SaveContributionResponseParams>;

export function buildSaveContributionResponseParams(
	overrides?: SaveContributionResponseParamsOverrides,
): SaveContributionResponseParams {
	const mockSetup = createMockSupabaseClient();
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const base: SaveContributionResponseParams = {
		dbClient,
		job: buildDialecticJobRow(),
		providerRow: buildMockProvider(),
		modelConfig: buildExtendedModelConfig(),
		assembledResponse: buildUnifiedAIResponse(),
		preparedContentResult: buildPrepareResponseContentPreparedReturn(),
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveContributionResponseParamsCorruptions = {
	[K in keyof SaveContributionResponseParams]?: unknown;
};

export function invalidateSaveContributionResponseParams(
	corruptions: SaveContributionResponseParamsCorruptions,
): unknown {
	return { ...buildSaveContributionResponseParams(), ...corruptions };
}

// --- SaveContributionResponseSuccessReturn ---

export type SaveContributionResponseSuccessReturnOverrides = Partial<SaveContributionResponseSuccessReturn>;

export function buildSaveContributionResponseSuccessReturn(
	overrides?: SaveContributionResponseSuccessReturnOverrides,
): SaveContributionResponseSuccessReturn {
	const base: SaveContributionResponseSuccessReturn = {
		status: "completed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveContributionResponseSuccessReturnCorruptions = {
	[K in keyof SaveContributionResponseSuccessReturn]?: unknown;
};

export function invalidateSaveContributionResponseSuccessReturn(
	corruptions: SaveContributionResponseSuccessReturnCorruptions,
): unknown {
	return { ...buildSaveContributionResponseSuccessReturn(), ...corruptions };
}

// --- SaveContributionResponseErrorReturn ---

export type SaveContributionResponseErrorReturnOverrides = Partial<SaveContributionResponseErrorReturn>;

export function buildSaveContributionResponseErrorReturn(
	overrides?: SaveContributionResponseErrorReturnOverrides,
): SaveContributionResponseErrorReturn {
	const base: SaveContributionResponseErrorReturn = {
		error: buildSaveContributionResponseBuildContextError(),
		retriable: false,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveContributionResponseErrorReturnCorruptions = {
	[K in keyof SaveContributionResponseErrorReturn]?: unknown;
};

export function invalidateSaveContributionResponseErrorReturn(
	corruptions: SaveContributionResponseErrorReturnCorruptions,
): unknown {
	return { ...buildSaveContributionResponseErrorReturn(), ...corruptions };
}

// --- SaveContributionResponseFn ---

export const mockSaveContributionResponseFn: SaveContributionResponseFn = async (
	_deps,
	_params,
	_payload,
) => buildSaveContributionResponseSuccessReturn();

// --- BoundSaveContributionResponseFn ---

export const mockBoundSaveContributionResponseFn: BoundSaveContributionResponseFn = async (
	_params,
	_payload,
) => buildSaveContributionResponseSuccessReturn();

// --- SaveContributionResponseBuildContextErrorConstructorParams ---

export type SaveContributionResponseBuildContextErrorConstructorParamsOverrides =
	Partial<SaveContributionResponseBuildContextErrorConstructorParams>;

export function buildSaveContributionResponseBuildContextErrorConstructorParams(
	overrides?: SaveContributionResponseBuildContextErrorConstructorParamsOverrides,
): SaveContributionResponseBuildContextErrorConstructorParams {
	const base: SaveContributionResponseBuildContextErrorConstructorParams = {
		jobId: "job-1",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveContributionResponseBuildContextErrorConstructorParamsCorruptions = {
	[K in keyof SaveContributionResponseBuildContextErrorConstructorParams]?: unknown;
};

export function invalidateSaveContributionResponseBuildContextErrorConstructorParams(
	corruptions: SaveContributionResponseBuildContextErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildSaveContributionResponseBuildContextErrorConstructorParams(),
		...corruptions,
	};
}

// --- SaveContributionResponseBuildContextError ---

export function buildSaveContributionResponseBuildContextError(
	overrides?: SaveContributionResponseBuildContextErrorConstructorParamsOverrides,
): SaveContributionResponseBuildContextError {
	return new SaveContributionResponseBuildContextError(
		buildSaveContributionResponseBuildContextErrorConstructorParams(overrides),
	);
}

// --- SaveContributionResponseUploadErrorConstructorParams ---

export type SaveContributionResponseUploadErrorConstructorParamsOverrides =
	Partial<SaveContributionResponseUploadErrorConstructorParams>;

export function buildSaveContributionResponseUploadErrorConstructorParams(
	overrides?: SaveContributionResponseUploadErrorConstructorParamsOverrides,
): SaveContributionResponseUploadErrorConstructorParams {
	const base: SaveContributionResponseUploadErrorConstructorParams = {
		jobId: "job-1",
		driverMessage: "upload failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveContributionResponseUploadErrorConstructorParamsCorruptions = {
	[K in keyof SaveContributionResponseUploadErrorConstructorParams]?: unknown;
};

export function invalidateSaveContributionResponseUploadErrorConstructorParams(
	corruptions: SaveContributionResponseUploadErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildSaveContributionResponseUploadErrorConstructorParams(),
		...corruptions,
	};
}

// --- SaveContributionResponseUploadError ---

export function buildSaveContributionResponseUploadError(
	overrides?: SaveContributionResponseUploadErrorConstructorParamsOverrides,
): SaveContributionResponseUploadError {
	return new SaveContributionResponseUploadError(
		buildSaveContributionResponseUploadErrorConstructorParams(overrides),
	);
}

// --- SaveContributionResponseContributionRecordErrorConstructorParams ---

export type SaveContributionResponseContributionRecordErrorConstructorParamsOverrides =
	Partial<SaveContributionResponseContributionRecordErrorConstructorParams>;

export function buildSaveContributionResponseContributionRecordErrorConstructorParams(
	overrides?: SaveContributionResponseContributionRecordErrorConstructorParamsOverrides,
): SaveContributionResponseContributionRecordErrorConstructorParams {
	const base: SaveContributionResponseContributionRecordErrorConstructorParams = {
		jobId: "job-1",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveContributionResponseContributionRecordErrorConstructorParamsCorruptions = {
	[K in keyof SaveContributionResponseContributionRecordErrorConstructorParams]?: unknown;
};

export function invalidateSaveContributionResponseContributionRecordErrorConstructorParams(
	corruptions: SaveContributionResponseContributionRecordErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildSaveContributionResponseContributionRecordErrorConstructorParams(),
		...corruptions,
	};
}

// --- SaveContributionResponseContributionRecordError ---

export function buildSaveContributionResponseContributionRecordError(
	overrides?: SaveContributionResponseContributionRecordErrorConstructorParamsOverrides,
): SaveContributionResponseContributionRecordError {
	return new SaveContributionResponseContributionRecordError(
		buildSaveContributionResponseContributionRecordErrorConstructorParams(overrides),
	);
}
