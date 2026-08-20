import type {
	PersistContributionRelationshipsDeps,
	PersistContributionRelationshipsParams,
	PersistContributionRelationshipsPayload,
	PersistContributionRelationshipsPersistedReturn,
	PersistContributionRelationshipsUnchangedReturn,
	PersistContributionRelationshipsErrorReturn,
	PersistContributionRelationshipsFn,
	BoundPersistContributionRelationshipsFn,
	PersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
	PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
	PersistContributionRelationshipsUpdateErrorConstructorParams,
	PersistContributionRelationshipsStageEntryErrorConstructorParams,
	PersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
	PersistContributionRelationshipsMergedEntryErrorConstructorParams,
} from "./persistContributionRelationships.interface.ts";
import {
	PersistContributionRelationshipsStageSlugMissingError,
	PersistContributionRelationshipsRelationshipsMissingError,
	PersistContributionRelationshipsUpdateError,
	PersistContributionRelationshipsStageEntryError,
	PersistContributionRelationshipsStageSlugTypeError,
	PersistContributionRelationshipsMergedEntryError,
} from "./persistContributionRelationships.interface.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
	buildDialecticContributionRow,
	buildDialecticExecuteJobPayload,
	buildDialecticJobRow,
} from "../../_shared/dialectic.mock.ts";

// --- PersistContributionRelationshipsDeps ---

export type PersistContributionRelationshipsDepsOverrides =
	Partial<PersistContributionRelationshipsDeps>;

export function buildPersistContributionRelationshipsDeps(
	_overrides?: PersistContributionRelationshipsDepsOverrides,
): PersistContributionRelationshipsDeps {
	const base: PersistContributionRelationshipsDeps = {};
	return base;
}

export type PersistContributionRelationshipsDepsCorruptions = {
	[K in keyof PersistContributionRelationshipsDeps]?: unknown;
};

export function invalidatePersistContributionRelationshipsDeps(
	_corruptions: PersistContributionRelationshipsDepsCorruptions,
): unknown {
	return { ...buildPersistContributionRelationshipsDeps() };
}

// --- PersistContributionRelationshipsParams ---

const { client: defaultDbClient } = createMockSupabaseClient(undefined, {});

export type PersistContributionRelationshipsParamsOverrides =
	Partial<PersistContributionRelationshipsParams>;

