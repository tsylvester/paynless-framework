import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { IFileManager } from "../../_shared/types/file_manager.types.ts";
import type {
	AiProvidersRow,
	DialecticJobRow,
	UnifiedAIResponse,
} from "../../dialectic-service/dialectic.interface.ts";
import type { BuildUploadContextFn } from "../createJobContext/JobContext.interface.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import type { PrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.interface.ts";

export interface SaveCompressedResponseDeps {
	fileManager: IFileManager;
	buildUploadContext: BuildUploadContextFn;
	enqueueRenderJob: BoundEnqueueRenderJobFn;
}

export interface SaveCompressedResponseParams {
	dbClient: SupabaseClient<Database>;
	job: DialecticJobRow;
	providerRow: AiProvidersRow;
	assembledResponse: UnifiedAIResponse;
	preparedContentResult: PrepareResponseContentPreparedReturn;
}

export type SaveCompressedResponsePayload = DialecticCompressJobPayload;

export interface SaveCompressedResponseSuccessReturn {
	status: "completed" | "needs_continuation" | "waiting_for_children";
}

export type SaveCompressedResponseErrorReturn = {
	error: Error;
	retriable: boolean;
};

export type SaveCompressedResponseReturn =
	| SaveCompressedResponseSuccessReturn
	| SaveCompressedResponseErrorReturn;

export type SaveCompressedResponseFn = (
	deps: SaveCompressedResponseDeps,
	params: SaveCompressedResponseParams,
	payload: SaveCompressedResponsePayload,
) => Promise<SaveCompressedResponseReturn>;

export type BoundSaveCompressedResponseFn = (
	params: SaveCompressedResponseParams,
	payload: SaveCompressedResponsePayload,
) => Promise<SaveCompressedResponseReturn>;

export interface SaveCompressedResponseRawJsonUploadErrorConstructorParams {
	jobId: string;
	driverMessage: string;
}

export class SaveCompressedResponseRawJsonUploadError extends Error {
	readonly jobId: string;
	readonly driverMessage: string;
	constructor(params: SaveCompressedResponseRawJsonUploadErrorConstructorParams) {
		super(`jobId: ${params.jobId}, driverMessage: ${params.driverMessage}`);
		this.name = "SaveCompressedResponseRawJsonUploadError";
		this.jobId = params.jobId;
		this.driverMessage = params.driverMessage;
	}
}

export interface SaveCompressedResponseJobUpdateErrorConstructorParams {
	jobId: string;
	driverMessage: string;
}

export class SaveCompressedResponseJobUpdateError extends Error {
	readonly jobId: string;
	readonly driverMessage: string;
	constructor(params: SaveCompressedResponseJobUpdateErrorConstructorParams) {
		super(`jobId: ${params.jobId}, driverMessage: ${params.driverMessage}`);
		this.name = "SaveCompressedResponseJobUpdateError";
		this.jobId = params.jobId;
		this.driverMessage = params.driverMessage;
	}
}

export interface SaveCompressedResponseExtractedUploadErrorConstructorParams {
	jobId: string;
	driverMessage: string;
}

export class SaveCompressedResponseExtractedUploadError extends Error {
	readonly jobId: string;
	readonly driverMessage: string;
	constructor(params: SaveCompressedResponseExtractedUploadErrorConstructorParams) {
		super(`jobId: ${params.jobId}, driverMessage: ${params.driverMessage}`);
		this.name = "SaveCompressedResponseExtractedUploadError";
		this.jobId = params.jobId;
		this.driverMessage = params.driverMessage;
	}
}
