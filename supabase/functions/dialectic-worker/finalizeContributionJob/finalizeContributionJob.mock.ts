import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { mockNotificationService } from "../../_shared/utils/notification.service.mock.ts";
import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import {
	buildDialecticContributionRow,
	buildDialecticExecuteJobPayload,
	buildDialecticJobRow,
	buildDocumentRelationships,
	buildUnifiedAIResponse,
} from "../../_shared/dialectic.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import { buildEnqueueRenderJobSuccessReturn } from "../enqueueRenderJob/enqueueRenderJob.mock.ts";
import { buildContinueJobEnqueuedReturn } from "../continueJob/continueJob.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
	BoundContinueJobFn,
} from "../continueJob/continueJob.interface.ts";
import type {
	BoundEnqueueRenderJobFn,
} from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import {
	FinalizeContributionJobDeps,
	FinalizeContributionJobParams,
	FinalizeContributionJobPayload,
	FinalizeContributionJobSuccessReturn,
	FinalizeContributionJobErrorReturn,
	FinalizeContributionJobFn,
	BoundFinalizeContributionJobFn,
	FinalizeContributionJobDocumentRelatedErrorConstructorParams,
	FinalizeContributionJobDocumentRelatedError,
	FinalizeContributionJobRenderDispatchErrorConstructorParams,
	FinalizeContributionJobRenderDispatchError,
	FinalizeContributionJobPromptLinkErrorConstructorParams,
	FinalizeContributionJobPromptLinkError,
	FinalizeContributionJobDocumentKeyErrorConstructorParams,
	FinalizeContributionJobDocumentKeyError,
	FinalizeContributionJobContinuationErrorConstructorParams,
	FinalizeContributionJobContinuationError,
	FinalizeContributionJobCompletionUpdateErrorConstructorParams,
	FinalizeContributionJobCompletionUpdateError,
} from "./finalizeContributionJob.interface.ts";


// --- FinalizeContributionJobDeps ---

const defaultBoundContinueJob: BoundContinueJobFn = async (_params, _payload) => buildContinueJobEnqueuedReturn();
const defaultBoundEnqueueRenderJob: BoundEnqueueRenderJobFn = async (_params, _payload) => buildEnqueueRenderJobSuccessReturn();

export type FinalizeContributionJobDepsOverrides = Partial<FinalizeContributionJobDeps>;

