import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { IFileManager } from "../../_shared/types/file_manager.types.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type {
	AiProvidersRow,
	DialecticExecuteJobPayload,
	DialecticJobRow,
	UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { BuildUploadContextFn } from "../createJobContext/JobContext.interface.ts";
import type { BoundResolveContributionIdentityFn } from "../resolveContributionIdentity/resolveContributionIdentity.interface.ts";
import type { BoundPersistContributionRelationshipsFn } from "../persistContributionRelationships/persistContributionRelationships.interface.ts";
import type { BoundFinalizeContributionJobFn } from "../finalizeContributionJob/finalizeContributionJob.interface.ts";
import type { PrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.interface.ts";

export interface SaveContributionResponseDeps {
	fileManager: IFileManager;
	buildUploadContext: BuildUploadContextFn;
	resolveContributionIdentity: BoundResolveContributionIdentityFn;
	persistContributionRelationships: BoundPersistContributionRelationshipsFn;
	finalizeContributionJob: BoundFinalizeContributionJobFn;
}

export interface SaveContributionResponseParams {
	dbClient: SupabaseClient<Database>;
	job: DialecticJobRow;
	providerRow: AiProvidersRow;
	modelConfig: AiModelExtendedConfig;
	assembledResponse: UnifiedAIResponse;
	preparedContentResult: PrepareResponseContentPreparedReturn;
}

export type SaveContributionResponsePayload = DialecticExecuteJobPayload;

export interface SaveContributionResponseSuccessReturn {
	status: "completed" | "needs_continuation" | "continuation_limit_reached";
}

export type SaveContributionResponseErrorReturn = {
	error: Error;
	retriable: boolean;
};

export type SaveContributionResponseReturn =
	| SaveContributionResponseSuccessReturn
	| SaveContributionResponseErrorReturn;

export type SaveContributionResponseFn = (
	deps: SaveContributionResponseDeps,
	params: SaveContributionResponseParams,
	payload: SaveContributionResponsePayload,
) => Promise<SaveContributionResponseReturn>;

export type BoundSaveContributionResponseFn = (
	params: SaveContributionResponseParams,
	payload: SaveContributionResponsePayload,
) => Promise<SaveContributionResponseReturn>;

export interface SaveContributionResponseBuildContextErrorConstructorParams {
	jobId: string;
}

export class SaveContributionResponseBuildContextError extends Error {
	readonly jobId: string;
	constructor(params: SaveContributionResponseBuildContextErrorConstructorParams) {
		super(`jobId: ${params.jobId}`);
		this.name = "SaveContributionResponseBuildContextError";
		this.jobId = params.jobId;
	}
}

export interface SaveContributionResponseUploadErrorConstructorParams {
	jobId: string;
	driverMessage: string;
}

export class SaveContributionResponseUploadError extends Error {
	readonly jobId: string;
	readonly driverMessage: string;
	constructor(params: SaveContributionResponseUploadErrorConstructorParams) {
		super(`jobId: ${params.jobId}, driverMessage: ${params.driverMessage}`);
		this.name = "SaveContributionResponseUploadError";
		this.jobId = params.jobId;
		this.driverMessage = params.driverMessage;
	}
}

export interface SaveContributionResponseContributionRecordErrorConstructorParams {
	jobId: string;
}

export class SaveContributionResponseContributionRecordError extends Error {
	readonly jobId: string;
	constructor(params: SaveContributionResponseContributionRecordErrorConstructorParams) {
		super(`jobId: ${params.jobId}`);
		this.name = "SaveContributionResponseContributionRecordError";
		this.jobId = params.jobId;
	}
}
