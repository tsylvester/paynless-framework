import type {
	SaveContributionResponseFn,
} from "./saveContributionResponse.interface.ts";
import {
	SaveContributionResponseBuildContextError,
	SaveContributionResponseUploadError,
	SaveContributionResponseContributionRecordError,
} from "./saveContributionResponse.interface.ts";
import type { BuildUploadContextParams } from "../../_shared/utils/buildUploadContext/buildUploadContext.interface.ts";
import type { ModelContributionUploadContext } from "../../_shared/types/file_manager.types.ts";
import type { ResolveContributionIdentityParams } from "../resolveContributionIdentity/resolveContributionIdentity.interface.ts";
import type { PersistContributionRelationshipsParams } from "../persistContributionRelationships/persistContributionRelationships.interface.ts";
import type { FinalizeContributionJobParams } from "../finalizeContributionJob/finalizeContributionJob.interface.ts";
import {
	isModelContributionContext,
	isFileType,
} from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isDialecticContribution } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";

export const saveContributionResponse: SaveContributionResponseFn = async (
	deps,
	params,
	payload,
) => {
	// --- identity resolution ---

	const identityParams: ResolveContributionIdentityParams = {
		dbClient: params.dbClient,
		job: params.job,
		providerRow: params.providerRow,
		aiResponse: params.assembledResponse,
	};
	const identityResult = await deps.resolveContributionIdentity(identityParams, payload);
	if ("error" in identityResult) {
		return identityResult;
	}

	// --- contributionType extraction ---

	const contributionType = payload.canonicalPathParams.contributionType;

	// --- buildUploadContext param assembly ---

	if (!isFileType(payload.document_key)) {
		return {
			error: new SaveContributionResponseBuildContextError({ jobId: params.job.id }),
			retriable: false,
		};
	}
	const documentKey = payload.document_key;

	if (typeof payload.iterationNumber !== "number") {
		return {
			error: new SaveContributionResponseBuildContextError({ jobId: params.job.id }),
			retriable: false,
		};
	}
	const iterationNumber = payload.iterationNumber;

	if (typeof params.job.user_id !== "string") {
		return {
			error: new SaveContributionResponseBuildContextError({ jobId: params.job.id }),
			retriable: false,
		};
	}
	const projectOwnerUserId = params.job.user_id;

	const buildUploadContextParams: BuildUploadContextParams = {
		projectId: payload.projectId,
		storageFileType: identityResult.storageFileType,
		sessionId: payload.sessionId,
		iterationNumber,
		modelSlug: params.providerRow.api_identifier,
		attemptCount: params.job.attempt_count,
		restOfCanonicalPathParams: identityResult.restOfCanonicalPathParams,
		documentKey,
		contributionType,
		isContinuationForStorage: identityResult.isContinuationForStorage,
		continuationCount: payload.continuation_count,
		sourceGroupFragment: identityResult.sourceGroupFragment,
		contentForStorage: params.preparedContentResult.contentForStorage,
		projectOwnerUserId,
		description: identityResult.description,
		providerDetails: { id: params.providerRow.id, name: params.providerRow.name },
		aiResponse: {
			inputTokens: params.assembledResponse.inputTokens,
			outputTokens: params.assembledResponse.outputTokens,
			processingTimeMs: params.assembledResponse.processingTimeMs,
		},
		sourcePromptResourceId: payload.source_prompt_resource_id,
		targetContributionId: identityResult.targetContributionId,
		documentRelationships: payload.document_relationships ?? null,
		isIntermediate: payload.isIntermediate,
	};

	// --- isModelContributionContext guard ---

	const builtContext = deps.buildUploadContext(buildUploadContextParams);
	if (!isModelContributionContext(builtContext)) {
		return {
			error: new SaveContributionResponseBuildContextError({ jobId: params.job.id }),
			retriable: false,
		};
	}
	const uploadContext: ModelContributionUploadContext = builtContext;

	// --- upload ---

	const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);
	if (savedResult.error) {
		return {
			error: new SaveContributionResponseUploadError({
				jobId: params.job.id,
				driverMessage: savedResult.error.message,
			}),
			retriable: false,
		};
	}

	// --- isDialecticContribution guard ---

	if (!isDialecticContribution(savedResult.record)) {
		return {
			error: new SaveContributionResponseContributionRecordError({ jobId: params.job.id }),
			retriable: false,
		};
	}
	const savedContribution = savedResult.record;

	// --- relationship persistence ---

	const persistParams: PersistContributionRelationshipsParams = {
		dbClient: params.dbClient,
		job: params.job,
		contribution: savedContribution,
		isContinuationForStorage: identityResult.isContinuationForStorage,
	};
	const persistResult = await deps.persistContributionRelationships(persistParams, payload);
	if ("error" in persistResult) {
		return persistResult;
	}

	// --- finalization ---

	const finalizeParams: FinalizeContributionJobParams = {
		dbClient: params.dbClient,
		job: params.job,
		contribution: persistResult.contribution,
		assembledResponse: params.assembledResponse,
		preparedContentResult: params.preparedContentResult,
		storageFileType: identityResult.storageFileType,
		isContinuationForStorage: identityResult.isContinuationForStorage,
	};
	const finalizeResult = await deps.finalizeContributionJob(finalizeParams, payload);
	if ("error" in finalizeResult) {
		return finalizeResult;
	}

	// --- success ---

	return { status: finalizeResult.status };
};
