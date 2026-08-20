import { isRecord, isSupabaseClientShape } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticJobRow, isUnifiedAIResponse } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isSelectedAiProvider } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.guard.ts";
import type {
	SaveCompressedResponseDeps,
	SaveCompressedResponseParams,
	SaveCompressedResponseSuccessReturn,
	SaveCompressedResponseErrorReturn,
	SaveCompressedResponseRawJsonUploadErrorConstructorParams,
	SaveCompressedResponseJobUpdateErrorConstructorParams,
	SaveCompressedResponseExtractedUploadErrorConstructorParams,
} from "./saveCompressedResponse.interface.ts";
import {
	SaveCompressedResponseRawJsonUploadError,
	SaveCompressedResponseJobUpdateError,
	SaveCompressedResponseExtractedUploadError,
} from "./saveCompressedResponse.interface.ts";

// --- Deps (behavior type: presence-of-method only) ---

export function isSaveCompressedResponseDeps(
	value: unknown,
): value is SaveCompressedResponseDeps {
	if (!isRecord(value)) return false;
	if (!("fileManager" in value) || !isRecord(value.fileManager)) return false;
	if (!("uploadAndRegisterFile" in value.fileManager) || typeof value.fileManager.uploadAndRegisterFile !== "function") return false;
	if (!("buildUploadContext" in value) || typeof value.buildUploadContext !== "function") return false;
	if (!("enqueueRenderJob" in value) || typeof value.enqueueRenderJob !== "function") return false;
	return true;
}

// --- Params (data type: per-property with imported guards) ---

export function isSaveCompressedResponseParams(
	value: unknown,
): value is SaveCompressedResponseParams {
	if (!isRecord(value)) return false;
	if (!("dbClient" in value) || !isSupabaseClientShape(value.dbClient)) return false;
	if (!("job" in value) || !isDialecticJobRow(value.job)) return false;
	if (!("providerRow" in value) || !isSelectedAiProvider(value.providerRow)) return false;
	if (!("assembledResponse" in value) || !isUnifiedAIResponse(value.assembledResponse)) return false;
	if (!("preparedContentResult" in value) || !isPrepareResponseContentPreparedReturn(value.preparedContentResult)) return false;
	return true;
}

// --- SuccessReturn ---

export function isSaveCompressedResponseSuccessReturn(
	value: unknown,
): value is SaveCompressedResponseSuccessReturn {
	if (!isRecord(value)) return false;
	if (!("status" in value) || typeof value.status !== "string") return false;
	if (value.status !== "completed" && value.status !== "needs_continuation" && value.status !== "waiting_for_children") return false;
	return true;
}

// --- ErrorReturn ---

export function isSaveCompressedResponseErrorReturn(
	value: unknown,
): value is SaveCompressedResponseErrorReturn {
	if (!isRecord(value)) return false;
	if (!("error" in value) || !(value.error instanceof Error)) return false;
	if (!("retriable" in value) || typeof value.retriable !== "boolean") return false;
	return true;
}

// --- Owned error instanceof guards ---

export function isSaveCompressedResponseRawJsonUploadError(
	value: unknown,
): value is SaveCompressedResponseRawJsonUploadError {
	return value instanceof SaveCompressedResponseRawJsonUploadError;
}

export function isSaveCompressedResponseJobUpdateError(
	value: unknown,
): value is SaveCompressedResponseJobUpdateError {
	return value instanceof SaveCompressedResponseJobUpdateError;
}

export function isSaveCompressedResponseExtractedUploadError(
	value: unknown,
): value is SaveCompressedResponseExtractedUploadError {
	return value instanceof SaveCompressedResponseExtractedUploadError;
}

// --- Constructor-params guards ---

export function isSaveCompressedResponseRawJsonUploadErrorConstructorParams(
	value: unknown,
): value is SaveCompressedResponseRawJsonUploadErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!("jobId" in value) || typeof value.jobId !== "string" || value.jobId.length === 0) return false;
	if (!("driverMessage" in value) || typeof value.driverMessage !== "string" || value.driverMessage.length === 0) return false;
	return true;
}

export function isSaveCompressedResponseJobUpdateErrorConstructorParams(
	value: unknown,
): value is SaveCompressedResponseJobUpdateErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!("jobId" in value) || typeof value.jobId !== "string" || value.jobId.length === 0) return false;
	if (!("driverMessage" in value) || typeof value.driverMessage !== "string" || value.driverMessage.length === 0) return false;
	return true;
}

export function isSaveCompressedResponseExtractedUploadErrorConstructorParams(
	value: unknown,
): value is SaveCompressedResponseExtractedUploadErrorConstructorParams {
	if (!isRecord(value)) return false;
	if (!("jobId" in value) || typeof value.jobId !== "string" || value.jobId.length === 0) return false;
	if (!("driverMessage" in value) || typeof value.driverMessage !== "string" || value.driverMessage.length === 0) return false;
	return true;
}
