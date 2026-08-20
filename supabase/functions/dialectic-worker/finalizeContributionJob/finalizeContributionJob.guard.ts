import type {
	FinalizeContributionJobDeps,
	FinalizeContributionJobParams,
	FinalizeContributionJobPayload,
	FinalizeContributionJobSuccessReturn,
	FinalizeContributionJobErrorReturn,
} from "./finalizeContributionJob.interface.ts";
import {
	FinalizeContributionJobDocumentRelatedError,
	FinalizeContributionJobRenderDispatchError,
	FinalizeContributionJobPromptLinkError,
	FinalizeContributionJobDocumentKeyError,
	FinalizeContributionJobContinuationError,
	FinalizeContributionJobCompletionUpdateError,
} from "./finalizeContributionJob.interface.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isFileType } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import {
	isDialecticContribution,
	isDialecticExecuteJobPayload,
	isDialecticJobRow,
} from "../../_shared/utils/type-guards/type_guards.dialectic.ts";

// --- Deps (behavior type: presence of each member only) ---

export function isFinalizeContributionJobDeps(
	value: unknown,
): value is FinalizeContributionJobDeps {
	if (!isRecord(value)) return false;
	if (!("logger" in value) || typeof value.logger !== "object" || value.logger === null) return false;
	if (!("notificationService" in value) || typeof value.notificationService !== "object" || value.notificationService === null) return false;
	if (!("fileManager" in value) || typeof value.fileManager !== "object" || value.fileManager === null) return false;
	if (!("continueJob" in value) || typeof value.continueJob !== "function") return false;
	if (!("enqueueRenderJob" in value) || typeof value.enqueueRenderJob !== "function") return false;
	return true;
}

// --- Params ---

export function isFinalizeContributionJobParams(
	value: unknown,
): value is FinalizeContributionJobParams {
	if (!isRecord(value)) return false;
	// dbClient is a vendor SupabaseClient<Database> this repo does not own; presence + record only.
	if (!("dbClient" in value) || !isRecord(value.dbClient)) return false;
	if (!("job" in value) || !isDialecticJobRow(value.job)) return false;
	if (!("contribution" in value) || !isDialecticContribution(value.contribution)) return false;
	if (!("assembledResponse" in value) || !isRecord(value.assembledResponse)) return false;
	if (!("preparedContentResult" in value) || !isRecord(value.preparedContentResult)) return false;
	if (!("storageFileType" in value) || !isFileType(value.storageFileType)) return false;
	if (!("isContinuationForStorage" in value) || typeof value.isContinuationForStorage !== "boolean") return false;
	return true;
}

// --- Payload (wraps the throwing arm guard, keeping a boolean contract) ---

export function isFinalizeContributionJobPayload(
	value: unknown,
): value is FinalizeContributionJobPayload {
	try {
		if (!isDialecticExecuteJobPayload(value)) return false;
	} catch {
		return false;
	}
	return true;
}

// --- SuccessReturn ---

export function isFinalizeContributionJobSuccessReturn(
	value: unknown,
): value is FinalizeContributionJobSuccessReturn {
	if (!isRecord(value)) return false;
	if (!("status" in value) || typeof value.status !== "string") return false;
	const status: unknown = value.status;
	if (
		status !== "completed" &&
		status !== "needs_continuation" &&
		status !== "continuation_limit_reached"
	) {
		return false;
	}
	// Arms are mutually exclusive: the error arm carries `error` and `retriable`.
	if ("error" in value || "retriable" in value) return false;
	return true;
}

// --- ErrorReturn ---

export function isFinalizeContributionJobErrorReturn(
	value: unknown,
): value is FinalizeContributionJobErrorReturn {
	if (!isRecord(value)) return false;
	if (!("error" in value) || !(value.error instanceof Error)) return false;
	if (!("retriable" in value) || typeof value.retriable !== "boolean") return false;
	// Arms are mutually exclusive: the success arm carries `status`.
	if ("status" in value) return false;
	return true;
}

// --- Owned error instanceof guards ---

export function isFinalizeContributionJobDocumentRelatedError(
	value: unknown,
): value is FinalizeContributionJobDocumentRelatedError {
	return value instanceof FinalizeContributionJobDocumentRelatedError;
}

export function isFinalizeContributionJobRenderDispatchError(
	value: unknown,
): value is FinalizeContributionJobRenderDispatchError {
	return value instanceof FinalizeContributionJobRenderDispatchError;
}

export function isFinalizeContributionJobPromptLinkError(
	value: unknown,
): value is FinalizeContributionJobPromptLinkError {
	return value instanceof FinalizeContributionJobPromptLinkError;
}

export function isFinalizeContributionJobDocumentKeyError(
	value: unknown,
): value is FinalizeContributionJobDocumentKeyError {
	return value instanceof FinalizeContributionJobDocumentKeyError;
}

export function isFinalizeContributionJobContinuationError(
	value: unknown,
): value is FinalizeContributionJobContinuationError {
	return value instanceof FinalizeContributionJobContinuationError;
}

export function isFinalizeContributionJobCompletionUpdateError(
	value: unknown,
): value is FinalizeContributionJobCompletionUpdateError {
	return value instanceof FinalizeContributionJobCompletionUpdateError;
}