export function buildFinalizeContributionJobDeps(
	overrides?: FinalizeContributionJobDepsOverrides,
): FinalizeContributionJobDeps {
	const base: FinalizeContributionJobDeps = {
		logger: new MockLogger(),
		notificationService: mockNotificationService,
		fileManager: createMockFileManagerService(),
		continueJob: defaultBoundContinueJob,
		enqueueRenderJob: defaultBoundEnqueueRenderJob,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobDepsCorruptions = {
	[K in keyof FinalizeContributionJobDeps]?: unknown;
};

export function invalidateFinalizeContributionJobDeps(
	corruptions: FinalizeContributionJobDepsCorruptions,
): unknown {
	return { ...buildFinalizeContributionJobDeps(), ...corruptions };
}

// --- FinalizeContributionJobParams ---

export type FinalizeContributionJobParamsOverrides = Partial<FinalizeContributionJobParams>;

export function buildFinalizeContributionJobParams(
	overrides?: FinalizeContributionJobParamsOverrides,
): FinalizeContributionJobParams {
	const mockSetup = createMockSupabaseClient();
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
	const base: FinalizeContributionJobParams = {
		dbClient,
		job: buildDialecticJobRow(),
		contribution: buildDialecticContributionRow({
			document_relationships: buildDocumentRelationships(),
		}),
		assembledResponse: buildUnifiedAIResponse(),
		preparedContentResult: buildPrepareResponseContentPreparedReturn(),
		storageFileType: FileType.ModelContributionRawJson,
		isContinuationForStorage: false,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobParamsCorruptions = {
	[K in keyof FinalizeContributionJobParams]?: unknown;
};

export function invalidateFinalizeContributionJobParams(
	corruptions: FinalizeContributionJobParamsCorruptions,
): unknown {
	return { ...buildFinalizeContributionJobParams(), ...corruptions };
}

// --- FinalizeContributionJobPayload ---

export type FinalizeContributionJobPayloadOverrides = Partial<FinalizeContributionJobPayload>;

export function buildFinalizeContributionJobPayload(
	overrides?: FinalizeContributionJobPayloadOverrides,
): FinalizeContributionJobPayload {
	const base: FinalizeContributionJobPayload = buildDialecticExecuteJobPayload();
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobPayloadCorruptions = {
	[K in keyof FinalizeContributionJobPayload]?: unknown;
};

export function invalidateFinalizeContributionJobPayload(
	corruptions: FinalizeContributionJobPayloadCorruptions,
): unknown {
	return { ...buildFinalizeContributionJobPayload(), ...corruptions };
}

// --- FinalizeContributionJobSuccessReturn ---

export type FinalizeContributionJobSuccessReturnOverrides =
	Partial<FinalizeContributionJobSuccessReturn>;

export function buildFinalizeContributionJobSuccessReturn(
	overrides?: FinalizeContributionJobSuccessReturnOverrides,
): FinalizeContributionJobSuccessReturn {
	const base: FinalizeContributionJobSuccessReturn = { status: "completed" };
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobSuccessReturnCorruptions = {
	[K in keyof FinalizeContributionJobSuccessReturn]?: unknown;
};

export function invalidateFinalizeContributionJobSuccessReturn(
	corruptions: FinalizeContributionJobSuccessReturnCorruptions,
): unknown {
	return { ...buildFinalizeContributionJobSuccessReturn(), ...corruptions };
}

// --- FinalizeContributionJobErrorReturn ---

export type FinalizeContributionJobErrorReturnOverrides =
	Partial<FinalizeContributionJobErrorReturn>;

export function buildFinalizeContributionJobErrorReturn(
	overrides?: FinalizeContributionJobErrorReturnOverrides,
): FinalizeContributionJobErrorReturn {
	const base: FinalizeContributionJobErrorReturn = {
		error: buildFinalizeContributionJobDocumentRelatedError(),
		retriable: false,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobErrorReturnCorruptions = {
	[K in keyof FinalizeContributionJobErrorReturn]?: unknown;
};

export function invalidateFinalizeContributionJobErrorReturn(
	corruptions: FinalizeContributionJobErrorReturnCorruptions,
): unknown {
	return { ...buildFinalizeContributionJobErrorReturn(), ...corruptions };
}

// --- FinalizeContributionJobDocumentRelatedErrorConstructorParams ---

export type FinalizeContributionJobDocumentRelatedErrorConstructorParamsOverrides =
	Partial<FinalizeContributionJobDocumentRelatedErrorConstructorParams>;

export function buildFinalizeContributionJobDocumentRelatedErrorConstructorParams(
	overrides?: FinalizeContributionJobDocumentRelatedErrorConstructorParamsOverrides,
): FinalizeContributionJobDocumentRelatedErrorConstructorParams {
	const base: FinalizeContributionJobDocumentRelatedErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contrib-1",
		stageSlug: "thesis",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobDocumentRelatedErrorConstructorParamsCorruptions = {
	[K in keyof FinalizeContributionJobDocumentRelatedErrorConstructorParams]?: unknown;
};

export function invalidateFinalizeContributionJobDocumentRelatedErrorConstructorParams(
	corruptions: FinalizeContributionJobDocumentRelatedErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildFinalizeContributionJobDocumentRelatedErrorConstructorParams(),
		...corruptions,
	};
}

// --- FinalizeContributionJobDocumentRelatedError ---

export function buildFinalizeContributionJobDocumentRelatedError(
	overrides?: FinalizeContributionJobDocumentRelatedErrorConstructorParamsOverrides,
): FinalizeContributionJobDocumentRelatedError {
	return new FinalizeContributionJobDocumentRelatedError(
		buildFinalizeContributionJobDocumentRelatedErrorConstructorParams(overrides),
	);
}

// --- FinalizeContributionJobRenderDispatchErrorConstructorParams ---

export type FinalizeContributionJobRenderDispatchErrorConstructorParamsOverrides =
	Partial<FinalizeContributionJobRenderDispatchErrorConstructorParams>;

export function buildFinalizeContributionJobRenderDispatchErrorConstructorParams(
	overrides?: FinalizeContributionJobRenderDispatchErrorConstructorParamsOverrides,
): FinalizeContributionJobRenderDispatchErrorConstructorParams {
	const base: FinalizeContributionJobRenderDispatchErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contrib-1",
		driverMessage: "render dispatch failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobRenderDispatchErrorConstructorParamsCorruptions = {
	[K in keyof FinalizeContributionJobRenderDispatchErrorConstructorParams]?: unknown;
};

export function invalidateFinalizeContributionJobRenderDispatchErrorConstructorParams(
	corruptions: FinalizeContributionJobRenderDispatchErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildFinalizeContributionJobRenderDispatchErrorConstructorParams(),
		...corruptions,
	};
}

// --- FinalizeContributionJobRenderDispatchError ---

export function buildFinalizeContributionJobRenderDispatchError(
	overrides?: FinalizeContributionJobRenderDispatchErrorConstructorParamsOverrides,
): FinalizeContributionJobRenderDispatchError {
	return new FinalizeContributionJobRenderDispatchError(
		buildFinalizeContributionJobRenderDispatchErrorConstructorParams(overrides),
	);
}

// --- FinalizeContributionJobPromptLinkErrorConstructorParams ---

export type FinalizeContributionJobPromptLinkErrorConstructorParamsOverrides =
	Partial<FinalizeContributionJobPromptLinkErrorConstructorParams>;

export function buildFinalizeContributionJobPromptLinkErrorConstructorParams(
	overrides?: FinalizeContributionJobPromptLinkErrorConstructorParamsOverrides,
): FinalizeContributionJobPromptLinkErrorConstructorParams {
	const base: FinalizeContributionJobPromptLinkErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contrib-1",
		promptResourceId: "prompt-resource-1",
		driverMessage: "prompt link update failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobPromptLinkErrorConstructorParamsCorruptions = {
	[K in keyof FinalizeContributionJobPromptLinkErrorConstructorParams]?: unknown;
};

export function invalidateFinalizeContributionJobPromptLinkErrorConstructorParams(
	corruptions: FinalizeContributionJobPromptLinkErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildFinalizeContributionJobPromptLinkErrorConstructorParams(),
		...corruptions,
	};
}

// --- FinalizeContributionJobPromptLinkError ---

export function buildFinalizeContributionJobPromptLinkError(
	overrides?: FinalizeContributionJobPromptLinkErrorConstructorParamsOverrides,
): FinalizeContributionJobPromptLinkError {
	return new FinalizeContributionJobPromptLinkError(
		buildFinalizeContributionJobPromptLinkErrorConstructorParams(overrides),
	);
}

// --- FinalizeContributionJobDocumentKeyErrorConstructorParams ---

export type FinalizeContributionJobDocumentKeyErrorConstructorParamsOverrides =
	Partial<FinalizeContributionJobDocumentKeyErrorConstructorParams>;

export function buildFinalizeContributionJobDocumentKeyErrorConstructorParams(
	overrides?: FinalizeContributionJobDocumentKeyErrorConstructorParamsOverrides,
): FinalizeContributionJobDocumentKeyErrorConstructorParams {
	const base: FinalizeContributionJobDocumentKeyErrorConstructorParams = {
		jobId: "job-1",
		notificationType: "execute_chunk_completed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobDocumentKeyErrorConstructorParamsCorruptions = {
	[K in keyof FinalizeContributionJobDocumentKeyErrorConstructorParams]?: unknown;
};

export function invalidateFinalizeContributionJobDocumentKeyErrorConstructorParams(
	corruptions: FinalizeContributionJobDocumentKeyErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildFinalizeContributionJobDocumentKeyErrorConstructorParams(),
		...corruptions,
	};
}

// --- FinalizeContributionJobDocumentKeyError ---

export function buildFinalizeContributionJobDocumentKeyError(
	overrides?: FinalizeContributionJobDocumentKeyErrorConstructorParamsOverrides,
): FinalizeContributionJobDocumentKeyError {
	return new FinalizeContributionJobDocumentKeyError(
		buildFinalizeContributionJobDocumentKeyErrorConstructorParams(overrides),
	);
}

// --- FinalizeContributionJobContinuationErrorConstructorParams ---

export type FinalizeContributionJobContinuationErrorConstructorParamsOverrides =
	Partial<FinalizeContributionJobContinuationErrorConstructorParams>;

export function buildFinalizeContributionJobContinuationErrorConstructorParams(
	overrides?: FinalizeContributionJobContinuationErrorConstructorParamsOverrides,
): FinalizeContributionJobContinuationErrorConstructorParams {
	const base: FinalizeContributionJobContinuationErrorConstructorParams = {
		jobId: "job-1",
		driverMessage: "continuation failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobContinuationErrorConstructorParamsCorruptions = {
	[K in keyof FinalizeContributionJobContinuationErrorConstructorParams]?: unknown;
};

export function invalidateFinalizeContributionJobContinuationErrorConstructorParams(
	corruptions: FinalizeContributionJobContinuationErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildFinalizeContributionJobContinuationErrorConstructorParams(),
		...corruptions,
	};
}

// --- FinalizeContributionJobContinuationError ---

export function buildFinalizeContributionJobContinuationError(
	overrides?: FinalizeContributionJobContinuationErrorConstructorParamsOverrides,
): FinalizeContributionJobContinuationError {
	return new FinalizeContributionJobContinuationError(
		buildFinalizeContributionJobContinuationErrorConstructorParams(overrides),
	);
}

// --- FinalizeContributionJobCompletionUpdateErrorConstructorParams ---

export type FinalizeContributionJobCompletionUpdateErrorConstructorParamsOverrides =
	Partial<FinalizeContributionJobCompletionUpdateErrorConstructorParams>;

export function buildFinalizeContributionJobCompletionUpdateErrorConstructorParams(
	overrides?: FinalizeContributionJobCompletionUpdateErrorConstructorParamsOverrides,
): FinalizeContributionJobCompletionUpdateErrorConstructorParams {
	const base: FinalizeContributionJobCompletionUpdateErrorConstructorParams = {
		jobId: "job-1",
		driverMessage: "completion update failed",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type FinalizeContributionJobCompletionUpdateErrorConstructorParamsCorruptions = {
	[K in keyof FinalizeContributionJobCompletionUpdateErrorConstructorParams]?: unknown;
};

export function invalidateFinalizeContributionJobCompletionUpdateErrorConstructorParams(
	corruptions: FinalizeContributionJobCompletionUpdateErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildFinalizeContributionJobCompletionUpdateErrorConstructorParams(),
		...corruptions,
	};
}

// --- FinalizeContributionJobCompletionUpdateError ---

export function buildFinalizeContributionJobCompletionUpdateError(
	overrides?: FinalizeContributionJobCompletionUpdateErrorConstructorParamsOverrides,
): FinalizeContributionJobCompletionUpdateError {
	return new FinalizeContributionJobCompletionUpdateError(
		buildFinalizeContributionJobCompletionUpdateErrorConstructorParams(overrides),
	);
}

// --- Function mock ---

export const mockFinalizeContributionJob: FinalizeContributionJobFn = async (
	_deps,
	_params,
	_payload,
) => {
	return buildFinalizeContributionJobSuccessReturn();
};

export const mockBoundFinalizeContributionJob: BoundFinalizeContributionJobFn = async (
	_params,
	_payload,
) => {
	return buildFinalizeContributionJobSuccessReturn();
};
