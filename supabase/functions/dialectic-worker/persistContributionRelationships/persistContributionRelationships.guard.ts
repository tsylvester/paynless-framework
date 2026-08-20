import type {
	PersistContributionRelationshipsDeps,
	PersistContributionRelationshipsParams,
	PersistContributionRelationshipsPayload,
	PersistContributionRelationshipsPersistedReturn,
	PersistContributionRelationshipsUnchangedReturn,
	PersistContributionRelationshipsErrorReturn,
	PersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
	PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
	PersistContributionRelationshipsUpdateErrorConstructorParams,
	PersistContributionRelationshipsStageEntryErrorConstructorParams,
	PersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
	PersistContributionRelationshipsMergedEntryErrorConstructorParams,
} from './persistContributionRelationships.interface.ts';
import {
	PersistContributionRelationshipsStageSlugMissingError,
	PersistContributionRelationshipsRelationshipsMissingError,
	PersistContributionRelationshipsUpdateError,
	PersistContributionRelationshipsStageEntryError,
	PersistContributionRelationshipsStageSlugTypeError,
	PersistContributionRelationshipsMergedEntryError,
} from './persistContributionRelationships.interface.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';
import {
	isDialecticContribution,
	isDialecticExecuteJobPayload,
	isDialecticJobRow,
} from '../../_shared/utils/type-guards/type_guards.dialectic.ts';

// --- Deps (behavior type: the type declares no member, so the record check is the whole guard) ---

export function isPersistContributionRelationshipsDeps(
	value: unknown,
): value is PersistContributionRelationshipsDeps {
	return isRecord(value);
}

// --- Params ---

export function isPersistContributionRelationshipsParams(
	value: unknown,
): value is PersistContributionRelationshipsParams {
	if (!isRecord(value)) return false;
	// dbClient is a vendor SupabaseClient<Database> this repo does not own; presence + record only.
	if (!('dbClient' in value) || !isRecord(value.dbClient)) return false;
	if (!('job' in value) || !isDialecticJobRow(value.job)) return false;
	if (!('contribution' in value) || !isDialecticContribution(value.contribution)) return false;
	if (!('isContinuationForStorage' in value) || typeof value.isContinuationForStorage !== 'boolean') return false;
	return true;
}

// --- Payload (wraps the throwing arm guard, keeping a boolean contract) ---

export function isPersistContributionRelationshipsPayload(
	value: unknown,
): value is PersistContributionRelationshipsPayload {
	try {
		if (!isDialecticExecuteJobPayload(value)) return false;
	} catch {
		return false;
	}
	return true;
}

// --- PersistedReturn ---

export function isPersistContributionRelationshipsPersistedReturn(
	value: unknown,
): value is PersistContributionRelationshipsPersistedReturn {
	if (!isRecord(value)) return false;
	if (!('persisted' in value) || value.persisted !== true) return false;
	if (!('contribution' in value) || !isDialecticContribution(value.contribution)) return false;
	return true;
}

// --- UnchangedReturn ---

export function isPersistContributionRelationshipsUnchangedReturn(
	value: unknown,
): value is PersistContributionRelationshipsUnchangedReturn {
	if (!isRecord(value)) return false;
	if (!('persisted' in value) || value.persisted !== false) return false;
	if (!('contribution' in value) || !isDialecticContribution(value.contribution)) return false;
	return true;
}

// --- ErrorReturn ---

export function isPersistContributionRelationshipsErrorReturn(
	value: unknown,
): value is PersistContributionRelationshipsErrorReturn {
	if (!isRecord(value)) return false;
	if (!('error' in value) || !(value.error instanceof Error)) return false;
	if (!('retriable' in value) || typeof value.retriable !== 'boolean') return false;
	return true;
}

// --- Owned error instanceof guards ---

export function isPersistContributionRelationshipsStageSlugMissingError(
	value: unknown,
): value is PersistContributionRelationshipsStageSlugMissingError {
	return value instanceof PersistContributionRelationshipsStageSlugMissingError;
}

export function isPersistContributionRelationshipsRelationshipsMissingError(
	value: unknown,
): value is PersistContributionRelationshipsRelationshipsMissingError {
	return value instanceof PersistContributionRelationshipsRelationshipsMissingError;
}

export function isPersistContributionRelationshipsUpdateError(
	value: unknown,
): value is PersistContributionRelationshipsUpdateError {
	return value instanceof PersistContributionRelationshipsUpdateError;
}

export function isPersistContributionRelationshipsStageEntryError(
	value: unknown,
): value is PersistContributionRelationshipsStageEntryError {
	return value instanceof PersistContributionRelationshipsStageEntryError;
}

export function isPersistContributionRelationshipsStageSlugTypeError(
	value: unknown,
): value is PersistContributionRelationshipsStageSlugTypeError {
	return value instanceof PersistContributionRelationshipsStageSlugTypeError;
}

export function isPersistContributionRelationshipsMergedEntryError(
	value: unknown,
): value is PersistContributionRelationshipsMergedEntryError {
	return value instanceof PersistContributionRelationshipsMergedEntryError;
}

// --- Constructor-params guards (infill: guards.md requires shape checks on constructor params) ---

export function isPersistContributionRelationshipsStageSlugMissingErrorConstructorParams(
	value: unknown,
): value is PersistContributionRelationshipsStageSlugMissingErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
	if (!('contributionId' in value) || typeof value.contributionId !== 'string' || value.contributionId.length === 0) return false;
	return true;
}

export function isPersistContributionRelationshipsRelationshipsMissingErrorConstructorParams(
	value: unknown,
): value is PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
	if (!('contributionId' in value) || typeof value.contributionId !== 'string' || value.contributionId.length === 0) return false;
	return true;
}

export function isPersistContributionRelationshipsUpdateErrorConstructorParams(
	value: unknown,
): value is PersistContributionRelationshipsUpdateErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
	if (!('contributionId' in value) || typeof value.contributionId !== 'string' || value.contributionId.length === 0) return false;
	if (!('stageSlug' in value) || typeof value.stageSlug !== 'string' || value.stageSlug.length === 0) return false;
	if (!('driverMessage' in value) || typeof value.driverMessage !== 'string' || value.driverMessage.length === 0) return false;
	return true;
}

export function isPersistContributionRelationshipsStageEntryErrorConstructorParams(
	value: unknown,
): value is PersistContributionRelationshipsStageEntryErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
	if (!('contributionId' in value) || typeof value.contributionId !== 'string' || value.contributionId.length === 0) return false;
	if (!('stageSlug' in value) || typeof value.stageSlug !== 'string' || value.stageSlug.length === 0) return false;
	return true;
}

export function isPersistContributionRelationshipsStageSlugTypeErrorConstructorParams(
	value: unknown,
): value is PersistContributionRelationshipsStageSlugTypeErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
	if (!('contributionId' in value) || typeof value.contributionId !== 'string' || value.contributionId.length === 0) return false;
	if (!('stageSlug' in value) || typeof value.stageSlug !== 'string' || value.stageSlug.length === 0) return false;
	return true;
}

export function isPersistContributionRelationshipsMergedEntryErrorConstructorParams(
	value: unknown,
): value is PersistContributionRelationshipsMergedEntryErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!('jobId' in value) || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
	if (!('contributionId' in value) || typeof value.contributionId !== 'string' || value.contributionId.length === 0) return false;
	if (!('stageSlug' in value) || typeof value.stageSlug !== 'string' || value.stageSlug.length === 0) return false;
	return true;
}
