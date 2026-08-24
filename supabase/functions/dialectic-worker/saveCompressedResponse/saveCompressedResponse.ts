import type {
	SaveCompressedResponseFn,
} from "./saveCompressedResponse.interface.ts";
import {
	SaveCompressedResponseRawJsonUploadError,
	SaveCompressedResponseJobUpdateError,
	SaveCompressedResponseExtractedUploadError,
} from "./saveCompressedResponse.interface.ts";
import type { BuildUploadContextResourceParams } from "../../_shared/utils/buildUploadContext/buildUploadContext.interface.ts";
import type { EnqueueRenderJobParams, EnqueueRenderCompressedContextPayload } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import {
	isFileType,
	isModelContributionFileType,
	isDialecticStageSlug,
} from "../../_shared/utils/type-guards/type_guards.file_manager.ts";

export const saveCompressedResponse: SaveCompressedResponseFn = async (
	deps,
	params,
	payload,
) => {
	// --- continuation gate ---

	if (params.preparedContentResult.shouldContinue === true) {
		return { status: "needs_continuation" };
	}

	// --- CompressedContextRawJson resource params assembly ---

	const rawJsonResourceParams: BuildUploadContextResourceParams = {
		projectId: payload.projectId,
		storageFileType: FileType.CompressedContextRawJson,
		sessionId: payload.sessionId,
		iterationNumber: payload.iterationNumber,
		stageSlug: payload.stageSlug,
		output_type: payload.output_type,
		sourceType: payload.sourceType,
		documentKey: payload.documentKey,
		sourceId: payload.sourceId,
		role: payload.role,
		chunkIndex: payload.chunk_index,
		chunkTotal: payload.chunk_total,
		contentForStorage: params.preparedContentResult.contentForStorage,
		projectOwnerUserId: params.job.user_id,
		description: `CompressedContextRawJson artifact for ${payload.output_type} (${payload.sourceType})`,
		sourcePromptResourceId: payload.source_prompt_resource_id,
	};

	// --- buildUploadContext + uploadAndRegisterFile (raw JSON) ---

	const rawJsonContext = deps.buildUploadContext(rawJsonResourceParams);
	const rawJsonResult = await deps.fileManager.uploadAndRegisterFile(rawJsonContext);
	if (rawJsonResult.error) {
		return {
			error: new SaveCompressedResponseRawJsonUploadError({
				jobId: params.job.id,
				driverMessage: rawJsonResult.error.message,
			}),
			retriable: false,
		};
	}

	// --- mode branch ---

	if (payload.mode === "json") {
		// --- json mode requires documentKey, docType, and sourceStageSlug ---

		if (
			!isFileType(payload.documentKey) ||
			!isModelContributionFileType(payload.docType) ||
			!isDialecticStageSlug(payload.sourceStageSlug)
		) {
			return {
				error: new Error(
					`mode:'json' requires documentKey, docType, and sourceStageSlug.`,
				),
				retriable: false,
			};
		}

		// --- render params assembly ---

		const renderParams: EnqueueRenderJobParams = {
			jobId: params.job.id,
			sessionId: payload.sessionId,
			stageSlug: payload.stageSlug,
			iterationNumber: payload.iterationNumber,
			outputType: payload.output_type,
			projectId: payload.projectId,
			projectOwnerUserId: params.job.user_id,
			userAuthToken: payload.user_jwt,
			modelId: params.providerRow.id,
			walletId: payload.walletId,
			isTestJob: params.job.is_test_job,
		};

		const renderPayload: EnqueueRenderCompressedContextPayload = {
			sourceType: payload.sourceType,
			documentKey: payload.documentKey,
			docType: payload.docType,
			sourceStageSlug: payload.sourceStageSlug,
			output_type: payload.output_type,
		};

		// --- enqueueRenderJob ---

		const renderResult = await deps.enqueueRenderJob(renderParams, renderPayload);
		if ("error" in renderResult) {
			return renderResult;
		}

		// --- waiting_for_children DB update ---

		const { error: updateError } = await params.dbClient
			.from("dialectic_generation_jobs")
			.update({ status: "waiting_for_children" })
			.eq("id", params.job.id);

		if (updateError) {
			return {
				error: new SaveCompressedResponseJobUpdateError({
					jobId: params.job.id,
					driverMessage: updateError.message,
				}),
				retriable: true,
			};
		}

		return { status: "waiting_for_children" };
	}

	// --- text mode: CompressedContext resource params assembly ---

	const extractedResourceParams: BuildUploadContextResourceParams = {
		projectId: payload.projectId,
		storageFileType: FileType.CompressedContext,
		sessionId: payload.sessionId,
		iterationNumber: payload.iterationNumber,
		stageSlug: payload.stageSlug,
		output_type: payload.output_type,
		sourceType: payload.sourceType,
		documentKey: payload.documentKey,
		sourceId: payload.sourceId,
		role: payload.role,
		chunkIndex: payload.chunk_index,
		chunkTotal: payload.chunk_total,
		contentForStorage: params.preparedContentResult.contentForStorage,
		projectOwnerUserId: params.job.user_id,
		description: `CompressedContext artifact for ${payload.output_type} (${payload.sourceType})`,
		sourcePromptResourceId: payload.source_prompt_resource_id,
	};

	// --- buildUploadContext + uploadAndRegisterFile (CompressedContext) ---

	const extractedContext = deps.buildUploadContext(extractedResourceParams);
	const extractedResult = await deps.fileManager.uploadAndRegisterFile(extractedContext);
	if (extractedResult.error) {
		return {
			error: new SaveCompressedResponseExtractedUploadError({
				jobId: params.job.id,
				driverMessage: extractedResult.error.message,
			}),
			retriable: false,
		};
	}

	return { status: "completed" };
};
