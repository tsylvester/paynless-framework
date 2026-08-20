import type {
	FinalizeContributionJobDeps,
	FinalizeContributionJobParams,
	FinalizeContributionJobPayload,
	FinalizeContributionJobFn,
	FinalizeContributionJobSuccessReturn,
} from "./finalizeContributionJob.interface.ts";
import {
	FinalizeContributionJobDocumentRelatedError,
	FinalizeContributionJobRenderDispatchError,
	FinalizeContributionJobPromptLinkError,
	FinalizeContributionJobDocumentKeyError,
	FinalizeContributionJobContinuationError,
	FinalizeContributionJobCompletionUpdateError,
} from "./finalizeContributionJob.interface.ts";
import type {
	EnqueueRenderJobParams,
	EnqueueRenderJobPayload,
} from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import type {
	ContinueJobParams,
	ContinueJobPayload,
} from "../continueJob/continueJob.interface.ts";
import type { ModelProcessingResult } from "../../dialectic-service/dialectic.interface.ts";
import type { DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import {
	isDocumentRelated,
	isDialecticStageSlug,
	isFileType,
} from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import {
	isDocumentRelationships,
	isContextForDocument,
	isContextForDocumentArray,
} from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isEnqueueRenderJobSuccessReturn } from "../enqueueRenderJob/enqueueRenderJob.guards.ts";

