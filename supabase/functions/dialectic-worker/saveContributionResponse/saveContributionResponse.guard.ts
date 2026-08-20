import { isRecord, isSupabaseClientShape } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticJobRow, isUnifiedAIResponse } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isSelectedAiProvider, isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.guard.ts";
import type {
	SaveContributionResponseDeps,
	SaveContributionResponseParams,
	SaveContributionResponseSuccessReturn,
	SaveContributionResponseErrorReturn,
	SaveContributionResponseBuildContextErrorConstructorParams,
	SaveContributionResponseUploadErrorConstructorParams,
	SaveContributionResponseContributionRecordErrorConstructorParams,
} from "./saveContributionResponse.interface.ts";
import {
	SaveContributionResponseBuildContextError,
	SaveContributionResponseUploadError,
	SaveContributionResponseContributionRecordError,
} from "./saveContributionResponse.interface.ts";

// --- Deps (behavior type: presence-of-method only) ---

export function isSaveContributionResponseDeps(
	value: unknown,
): value is SaveContributionResponseDeps {
	if (!isRecord(value)) return false;
	if (!("fileManager" in value) || !isRecord(value.fileManager)) return false;
	if (!("uploadAndRegisterFile" in value.fileManager) || typeof value.fileManager.uploadAndRegisterFile !== "function") return false;
	if (!("buildUploadContext" in value) || typeof value.buildUploadContext !== "function") return false;
	if (!("resolveContributionIdentity" in value) || typeof value.resolveContributionIdentity !== "function") return false;
	if (!("persistContributionRelationships" in value) || typeof value.persistContributionRelationships !== "function") return false;
	if (!("finalizeContributionJob" in value) || typeof value.finalizeContributionJob !== "function") return false;
	return true;
}

// --- Params (data type: per-property with imported guards) ---

export function isSaveContributionResponseParams(
	value: unknown,
): value is SaveContributionResponseParams {
	if (!isRecord(value)) return false;
	if (!("dbClient" in value) || !isSupabaseClientShape(value.dbClient)) return false;
	if (!("job" in value) || !isDialecticJobRow(value.job)) return false;
	if (!("providerRow" in value) || !isSelectedAiProvider(value.providerRow)) return false;
	if (!("modelConfig" in value) || !isAiModelExtendedConfig(value.modelConfig)) return false;
	if (!("assembledResponse" in value) || !isUnifiedAIResponse(value.assembledResponse)) return false;
	if (!("preparedContentResult" in value) || !isPrepareResponseContentPreparedReturn(value.preparedContentResult)) return false;
	return true;
}

// --- SuccessReturn ---

export function isSaveContributionResponseSuccessReturn(
	value: unknown,
): value is SaveContributionResponseSuccessReturn {
	if (!isRecord(value)) return false;
	if (!("status" in value) || typeof value.status !== "string") return false;
	if (value.status !== "completed" && value.status !== "needs_continuation" && value.status !== "continuation_limit_reached") return false;
	return true;
}

// --- ErrorReturn ---

export function isSaveContributionResponseErrorReturn(
	value: unknown,
): value is SaveContributionResponseErrorReturn {
	if (!isRecord(value)) return false;
	if (!("error" in value) || !(value.error instanceof Error)) return false;
	if (!("retriable" in value) || typeof value.retriable !== "boolean") return false;
	return true;
}

// --- Owned error instanceof guards ---

export function isSaveContributionResponseBuildContextError(
	value: unknown,
): value is SaveContributionResponseBuildContextError {
	return value instanceof SaveContributionResponseBuildContextError;
}

export function isSaveContributionResponseUploadError(
	value: unknown,
): value is SaveContributionResponseUploadError {
	return value instanceof SaveContributionResponseUploadError;
}

export function isSaveContributionResponseContributionRecordError(
	value: unknown,
): value is SaveContributionResponseContributionRecordError {
	return value instanceof SaveContributionResponseContributionRecordError;
}

// --- Constructor-params guards ---

export function isSaveContributionResponseBuildContextErrorConstructorParams(
	value: unknown,
): value is SaveContributionResponseBuildContextErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!("jobId" in value) || typeof value.jobId !== "string" || value.jobId.length === 0) return false;
	return true;
}

export function isSaveContributionResponseUploadErrorConstructorParams(
	value: unknown,
): value is SaveContributionResponseUploadErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!("jobId" in value) || typeof value.jobId !== "string" || value.jobId.length === 0) return false;
	if (!("driverMessage" in value) || typeof value.driverMessage !== "string" || value.driverMessage.length === 0) return false;
	return true;
}

export function isSaveContributionResponseContributionRecordErrorConstructorParams(
	value: unknown,
): value is SaveContributionResponseContributionRecordErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!("jobId" in value) || typeof value.jobId !== "string" || value.jobId.length === 0) return false;
	return true;
}
