import { isJson, isRecord } from "../../utils/type-guards/type_guards.common.ts";
import {
	isCompressionHistoryRole,
	isCompressionMode,
	isCompressionSourceType,
	isDialecticStageSlug,
	isFileManagerError,
	isFileType,
	isModelContributionFileType,
} from "../../utils/type-guards/type_guards.file_manager.ts";
import {
	AssembleCompressionPromptDeps,
	AssembleCompressionPromptErrorReturn,
	AssembleCompressionPromptParams,
	AssembleCompressionPromptPayload,
	AssembleCompressionPromptSuccessReturn,
} from "./assembleCompressionPrompt.interface.ts";

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isAssembleCompressionPromptDeps(
	value: unknown,
): value is AssembleCompressionPromptDeps {
	if (!isRecord(value)) {
		return false;
	}

	if (!isRecord(value.dbClient)) {
		return false;
	}

	if (typeof value.renderPromptFn !== "function") {
		return false;
	}

	if (!isRecord(value.logger)) {
		return false;
	}

	if (typeof value.fileManager !== "object" || value.fileManager === null) {
		return false;
	}

	if (typeof value.constructStoragePath !== "function") {
		return false;
	}

	return true;
}

export function isAssembleCompressionPromptParams(
	value: unknown,
): value is AssembleCompressionPromptParams {
	if (!isRecord(value)) {
		return false;
	}

	const consumingStep = value.consumingStep;
	if (!isRecord(consumingStep)) {
		return false;
	}

	if (!("outputs_required" in consumingStep) || !("step_description" in consumingStep)) {
		return false;
	}

	if (
		!isRecord(consumingStep.outputs_required) ||
		!isJson(consumingStep.outputs_required, false) ||
		Object.keys(consumingStep.outputs_required).length === 0
	) {
		return false;
	}

	if (
		typeof consumingStep.step_description !== "string" ||
		consumingStep.step_description.trim().length === 0
	) {
		return false;
	}

	if (!isNonEmptyString(value.projectId)) {
		return false;
	}

	if (!isNonEmptyString(value.sessionId)) {
		return false;
	}

	if (!isNonNegativeInteger(value.iterationNumber)) {
		return false;
	}

	if (!isDialecticStageSlug(value.stageSlug)) {
		return false;
	}

	if (!isModelContributionFileType(value.targetKey)) {
		return false;
	}

	if (!isCompressionSourceType(value.sourceType)) {
		return false;
	}

	if (!isNonEmptyString(value.modelSlug)) {
		return false;
	}

	if (!isNonNegativeInteger(value.attemptCount)) {
		return false;
	}

	if (!isNonEmptyString(value.userId)) {
		return false;
	}

	// Per-sourceType branch — never an OR-fallback
	if (value.sourceType === "contribution" || value.sourceType === "resource" || value.sourceType === "feedback") {
		if (!isFileType(value.documentKey)) {
			return false;
		}
	} else if (value.sourceType === "history") {
		if (!isNonEmptyString(value.sourceId)) {
			return false;
		}
		if (!isCompressionHistoryRole(value.role)) {
			return false;
		}
	} else {
		return false;
	}

	return true;
}

export function isAssembleCompressionPromptPayload(
	value: unknown,
): value is AssembleCompressionPromptPayload {
	if (!isRecord(value)) {
		return false;
	}

	if (!isCompressionMode(value.mode)) {
		return false;
	}

	if (typeof value.content !== "string" || value.content === "") {
		return false;
	}

	if ("chunk_index" in value || "chunk_total" in value) {
		if (
			typeof value.chunk_index !== "number" ||
			typeof value.chunk_total !== "number"
		) {
			return false;
		}
	}

	return true;
}

export function isAssembleCompressionPromptSuccessReturn(
	value: unknown,
): value is AssembleCompressionPromptSuccessReturn {
	if (!isRecord(value)) {
		return false;
	}

	if ("error" in value) {
		return false;
	}

	if (!("promptContent" in value)) {
		return false;
	}

	if (!("source_prompt_resource_id" in value)) {
		return false;
	}

	return typeof value.promptContent === "string" &&
		typeof value.source_prompt_resource_id === "string";
}

export function isAssembleCompressionPromptErrorReturn(
	value: unknown,
): value is AssembleCompressionPromptErrorReturn {
	if (!isRecord(value)) {
		return false;
	}

	if ("promptContent" in value) {
		return false;
	}

	if (!("error" in value) || !("retriable" in value)) {
		return false;
	}

	if (typeof value.retriable !== "boolean") {
		return false;
	}

	if (!(value.error instanceof Error) && !isFileManagerError(value.error)) {
		return false;
	}

	return true;
}