export const finalizeContributionJob: FinalizeContributionJobFn = async (
	deps,
	params,
	payload,
) => {
	const projectOwnerUserId: string = params.job.user_id;
	const fileType = payload.output_type;
	const needsContinuation: boolean = params.preparedContentResult.needsContinuation;
	const resolvedFinishReason = params.preparedContentResult.resolvedFinishReason;
	const isIntermediate: boolean = params.preparedContentResult.isIntermediate;

	// --- stageRelationshipForStage derivation ---

	// stageSlug is narrowed to DialecticStageSlug via isDialecticStageSlug.
	// The payload arrives already proven, but the payload type declares stageSlug
	// as DialecticStage["slug"] (string) — the narrowest application type is DialecticStageSlug.
	if (!payload.stageSlug) {
		return {
			error: new FinalizeContributionJobDocumentRelatedError({
				jobId: params.job.id,
				contributionId: params.contribution.id,
				stageSlug: "",
			}),
			retriable: false,
		};
	}
	if (!isDialecticStageSlug(payload.stageSlug)) {
		return {
			error: new FinalizeContributionJobDocumentRelatedError({
				jobId: params.job.id,
				contributionId: params.contribution.id,
				stageSlug: payload.stageSlug,
			}),
			retriable: false,
		};
	}
	const stageSlug: DialecticStageSlug = payload.stageSlug;

	// stageRelationshipForStage: find the entry keyed by stageSlug in document_relationships.
	// Use Object.entries to avoid indexing DocumentRelationships with a non-RelationshipRole key.
	let stageRelationshipForStage = undefined;
	if (isDocumentRelationships(params.contribution.document_relationships)) {
		const found = Object.entries(params.contribution.document_relationships).find(([key]) => key === stageSlug);
		const relVal = found?.[1];
		if (typeof relVal === "string" && relVal.trim() !== "") {
			stageRelationshipForStage = relVal;
		}
	}

	// --- document-related check ---

	if (
		isDocumentRelated(fileType) &&
		(typeof stageRelationshipForStage !== "string" || stageRelationshipForStage.trim() === "")
	) {
		return {
			error: new FinalizeContributionJobDocumentRelatedError({
				jobId: params.job.id,
				contributionId: params.contribution.id,
				stageSlug,
			}),
			retriable: false,
		};
	}

	// --- RENDER dispatch (condition: !needsContinuation) ---

	let shouldRender = false;

	if (!needsContinuation) {
		const userJwt = payload.user_jwt;
		if (userJwt.trim() === "") {
			deps.logger.warn(
				"[finalizeContributionJob] user_jwt missing from job payload; skipping render dispatch",
				{ jobId: params.job.id },
			);
		} else {
			// stageSlug is already narrowed to DialecticStageSlug above
			let renderDocumentKey = undefined;
			if (isFileType(payload.document_key)) {
				renderDocumentKey = payload.document_key;
			}
			const renderParams: EnqueueRenderJobParams = {
				jobId: params.job.id,
				sessionId: payload.sessionId,
				stageSlug,
				iterationNumber: payload.iterationNumber ?? 0,
				outputType: fileType,
				projectId: payload.projectId,
				projectOwnerUserId,
				userAuthToken: userJwt,
				modelId: payload.model_id,
				walletId: payload.walletId,
				isTestJob: params.job.is_test_job === true,
			};
			const renderPayload: EnqueueRenderJobPayload = {
				contributionId: params.contribution.id,
				needsContinuation,
				documentKey: renderDocumentKey,
				stageRelationshipForStage,
				fileType,
				storageFileType: params.storageFileType,
			};
			const renderResult = await deps.enqueueRenderJob(renderParams, renderPayload);
			if (isEnqueueRenderJobSuccessReturn(renderResult)) {
				shouldRender = renderResult.renderJobId !== null;
			} else {
				return {
					error: new FinalizeContributionJobRenderDispatchError({
						jobId: params.job.id,
						contributionId: params.contribution.id,
						driverMessage: renderResult.error.message,
					}),
					retriable: false,
				};
			}
		}
	}

	// --- prompt-resource back-link ---

	const sourcePromptResourceId = payload.source_prompt_resource_id;
	if (sourcePromptResourceId !== undefined && sourcePromptResourceId !== null && sourcePromptResourceId.trim().length > 0) {
		const { error: promptLinkUpdateError } = await params.dbClient
			.from("dialectic_project_resources")
			.update({ source_contribution_id: params.contribution.id })
			.eq("id", sourcePromptResourceId);

		if (promptLinkUpdateError) {
			return {
				error: new FinalizeContributionJobPromptLinkError({
					jobId: params.job.id,
					contributionId: params.contribution.id,
					promptResourceId: sourcePromptResourceId,
					driverMessage: promptLinkUpdateError.message,
				}),
				retriable: true,
			};
		}
	}

	// --- chunk-completed notification (condition: isContinuationForStorage) ---

	if (projectOwnerUserId !== "" && params.isContinuationForStorage && isDocumentRelated(fileType)) {
		if (!isFileType(payload.document_key)) {
			return {
				error: new FinalizeContributionJobDocumentKeyError({
					jobId: params.job.id,
					notificationType: "execute_chunk_completed",
				}),
				retriable: false,
			};
		}
		const documentKeyStr: string = payload.document_key;
		await deps.notificationService.sendJobNotificationEvent({
			type: "execute_chunk_completed",
			sessionId: payload.sessionId,
			stageSlug,
			iterationNumber: payload.iterationNumber ?? 0,
			job_id: params.job.id,
			step_key: documentKeyStr,
			modelId: payload.model_id,
			document_key: documentKeyStr,
		}, projectOwnerUserId);
	}

	// --- ModelProcessingResult construction ---

	const modelProcessingResult: ModelProcessingResult = {
		modelId: payload.model_id,
		status: needsContinuation ? "needs_continuation" : "completed",
		attempts: params.job.attempt_count + 1,
		contributionId: params.contribution.id,
	};

	// --- continuation path (condition: needsContinuation) ---

	if (needsContinuation) {
		deps.logger.info(
			`[finalizeContributionJob] DIAGNOSTIC: Preparing to check for continuation for job ${params.job.id}.`,
			{
				finish_reason: params.assembledResponse.finish_reason,
				payload_continuation_count: payload.continuation_count,
				continueUntilComplete: payload.continueUntilComplete,
			},
		);

		const continueJobParams: ContinueJobParams = {
			dbClient: params.dbClient,
			projectOwnerUserId,
		};
		const continueJobPayload: ContinueJobPayload = {
			job: params.job,
			savedOutput: params.contribution,
		};
		const continueResult = await deps.continueJob(continueJobParams, continueJobPayload);

		if ("error" in continueResult) {
			return {
				error: new FinalizeContributionJobContinuationError({
					jobId: params.job.id,
					driverMessage: continueResult.error.message,
				}),
				retriable: true,
			};
		}

		if (
			continueResult.enqueued === false &&
			continueResult.reason === "continuation_limit_reached"
		) {
			modelProcessingResult.status = "continuation_limit_reached";

			// rootIdForCapAssembly: find the entry keyed by stageSlug.
			let rootIdForCapAssembly = undefined;
			if (isDocumentRelationships(params.contribution.document_relationships)) {
				const found = Object.entries(params.contribution.document_relationships).find(([key]) => key === stageSlug);
				const capCandidate = found?.[1];
				if (typeof capCandidate === "string" && capCandidate.trim() !== "") {
					rootIdForCapAssembly = capCandidate;
				}
			}

			// matchedContextForCap: find the context entry whose document_key matches.
			let matchedContextForCap = undefined;
			if (isContextForDocumentArray(payload.context_for_documents) && isFileType(payload.document_key)) {
				const payloadDocKeyCap = payload.document_key;
				for (let capIdx = 0; capIdx < payload.context_for_documents.length; capIdx++) {
					const capDoc = payload.context_for_documents[capIdx];
					if (isContextForDocument(capDoc) && capDoc.document_key === payloadDocKeyCap) {
						matchedContextForCap = capDoc;
						break;
					}
				}
			}

			if (
				rootIdForCapAssembly !== undefined &&
				rootIdForCapAssembly !== params.contribution.id &&
				!shouldRender
			) {
				await deps.fileManager.assembleAndSaveFinalDocument(
					rootIdForCapAssembly,
					matchedContextForCap,
				);
			}
		}

		if (projectOwnerUserId !== "") {
			const continuationNumber: number = (payload.continuation_count ?? 0) + 1;
			await deps.notificationService.sendContributionGenerationContinuedEvent({
				type: "contribution_generation_continued",
				sessionId: payload.sessionId,
				contribution: params.contribution,
				projectId: payload.projectId,
				modelId: payload.model_id,
				continuationNumber,
				job_id: params.job.id,
			}, projectOwnerUserId);
		}
	}

	// --- final-chunk path (condition: resolvedFinishReason === 'stop') ---

	const isFinalChunk: boolean = resolvedFinishReason === "stop";

	if (isFinalChunk) {
		if (projectOwnerUserId !== "" && isDocumentRelated(fileType)) {
			if (!isFileType(payload.document_key)) {
				return {
					error: new FinalizeContributionJobDocumentKeyError({
						jobId: params.job.id,
						notificationType: "execute_chunk_completed",
					}),
					retriable: false,
				};
			}
			const documentKeyStr: string = payload.document_key;
			await deps.notificationService.sendJobNotificationEvent({
				type: "execute_chunk_completed",
				sessionId: payload.sessionId,
				stageSlug,
				iterationNumber: payload.iterationNumber ?? 0,
				job_id: params.job.id,
				step_key: documentKeyStr,
				modelId: payload.model_id,
				document_key: documentKeyStr,
			}, projectOwnerUserId);
		}

		// rootIdFromSaved: find the entry keyed by stageSlug.
		let rootIdFromSaved = undefined;
		if (isDocumentRelationships(params.contribution.document_relationships)) {
			const found = Object.entries(params.contribution.document_relationships).find(([key]) => key === stageSlug);
			const candidateUnknown = found?.[1];
			if (typeof candidateUnknown === "string" && candidateUnknown.trim() !== "") {
				rootIdFromSaved = candidateUnknown;
			}
		}
		if (rootIdFromSaved !== undefined && rootIdFromSaved !== params.contribution.id && !shouldRender) {
			await deps.fileManager.assembleAndSaveFinalDocument(rootIdFromSaved);
		}
	}

	// --- job-completion update ---

	const { error: finalUpdateError } = await params.dbClient
		.from("dialectic_generation_jobs")
		.update({
			status: "completed",
			results: JSON.stringify({ modelProcessingResult }),
			completed_at: new Date().toISOString(),
			attempt_count: params.job.attempt_count + 1,
		})
		.eq("id", params.job.id);

	if (finalUpdateError) {
		return {
			error: new FinalizeContributionJobCompletionUpdateError({
				jobId: params.job.id,
				driverMessage: finalUpdateError.message,
			}),
			retriable: false,
		};
	}

	// --- completion notifications (condition: !needsContinuation) ---

	if (!needsContinuation) {
		if (projectOwnerUserId !== "") {
			await deps.notificationService.sendContributionReceivedEvent({
				contribution: params.contribution,
				type: "dialectic_contribution_received",
				sessionId: payload.sessionId,
				job_id: params.job.id,
				is_continuing: false,
			}, projectOwnerUserId);
			await deps.notificationService.sendContributionGenerationCompleteEvent({
				type: "contribution_generation_complete",
				sessionId: payload.sessionId,
				projectId: payload.projectId,
				job_id: params.job.id,
			}, projectOwnerUserId);

			if (!isIntermediate && isDocumentRelated(fileType)) {
				if (!isFileType(payload.document_key)) {
					return {
						error: new FinalizeContributionJobDocumentKeyError({
							jobId: params.job.id,
							notificationType: "execute_completed",
						}),
						retriable: false,
					};
				}
				const documentKeyStr: string = payload.document_key;
				await deps.notificationService.sendJobNotificationEvent({
					type: "execute_completed",
					sessionId: payload.sessionId,
					stageSlug,
					iterationNumber: payload.iterationNumber ?? 0,
					job_id: params.job.id,
					step_key: documentKeyStr,
					modelId: payload.model_id,
					document_key: documentKeyStr,
				}, projectOwnerUserId);
			}
		}
	}

	// --- success status derivation ---

	if (!needsContinuation) {
		const success: FinalizeContributionJobSuccessReturn = { status: "completed" };
		return success;
	}
	if (modelProcessingResult.status === "continuation_limit_reached") {
		const success: FinalizeContributionJobSuccessReturn = { status: "continuation_limit_reached" };
		return success;
	}
	const success: FinalizeContributionJobSuccessReturn = { status: "needs_continuation" };
	return success;
};
