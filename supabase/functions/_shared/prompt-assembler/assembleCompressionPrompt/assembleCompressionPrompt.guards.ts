import { isJson, isRecord } from "../../utils/type-guards/type_guards.common.ts";
import { isCompressionMode } from "../../utils/type-guards/type_guards.file_manager.ts";
import {
	AssembleCompressionPromptDeps,
	AssembleCompressionPromptErrorReturn,
	AssembleCompressionPromptParams,
	AssembleCompressionPromptPayload,
	AssembleCompressionPromptSuccessReturn,
} from "./assembleCompressionPrompt.interface.ts";

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

	if (!("prompt" in value)) {
		return false;
	}

	return typeof value.prompt === "string";
}

export function isAssembleCompressionPromptErrorReturn(
	value: unknown,
): value is AssembleCompressionPromptErrorReturn {
	if (!isRecord(value)) {
		return false;
	}

	if ("prompt" in value) {
		return false;
	}

	if (!("error" in value) || !("retriable" in value)) {
		return false;
	}

	if (typeof value.retriable !== "boolean") {
		return false;
	}

	if (!(value.error instanceof Error)) {
		return false;
	}

	return true;
}
