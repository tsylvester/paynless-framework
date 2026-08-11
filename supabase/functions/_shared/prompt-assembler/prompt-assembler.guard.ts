import { isRecord } from "../utils/type_guards.ts";
import type { AssembleContinuationPromptErrorReturn } from "./prompt-assembler.interface.ts";

export function isAssembleContinuationPromptErrorReturn(
	value: unknown,
): value is AssembleContinuationPromptErrorReturn {
	if (!isRecord(value)) {
		return false;
	}

	if ("promptContent" in value) {
		return false;
	}

	if ("source_prompt_resource_id" in value) {
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
