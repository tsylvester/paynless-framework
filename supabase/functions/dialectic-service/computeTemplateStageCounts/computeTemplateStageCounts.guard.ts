import { isRecord, isPostgrestError } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isServiceError } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import {
	isProgressRecipeEdge,
	isProgressRecipeStep,
} from "../../_shared/utils/type-guards/type_guards.dialectic.progress.ts";
import type { FileManagerError } from "../../_shared/types/file_manager.types.ts";
import type { ServiceError } from "../../_shared/types.ts";
import type {
	ComputeTemplateStageCountsData,
	ComputeTemplateStageCountsFailure,
	ComputeTemplateStageCountsParams,
	ComputeTemplateStageCountsPayload,
	ComputeTemplateStageCountsResult,
	ComputeTemplateStageCountsSuccess,
	StageCountsEntry,
} from "./computeTemplateStageCounts.interface.ts";

export function isComputeTemplateStageCountsPayload(
	value: unknown,
): value is ComputeTemplateStageCountsPayload {
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

export function isComputeTemplateStageCountsParams(
	value: unknown,
): value is ComputeTemplateStageCountsParams {
	if (!isRecord(value)) {
		return false;
	}
	if (Object.keys(value).length !== 0) {
		return false;
	}
	return true;
}

export function isStageCountsEntry(value: unknown): value is StageCountsEntry {
	if (!isRecord(value)) {
		return false;
	}
	if (typeof value.stageId !== "string" || value.stageId.length === 0) {
		return false;
	}
	if (typeof value.stageSlug !== "string" || value.stageSlug.length === 0) {
		return false;
	}
	if (!Array.isArray(value.steps)) {
		return false;
	}
	for (const step of value.steps) {
		if (!isProgressRecipeStep(step)) {
			return false;
		}
	}
	if (!Array.isArray(value.edges)) {
		return false;
	}
	for (const edge of value.edges) {
		if (!isProgressRecipeEdge(edge)) {
			return false;
		}
	}
	if (!(value.expected instanceof Map)) {
		return false;
	}
	let expectedSum = 0;
	for (const [key, count] of value.expected.entries()) {
		if (typeof key !== "string") {
			return false;
		}
		if (
			typeof count !== "number"
			|| !Number.isInteger(count)
			|| !Number.isFinite(count)
			|| count < 0
		) {
			return false;
		}
		expectedSum += count;
	}
	if (
		typeof value.totalExpected !== "number"
		|| !Number.isInteger(value.totalExpected)
		|| !Number.isFinite(value.totalExpected)
		|| value.totalExpected < 0
	) {
		return false;
	}
	if (value.totalExpected !== expectedSum) {
		return false;
	}
	return true;
}

export function isComputeTemplateStageCountsData(
	value: unknown,
): value is ComputeTemplateStageCountsData {
	if (!isRecord(value)) {
		return false;
	}
	if (!Array.isArray(value.stages)) {
		return false;
	}
	for (const stage of value.stages) {
		if (!isStageCountsEntry(stage)) {
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
	if (!(value.stepIdToStepKey instanceof Map)) {
		return false;
	}
	for (const [key, stepKey] of value.stepIdToStepKey.entries()) {
		if (typeof key !== "string" || typeof stepKey !== "string") {
			return false;
		}
	}
	return true;
}

export function isComputeTemplateStageCountsSuccess(
	value: unknown,
): value is ComputeTemplateStageCountsSuccess {
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
	if (!isComputeTemplateStageCountsData(value.data)) {
		return false;
	}
	return true;
}

export function isComputeTemplateStageCountsFailure(
	value: unknown,
): value is ComputeTemplateStageCountsFailure {
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

export function isComputeTemplateStageCountsResult(
	value: unknown,
): value is ComputeTemplateStageCountsResult {
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
	if ("status" in value && value.status !== undefined) {
		if (typeof value.status !== "number") {
			return false;
		}
	}
	if (hasError) {
		return isComputeTemplateStageCountsFailure(value);
	}
	return isComputeTemplateStageCountsSuccess(value);
}
