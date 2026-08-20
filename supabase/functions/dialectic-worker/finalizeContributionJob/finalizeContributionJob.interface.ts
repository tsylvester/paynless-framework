import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { ILogger } from "../../_shared/types.ts";
import type { NotificationServiceType } from "../../_shared/types/notification.service.types.ts";
import type { IFileManager, FileType } from "../../_shared/types/file_manager.types.ts";
import type {
	DialecticContributionRow,
	DialecticExecuteJobPayload,
	DialecticJobRow,
	UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { PrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.interface.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type { BoundContinueJobFn } from "../continueJob/continueJob.interface.ts";

export interface FinalizeContributionJobDeps {
	logger: ILogger;
	notificationService: NotificationServiceType;
	fileManager: IFileManager;
	continueJob: BoundContinueJobFn;
	enqueueRenderJob: BoundEnqueueRenderJobFn;
}

export interface FinalizeContributionJobParams {
	dbClient: SupabaseClient<Database>;
	job: DialecticJobRow;
	contribution: DialecticContributionRow;
	assembledResponse: UnifiedAIResponse;
	preparedContentResult: PrepareResponseContentPreparedReturn;
	storageFileType: FileType;
	isContinuationForStorage: boolean;
}

export type FinalizeContributionJobPayload = DialecticExecuteJobPayload;

export interface FinalizeContributionJobSuccessReturn {
	status: "completed" | "needs_continuation" | "continuation_limit_reached";
}

export type FinalizeContributionJobErrorReturn = {
	error: Error;
	retriable: boolean;
};

export type FinalizeContributionJobReturn =
	| FinalizeContributionJobSuccessReturn
	| FinalizeContributionJobErrorReturn;

export type FinalizeContributionJobFn = (
	deps: FinalizeContributionJobDeps,
	params: FinalizeContributionJobParams,
	payload: FinalizeContributionJobPayload,
) => Promise<FinalizeContributionJobReturn>;

export type BoundFinalizeContributionJobFn = (
	params: FinalizeContributionJobParams,
	payload: FinalizeContributionJobPayload,
) => Promise<FinalizeContributionJobReturn>;

export interface FinalizeContributionJobDocumentRelatedErrorConstructorParams {
	jobId: string;
	contributionId: string;
	stageSlug: string;
}

export class FinalizeContributionJobDocumentRelatedError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	readonly stageSlug: string;
	constructor(params: FinalizeContributionJobDocumentRelatedErrorConstructorParams) {
		super(`jobId: ${params.jobId}, contributionId: ${params.contributionId}, stageSlug: ${params.stageSlug}`);
		this.name = "FinalizeContributionJobDocumentRelatedError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
		this.stageSlug = params.stageSlug;
	}
}

export interface FinalizeContributionJobRenderDispatchErrorConstructorParams {
	jobId: string;
	contributionId: string;
	driverMessage: string;
}

export class FinalizeContributionJobRenderDispatchError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	readonly driverMessage: string;
	constructor(params: FinalizeContributionJobRenderDispatchErrorConstructorParams) {
		super(`jobId: ${params.jobId}, contributionId: ${params.contributionId}, driverMessage: ${params.driverMessage}`);
		this.name = "FinalizeContributionJobRenderDispatchError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
		this.driverMessage = params.driverMessage;
	}
}

export interface FinalizeContributionJobPromptLinkErrorConstructorParams {
	jobId: string;
	contributionId: string;
	promptResourceId: string;
	driverMessage: string;
}

export class FinalizeContributionJobPromptLinkError extends Error {
	readonly jobId: string;
	readonly contributionId: string;
	readonly promptResourceId: string;
	readonly driverMessage: string;
	constructor(params: FinalizeContributionJobPromptLinkErrorConstructorParams) {
		super(`jobId: ${params.jobId}, contributionId: ${params.contributionId}, promptResourceId: ${params.promptResourceId}, driverMessage: ${params.driverMessage}`);
		this.name = "FinalizeContributionJobPromptLinkError";
		this.jobId = params.jobId;
		this.contributionId = params.contributionId;
		this.promptResourceId = params.promptResourceId;
		this.driverMessage = params.driverMessage;
	}
}

export interface FinalizeContributionJobDocumentKeyErrorConstructorParams {
	jobId: string;
	notificationType: string;
}

export class FinalizeContributionJobDocumentKeyError extends Error {
	readonly jobId: string;
	readonly notificationType: string;
	constructor(params: FinalizeContributionJobDocumentKeyErrorConstructorParams) {
		super(`jobId: ${params.jobId}, notificationType: ${params.notificationType}`);
		this.name = "FinalizeContributionJobDocumentKeyError";
		this.jobId = params.jobId;
		this.notificationType = params.notificationType;
	}
}

export interface FinalizeContributionJobContinuationErrorConstructorParams {
	jobId: string;
	driverMessage: string;
}

export class FinalizeContributionJobContinuationError extends Error {
	readonly jobId: string;
	readonly driverMessage: string;
	constructor(params: FinalizeContributionJobContinuationErrorConstructorParams) {
		super(`jobId: ${params.jobId}, driverMessage: ${params.driverMessage}`);
		this.name = "FinalizeContributionJobContinuationError";
		this.jobId = params.jobId;
		this.driverMessage = params.driverMessage;
	}
}

export interface FinalizeContributionJobCompletionUpdateErrorConstructorParams {
	jobId: string;
	driverMessage: string;
}

export class FinalizeContributionJobCompletionUpdateError extends Error {
	readonly jobId: string;
	readonly driverMessage: string;
	constructor(params: FinalizeContributionJobCompletionUpdateErrorConstructorParams) {
		super(`jobId: ${params.jobId}, driverMessage: ${params.driverMessage}`);
		this.name = "FinalizeContributionJobCompletionUpdateError";
		this.jobId = params.jobId;
		this.driverMessage = params.driverMessage;
	}
}
