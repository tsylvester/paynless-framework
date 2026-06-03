import { isRecord, isPostgrestError } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isServiceError } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import type { FileManagerError } from "../../_shared/types/file_manager.types.ts";
import type { ServiceError } from "../../_shared/types.ts";
import type {
	GetStageExpectedCountsErrorReturn,
	GetStageExpectedCountsParams,
	GetStageExpectedCountsPayload,
	GetStageExpectedCountsResponse,
	GetStageExpectedCountsResult,
	GetStageExpectedCountsSuccessReturn,
	StageExpectedCount,
} from "./getStageExpectedCounts.interface.ts";

export function isGetStageExpectedCountsPayload(
	value: unknown,
): value is GetStageExpectedCountsPayload {
	if (!isRecord(value)) {
		return false;
	}
	if (typeof value.processTemplateId !== "string" || value.processTemplateId.length === 0) {
		return false;
	}
	if (
		typeof value.modelCount !== "number"
		|| !Number.isInteger(value.modelCount)
		|| !Number.isFinite(value.modelCount)
		|| value.modelCount <= 0
	) {
		return false;
	}
	return true;
}

export function isGetStageExpectedCountsParams(
	value: unknown,
): value is GetStageExpectedCountsParams {
	if (!isRecord(value)) {
		return false;
	}
	if (Object.keys(value).length !== 0) {
		return false;
	}
	return true;
}

export function isStageExpectedCount(value: unknown): value is StageExpectedCount {
	if (!isRecord(value)) {
		return false;
	}
	if (typeof value.stageSlug !== "string" || value.stageSlug.length === 0) {
		return false;
	}
	if (
		typeof value.expectedCount !== "number"
		|| !Number.isInteger(value.expectedCount)
		|| !Number.isFinite(value.expectedCount)
		|| value.expectedCount < 0
	) {
		return false;
	}
	return true;
}

export function isGetStageExpectedCountsResponse(
	value: unknown,
): value is GetStageExpectedCountsResponse {
	if (!isRecord(value)) {
		return false;
	}
	if (!Array.isArray(value.stages)) {
		return false;
	}
	for (const stage of value.stages) {
		if (!isStageExpectedCount(stage)) {
			return false;
		}
	}
	if (
		typeof value.totalStages !== "number"
		|| !Number.isInteger(value.totalStages)
		|| !Number.isFinite(value.totalStages)
		|| value.totalStages < 0
	) {
		return false;
	}
	return true;
}

export function isGetStageExpectedCountsSuccessReturn(
	value: unknown,
): value is GetStageExpectedCountsSuccessReturn {
	if (!isRecord(value)) {
		return false;
	}
	if (value.status !== 200) {
		return false;
	}
	if ("error" in value && value.error !== undefined) {
		return false;
	}
	if (!("data" in value) || value.data === undefined) {
		return false;
	}
	if (!isGetStageExpectedCountsResponse(value.data)) {
		return false;
	}
	return true;
}

export function isGetStageExpectedCountsErrorReturn(
	value: unknown,
): value is GetStageExpectedCountsErrorReturn {
	if (!isRecord(value)) {
		return false;
	}
	if ("data" in value && value.data !== undefined) {
		return false;
	}
	if (typeof value.status !== "number" || !Number.isFinite(value.status)) {
		return false;
	}
	if (!("error" in value) || value.error === undefined) {
		return false;
	}
	if (!isRecord(value.error)) {
		return false;
	}
	if (isPostgrestError(value.error)) {
		return false;
	}
	const message: string = typeof value.error.message === "string" ? value.error.message : "";
	if (message.length === 0) {
		return false;
	}
	const serviceError: ServiceError = { message };
	if ("status" in value.error && value.error.status !== undefined) {
		if (typeof value.error.status !== "number") {
			return false;
		}
		serviceError.status = value.error.status;
	}
	if ("details" in value.error && value.error.details !== undefined) {
		const details: unknown = value.error.details;
		if (typeof details === "string") {
			serviceError.details = details;
		} else if (Array.isArray(details)) {
			serviceError.details = details;
		} else {
			return false;
		}
	}
	if ("code" in value.error && value.error.code !== undefined) {
		if (typeof value.error.code !== "string") {
			return false;
		}
		serviceError.code = value.error.code;
	}
	const fileManagerError: FileManagerError = serviceError;
	if (!isServiceError(fileManagerError)) {
		return false;
	}
	return true;
}

export function isGetStageExpectedCountsResult(
	value: unknown,
): value is GetStageExpectedCountsResult {
	if (!isRecord(value)) {
		return false;
	}
	const hasError: boolean = "error" in value && value.error !== undefined;
	const hasData: boolean = "data" in value && value.data !== undefined;
	if (hasError && hasData) {
		return false;
	}
	if (!hasError && !hasData) {
		return false;
	}
	if (hasError) {
		return isGetStageExpectedCountsErrorReturn(value);
	}
	return isGetStageExpectedCountsSuccessReturn(value);
}
