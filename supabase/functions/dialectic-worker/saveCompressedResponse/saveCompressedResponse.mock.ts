import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { buildDialecticJobRow, buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { mockBuildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.mock.ts";
import { buildEnqueueRenderJobSuccessReturn } from "../enqueueRenderJob/enqueueRenderJob.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import {
	SaveCompressedResponseRawJsonUploadError,
	SaveCompressedResponseJobUpdateError,
	SaveCompressedResponseExtractedUploadError,
} from "./saveCompressedResponse.interface.ts";
import type {
	SaveCompressedResponseDeps,
	SaveCompressedResponseParams,
	SaveCompressedResponseSuccessReturn,
	SaveCompressedResponseErrorReturn,
	SaveCompressedResponseFn,
	BoundSaveCompressedResponseFn,
	SaveCompressedResponseRawJsonUploadErrorConstructorParams,
	SaveCompressedResponseJobUpdateErrorConstructorParams,
	SaveCompressedResponseExtractedUploadErrorConstructorParams,
} from "./saveCompressedResponse.interface.ts";

// --- SaveCompressedResponseDeps ---

const defaultBoundEnqueueRenderJob: BoundEnqueueRenderJobFn = async (_params, _payload) =>
	buildEnqueueRenderJobSuccessReturn();

export type SaveCompressedResponseDepsOverrides = Partial<SaveCompressedResponseDeps>;

export function buildSaveCompressedResponseDeps(
	overrides?: SaveCompressedResponseDepsOverrides,
): SaveCompressedResponseDeps {
	const base: SaveCompressedResponseDeps = {
		fileManager: createMockFileManagerService(),
		buildUploadContext: mockBuildUploadContext,
		enqueueRenderJob: defaultBoundEnqueueRenderJob,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveCompressedResponseDepsCorruptions = {
	[K in keyof SaveCompressedResponseDeps]?: unknown;
};

export function invalidateSaveCompressedResponseDeps(
	corruptions: SaveCompressedResponseDepsCorruptions,
): unknown {
	return { ...buildSaveCompressedResponseDeps(), ...corruptions };
}

// --- SaveCompressedResponseParams ---

export type SaveCompressedResponseParamsOverrides = Partial<SaveCompressedResponseParams>;

export function buildSaveCompressedResponseParams(
	overrides?: SaveCompressedResponseParamsOverrides,
): SaveCompressedResponseParams {
	const mockSetup = createMockSupabaseClient();
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const base: SaveCompressedResponseParams = {
		dbClient,
		job: buildDialecticJobRow(),
		providerRow: buildMockProvider(),
		assembledResponse: buildUnifiedAIResponse(),
		preparedContentResult: buildPrepareResponseContentPreparedReturn(),
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveCompressedResponseParamsCorruptions = {
	[K in keyof SaveCompressedResponseParams]?: unknown;
};

export function invalidateSaveCompressedResponseParams(
	corruptions: SaveCompressedResponseParamsCorruptions,
): unknown {
	return { ...buildSaveCompressedResponseParams(), ...corruptions };
}

// --- SaveCompressedResponseSuccessReturn ---

export type SaveCompressedResponseSuccessReturnOverrides =
	Partial<SaveCompressedResponseSuccessReturn>;

export function buildSaveCompressedResponseSuccessReturn(
	overrides?: SaveCompressedResponseSuccessReturnOverrides,
): SaveCompressedResponseSuccessReturn {
	const base: SaveCompressedResponseSuccessReturn = {
		status: "completed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveCompressedResponseSuccessReturnCorruptions = {
	[K in keyof SaveCompressedResponseSuccessReturn]?: unknown;
};

export function invalidateSaveCompressedResponseSuccessReturn(
	corruptions: SaveCompressedResponseSuccessReturnCorruptions,
): unknown {
	return { ...buildSaveCompressedResponseSuccessReturn(), ...corruptions };
}

// --- SaveCompressedResponseErrorReturn ---

export type SaveCompressedResponseErrorReturnOverrides =
	Partial<SaveCompressedResponseErrorReturn>;

export function buildSaveCompressedResponseErrorReturn(
	overrides?: SaveCompressedResponseErrorReturnOverrides,
): SaveCompressedResponseErrorReturn {
	const base: SaveCompressedResponseErrorReturn = {
		error: buildSaveCompressedResponseRawJsonUploadError(),
		retriable: false,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveCompressedResponseErrorReturnCorruptions = {
	[K in keyof SaveCompressedResponseErrorReturn]?: unknown;
};

export function invalidateSaveCompressedResponseErrorReturn(
	corruptions: SaveCompressedResponseErrorReturnCorruptions,
): unknown {
	return { ...buildSaveCompressedResponseErrorReturn(), ...corruptions };
}

// --- SaveCompressedResponseFn ---

export const mockSaveCompressedResponseFn: SaveCompressedResponseFn = async (
	_deps,
	_params,
	_payload,
) => buildSaveCompressedResponseSuccessReturn();

// --- BoundSaveCompressedResponseFn ---

export const mockBoundSaveCompressedResponseFn: BoundSaveCompressedResponseFn = async (
	_params,
	_payload,
) => buildSaveCompressedResponseSuccessReturn();

// --- SaveCompressedResponseRawJsonUploadErrorConstructorParams ---

export type SaveCompressedResponseRawJsonUploadErrorConstructorParamsOverrides =
	Partial<SaveCompressedResponseRawJsonUploadErrorConstructorParams>;

export function buildSaveCompressedResponseRawJsonUploadErrorConstructorParams(
	overrides?: SaveCompressedResponseRawJsonUploadErrorConstructorParamsOverrides,
): SaveCompressedResponseRawJsonUploadErrorConstructorParams {
	const base: SaveCompressedResponseRawJsonUploadErrorConstructorParams = {
		jobId: "job-1",
		driverMessage: "raw json upload failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveCompressedResponseRawJsonUploadErrorConstructorParamsCorruptions = {
	[K in keyof SaveCompressedResponseRawJsonUploadErrorConstructorParams]?: unknown;
};

export function invalidateSaveCompressedResponseRawJsonUploadErrorConstructorParams(
	corruptions: SaveCompressedResponseRawJsonUploadErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildSaveCompressedResponseRawJsonUploadErrorConstructorParams(),
		...corruptions,
	};
}

// --- SaveCompressedResponseRawJsonUploadError ---

export function buildSaveCompressedResponseRawJsonUploadError(
	overrides?: SaveCompressedResponseRawJsonUploadErrorConstructorParamsOverrides,
): SaveCompressedResponseRawJsonUploadError {
	return new SaveCompressedResponseRawJsonUploadError(
		buildSaveCompressedResponseRawJsonUploadErrorConstructorParams(overrides),
	);
}

// --- SaveCompressedResponseJobUpdateErrorConstructorParams ---

export type SaveCompressedResponseJobUpdateErrorConstructorParamsOverrides =
	Partial<SaveCompressedResponseJobUpdateErrorConstructorParams>;

export function buildSaveCompressedResponseJobUpdateErrorConstructorParams(
	overrides?: SaveCompressedResponseJobUpdateErrorConstructorParamsOverrides,
): SaveCompressedResponseJobUpdateErrorConstructorParams {
	const base: SaveCompressedResponseJobUpdateErrorConstructorParams = {
		jobId: "job-1",
		driverMessage: "waiting_for_children update failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveCompressedResponseJobUpdateErrorConstructorParamsCorruptions = {
	[K in keyof SaveCompressedResponseJobUpdateErrorConstructorParams]?: unknown;
};

export function invalidateSaveCompressedResponseJobUpdateErrorConstructorParams(
	corruptions: SaveCompressedResponseJobUpdateErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildSaveCompressedResponseJobUpdateErrorConstructorParams(),
		...corruptions,
	};
}

// --- SaveCompressedResponseJobUpdateError ---

export function buildSaveCompressedResponseJobUpdateError(
	overrides?: SaveCompressedResponseJobUpdateErrorConstructorParamsOverrides,
): SaveCompressedResponseJobUpdateError {
	return new SaveCompressedResponseJobUpdateError(
		buildSaveCompressedResponseJobUpdateErrorConstructorParams(overrides),
	);
}

// --- SaveCompressedResponseExtractedUploadErrorConstructorParams ---

export type SaveCompressedResponseExtractedUploadErrorConstructorParamsOverrides =
	Partial<SaveCompressedResponseExtractedUploadErrorConstructorParams>;

export function buildSaveCompressedResponseExtractedUploadErrorConstructorParams(
	overrides?: SaveCompressedResponseExtractedUploadErrorConstructorParamsOverrides,
): SaveCompressedResponseExtractedUploadErrorConstructorParams {
	const base: SaveCompressedResponseExtractedUploadErrorConstructorParams = {
		jobId: "job-1",
		driverMessage: "extracted context upload failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type SaveCompressedResponseExtractedUploadErrorConstructorParamsCorruptions = {
	[K in keyof SaveCompressedResponseExtractedUploadErrorConstructorParams]?: unknown;
};

export function invalidateSaveCompressedResponseExtractedUploadErrorConstructorParams(
	corruptions: SaveCompressedResponseExtractedUploadErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildSaveCompressedResponseExtractedUploadErrorConstructorParams(),
		...corruptions,
	};
}

// --- SaveCompressedResponseExtractedUploadError ---

export function buildSaveCompressedResponseExtractedUploadError(
	overrides?: SaveCompressedResponseExtractedUploadErrorConstructorParamsOverrides,
): SaveCompressedResponseExtractedUploadError {
	return new SaveCompressedResponseExtractedUploadError(
		buildSaveCompressedResponseExtractedUploadErrorConstructorParams(overrides),
	);
}