export function buildPersistContributionRelationshipsParams(
	overrides?: PersistContributionRelationshipsParamsOverrides,
): PersistContributionRelationshipsParams {
	const base: PersistContributionRelationshipsParams = {
		dbClient: defaultDbClient as unknown as SupabaseClient<Database>,
		job: buildDialecticJobRow(),
		contribution: buildDialecticContributionRow(),
		isContinuationForStorage: false,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsParamsCorruptions = {
	[K in keyof PersistContributionRelationshipsParams]?: unknown;
};

export function invalidatePersistContributionRelationshipsParams(
	corruptions: PersistContributionRelationshipsParamsCorruptions,
): unknown {
	return { ...buildPersistContributionRelationshipsParams(), ...corruptions };
}

// --- PersistContributionRelationshipsPayload ---

export type PersistContributionRelationshipsPayloadOverrides =
	Partial<PersistContributionRelationshipsPayload>;

export function buildPersistContributionRelationshipsPayload(
	overrides?: PersistContributionRelationshipsPayloadOverrides,
): PersistContributionRelationshipsPayload {
	const base: PersistContributionRelationshipsPayload = {
		...buildDialecticExecuteJobPayload({ stageSlug: "thesis" }),
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsPayloadCorruptions = {
	[K in keyof PersistContributionRelationshipsPayload]?: unknown;
};

export function invalidatePersistContributionRelationshipsPayload(
	corruptions: PersistContributionRelationshipsPayloadCorruptions,
): unknown {
	return { ...buildPersistContributionRelationshipsPayload(), ...corruptions };
}

// --- PersistContributionRelationshipsPersistedReturn ---

export type PersistContributionRelationshipsPersistedReturnOverrides =
	Partial<PersistContributionRelationshipsPersistedReturn>;

export function buildPersistContributionRelationshipsPersistedReturn(
	overrides?: PersistContributionRelationshipsPersistedReturnOverrides,
): PersistContributionRelationshipsPersistedReturn {
	const base: PersistContributionRelationshipsPersistedReturn = {
		persisted: true,
		contribution: buildDialecticContributionRow(),
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsPersistedReturnCorruptions = {
	[K in keyof PersistContributionRelationshipsPersistedReturn]?: unknown;
};

export function invalidatePersistContributionRelationshipsPersistedReturn(
	corruptions: PersistContributionRelationshipsPersistedReturnCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsPersistedReturn(),
		...corruptions,
	};
}

// --- PersistContributionRelationshipsUnchangedReturn ---

export type PersistContributionRelationshipsUnchangedReturnOverrides =
	Partial<PersistContributionRelationshipsUnchangedReturn>;

export function buildPersistContributionRelationshipsUnchangedReturn(
	overrides?: PersistContributionRelationshipsUnchangedReturnOverrides,
): PersistContributionRelationshipsUnchangedReturn {
	const base: PersistContributionRelationshipsUnchangedReturn = {
		persisted: false,
		contribution: buildDialecticContributionRow(),
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsUnchangedReturnCorruptions = {
	[K in keyof PersistContributionRelationshipsUnchangedReturn]?: unknown;
};

export function invalidatePersistContributionRelationshipsUnchangedReturn(
	corruptions: PersistContributionRelationshipsUnchangedReturnCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsUnchangedReturn(),
		...corruptions,
	};
}

// --- PersistContributionRelationshipsErrorReturn ---

export type PersistContributionRelationshipsErrorReturnOverrides =
	Partial<PersistContributionRelationshipsErrorReturn>;

export function buildPersistContributionRelationshipsErrorReturn(
	overrides?: PersistContributionRelationshipsErrorReturnOverrides,
): PersistContributionRelationshipsErrorReturn {
	const base: PersistContributionRelationshipsErrorReturn = {
		error: buildPersistContributionRelationshipsUpdateError(),
		retriable: false,
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsErrorReturnCorruptions = {
	[K in keyof PersistContributionRelationshipsErrorReturn]?: unknown;
};

export function invalidatePersistContributionRelationshipsErrorReturn(
	corruptions: PersistContributionRelationshipsErrorReturnCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsErrorReturn(),
		...corruptions,
	};
}

// --- PersistContributionRelationshipsStageSlugMissingErrorConstructorParams ---

export type PersistContributionRelationshipsStageSlugMissingErrorConstructorParamsOverrides =
	Partial<PersistContributionRelationshipsStageSlugMissingErrorConstructorParams>;

export function buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(
	overrides?: PersistContributionRelationshipsStageSlugMissingErrorConstructorParamsOverrides,
): PersistContributionRelationshipsStageSlugMissingErrorConstructorParams {
	const base: PersistContributionRelationshipsStageSlugMissingErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contribution-1",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsStageSlugMissingErrorConstructorParamsCorruptions = {
	[K in keyof PersistContributionRelationshipsStageSlugMissingErrorConstructorParams]?: unknown;
};

export function invalidatePersistContributionRelationshipsStageSlugMissingErrorConstructorParams(
	corruptions: PersistContributionRelationshipsStageSlugMissingErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(),
		...corruptions,
	};
}

export function buildPersistContributionRelationshipsStageSlugMissingError(
	overrides?: PersistContributionRelationshipsStageSlugMissingErrorConstructorParamsOverrides,
): PersistContributionRelationshipsStageSlugMissingError {
	return new PersistContributionRelationshipsStageSlugMissingError(
		buildPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(overrides),
	);
}

// --- PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams ---

export type PersistContributionRelationshipsRelationshipsMissingErrorConstructorParamsOverrides =
	Partial<PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams>;

export function buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(
	overrides?: PersistContributionRelationshipsRelationshipsMissingErrorConstructorParamsOverrides,
): PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams {
	const base: PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contribution-1",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsRelationshipsMissingErrorConstructorParamsCorruptions = {
	[K in keyof PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams]?: unknown;
};

export function invalidatePersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(
	corruptions: PersistContributionRelationshipsRelationshipsMissingErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(),
		...corruptions,
	};
}

export function buildPersistContributionRelationshipsRelationshipsMissingError(
	overrides?: PersistContributionRelationshipsRelationshipsMissingErrorConstructorParamsOverrides,
): PersistContributionRelationshipsRelationshipsMissingError {
	return new PersistContributionRelationshipsRelationshipsMissingError(
		buildPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(overrides),
	);
}

// --- PersistContributionRelationshipsUpdateErrorConstructorParams ---

export type PersistContributionRelationshipsUpdateErrorConstructorParamsOverrides =
	Partial<PersistContributionRelationshipsUpdateErrorConstructorParams>;

export function buildPersistContributionRelationshipsUpdateErrorConstructorParams(
	overrides?: PersistContributionRelationshipsUpdateErrorConstructorParamsOverrides,
): PersistContributionRelationshipsUpdateErrorConstructorParams {
	const base: PersistContributionRelationshipsUpdateErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contribution-1",
		stageSlug: "thesis",
		driverMessage: "driver error",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsUpdateErrorConstructorParamsCorruptions = {
	[K in keyof PersistContributionRelationshipsUpdateErrorConstructorParams]?: unknown;
};

export function invalidatePersistContributionRelationshipsUpdateErrorConstructorParams(
	corruptions: PersistContributionRelationshipsUpdateErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsUpdateErrorConstructorParams(),
		...corruptions,
	};
}

export function buildPersistContributionRelationshipsUpdateError(
	overrides?: PersistContributionRelationshipsUpdateErrorConstructorParamsOverrides,
): PersistContributionRelationshipsUpdateError {
	return new PersistContributionRelationshipsUpdateError(
		buildPersistContributionRelationshipsUpdateErrorConstructorParams(overrides),
	);
}

// --- PersistContributionRelationshipsStageEntryErrorConstructorParams ---

export type PersistContributionRelationshipsStageEntryErrorConstructorParamsOverrides =
	Partial<PersistContributionRelationshipsStageEntryErrorConstructorParams>;

export function buildPersistContributionRelationshipsStageEntryErrorConstructorParams(
	overrides?: PersistContributionRelationshipsStageEntryErrorConstructorParamsOverrides,
): PersistContributionRelationshipsStageEntryErrorConstructorParams {
	const base: PersistContributionRelationshipsStageEntryErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contribution-1",
		stageSlug: "thesis",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsStageEntryErrorConstructorParamsCorruptions = {
	[K in keyof PersistContributionRelationshipsStageEntryErrorConstructorParams]?: unknown;
};

export function invalidatePersistContributionRelationshipsStageEntryErrorConstructorParams(
	corruptions: PersistContributionRelationshipsStageEntryErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsStageEntryErrorConstructorParams(),
		...corruptions,
	};
}

export function buildPersistContributionRelationshipsStageEntryError(
	overrides?: PersistContributionRelationshipsStageEntryErrorConstructorParamsOverrides,
): PersistContributionRelationshipsStageEntryError {
	return new PersistContributionRelationshipsStageEntryError(
		buildPersistContributionRelationshipsStageEntryErrorConstructorParams(overrides),
	);
}

// --- PersistContributionRelationshipsStageSlugTypeErrorConstructorParams ---

export type PersistContributionRelationshipsStageSlugTypeErrorConstructorParamsOverrides =
	Partial<PersistContributionRelationshipsStageSlugTypeErrorConstructorParams>;

export function buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(
	overrides?: PersistContributionRelationshipsStageSlugTypeErrorConstructorParamsOverrides,
): PersistContributionRelationshipsStageSlugTypeErrorConstructorParams {
	const base: PersistContributionRelationshipsStageSlugTypeErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contribution-1",
		stageSlug: "thesis",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsStageSlugTypeErrorConstructorParamsCorruptions = {
	[K in keyof PersistContributionRelationshipsStageSlugTypeErrorConstructorParams]?: unknown;
};

export function invalidatePersistContributionRelationshipsStageSlugTypeErrorConstructorParams(
	corruptions: PersistContributionRelationshipsStageSlugTypeErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(),
		...corruptions,
	};
}

export function buildPersistContributionRelationshipsStageSlugTypeError(
	overrides?: PersistContributionRelationshipsStageSlugTypeErrorConstructorParamsOverrides,
): PersistContributionRelationshipsStageSlugTypeError {
	return new PersistContributionRelationshipsStageSlugTypeError(
		buildPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(overrides),
	);
}

// --- PersistContributionRelationshipsMergedEntryErrorConstructorParams ---

export type PersistContributionRelationshipsMergedEntryErrorConstructorParamsOverrides =
	Partial<PersistContributionRelationshipsMergedEntryErrorConstructorParams>;

export function buildPersistContributionRelationshipsMergedEntryErrorConstructorParams(
	overrides?: PersistContributionRelationshipsMergedEntryErrorConstructorParamsOverrides,
): PersistContributionRelationshipsMergedEntryErrorConstructorParams {
	const base: PersistContributionRelationshipsMergedEntryErrorConstructorParams = {
		jobId: "job-1",
		contributionId: "contribution-1",
		stageSlug: "thesis",
	};
	return overrides ? { ...base, ...overrides } : base;
}

export type PersistContributionRelationshipsMergedEntryErrorConstructorParamsCorruptions = {
	[K in keyof PersistContributionRelationshipsMergedEntryErrorConstructorParams]?: unknown;
};

export function invalidatePersistContributionRelationshipsMergedEntryErrorConstructorParams(
	corruptions: PersistContributionRelationshipsMergedEntryErrorConstructorParamsCorruptions,
): unknown {
	return {
		...buildPersistContributionRelationshipsMergedEntryErrorConstructorParams(),
		...corruptions,
	};
}

export function buildPersistContributionRelationshipsMergedEntryError(
	overrides?: PersistContributionRelationshipsMergedEntryErrorConstructorParamsOverrides,
): PersistContributionRelationshipsMergedEntryError {
	return new PersistContributionRelationshipsMergedEntryError(
		buildPersistContributionRelationshipsMergedEntryErrorConstructorParams(overrides),
	);
}

// --- Function mock ---

export const mockPersistContributionRelationships: PersistContributionRelationshipsFn = async (
	_deps,
	_params,
	_payload,
) => {
	return buildPersistContributionRelationshipsPersistedReturn();
};

export const mockBoundPersistContributionRelationships: BoundPersistContributionRelationshipsFn = async (
	_params,
	_payload,
) => {
	return buildPersistContributionRelationshipsPersistedReturn();
};
