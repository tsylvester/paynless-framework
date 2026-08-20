import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
	DialecticContributionRow,
	DialecticExecuteJobPayload,
	DialecticJobRow,
} from "../../dialectic-service/dialectic.interface.ts";

export type PersistContributionRelationshipsDeps = Record<never, never>;

export interface PersistContributionRelationshipsParams {
	dbClient: SupabaseClient<Database>;
	job: DialecticJobRow;
	contribution: DialecticContributionRow;
	isContinuationForStorage: boolean;
}

export type PersistContributionRelationshipsPayload = DialecticExecuteJobPayload;

export interface PersistContributionRelationshipsPersistedReturn {
	persisted: true;
	contribution: DialecticContributionRow;
}

export interface PersistContributionRelationshipsUnchangedReturn {
	persisted: false;
	contribution: DialecticContributionRow;
}

export type PersistContributionRelationshipsSuccessReturn =
	| PersistContributionRelationshipsPersistedReturn
	| PersistContributionRelationshipsUnchangedReturn;

export type PersistContributionRelationshipsErrorReturn = {
	error: Error;
	retriable: boolean;
};

export type PersistContributionRelationshipsReturn =
	| PersistContributionRelationshipsSuccessReturn
	| PersistContributionRelationshipsErrorReturn;

export type PersistContributionRelationshipsFn = (
	deps: PersistContributionRelationshipsDeps,
	params: PersistContributionRelationshipsParams,
	payload: PersistContributionRelationshipsPayload,
) => Promise<PersistContributionRelationshipsReturn>;

export type BoundPersistContributionRelationshipsFn = (
	params: PersistContributionRelationshipsParams,
	payload: PersistContributionRelationshipsPayload,
) => Promise<PersistContributionRelationshipsReturn>;

export interface PersistContributionRelationshipsStageSlugMissingErrorConstructorParams {
	jobId: string;
	contributionId: string;
}

export class PersistContributionRelationshipsStageSlugMissingError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	constructor(
		params: PersistContributionRelationshipsStageSlugMissingErrorConstructorParams,
	) {
		super(
			`jobId: ${params.jobId}, contributionId: ${params.contributionId}`,
		);
		this.name = "PersistContributionRelationshipsStageSlugMissingError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
	}
}

export interface PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams {
	jobId: string;
	contributionId: string;
}

export class PersistContributionRelationshipsRelationshipsMissingError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	constructor(
		params: PersistContributionRelationshipsRelationshipsMissingErrorConstructorParams,
	) {
		super(
			`jobId: ${params.jobId}, contributionId: ${params.contributionId}`,
		);
		this.name = "PersistContributionRelationshipsRelationshipsMissingError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
	}
}

export interface PersistContributionRelationshipsUpdateErrorConstructorParams {
	jobId: string;
	contributionId: string;
	stageSlug: string;
	driverMessage: string;
}

export class PersistContributionRelationshipsUpdateError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	readonly stageSlug: string;
	readonly driverMessage: string;
	constructor(
		params: PersistContributionRelationshipsUpdateErrorConstructorParams,
	) {
		super(
			`jobId: ${params.jobId}, contributionId: ${params.contributionId}, stageSlug: ${params.stageSlug}, driverMessage: ${params.driverMessage}`,
		);
		this.name = "PersistContributionRelationshipsUpdateError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
		this.stageSlug = params.stageSlug;
		this.driverMessage = params.driverMessage;
	}
}

export interface PersistContributionRelationshipsStageEntryErrorConstructorParams {
	jobId: string;
	contributionId: string;
	stageSlug: string;
}

export class PersistContributionRelationshipsStageEntryError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	readonly stageSlug: string;
	constructor(
		params: PersistContributionRelationshipsStageEntryErrorConstructorParams,
	) {
		super(
			`jobId: ${params.jobId}, contributionId: ${params.contributionId}, stageSlug: ${params.stageSlug}`,
		);
		this.name = "PersistContributionRelationshipsStageEntryError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
		this.stageSlug = params.stageSlug;
	}
}

export interface PersistContributionRelationshipsStageSlugTypeErrorConstructorParams {
	jobId: string;
	contributionId: string;
	stageSlug: string;
}

export class PersistContributionRelationshipsStageSlugTypeError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	readonly stageSlug: string;
	constructor(
		params: PersistContributionRelationshipsStageSlugTypeErrorConstructorParams,
	) {
		super(
			`jobId: ${params.jobId}, contributionId: ${params.contributionId}, stageSlug: ${params.stageSlug}`,
		);
		this.name = "PersistContributionRelationshipsStageSlugTypeError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
		this.stageSlug = params.stageSlug;
	}
}

export interface PersistContributionRelationshipsMergedEntryErrorConstructorParams {
	jobId: string;
	contributionId: string;
	stageSlug: string;
}

export class PersistContributionRelationshipsMergedEntryError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	readonly stageSlug: string;
	constructor(
		params: PersistContributionRelationshipsMergedEntryErrorConstructorParams,
	) {
		super(
			`jobId: ${params.jobId}, contributionId: ${params.contributionId}, stageSlug: ${params.stageSlug}`,
		);
		this.name = "PersistContributionRelationshipsMergedEntryError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
		this.stageSlug = params.stageSlug;
	}
}
