import { AssembleCompressionPromptFn } from "./assembleCompressionPrompt.interface.ts";
import {
	isAssembleCompressionPromptParams,
	isAssembleCompressionPromptPayload,
} from "./assembleCompressionPrompt.guards.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type { ResourceUploadContext } from "../../types/file_manager.types.ts";

export const assembleCompressionPrompt: AssembleCompressionPromptFn = async (
	deps,
	params,
	payload,
) => {
	const { data: template, error: templateError } = await deps.dbClient
		.from("system_prompts")
		.select("prompt_text")
		.eq("name", "compression_context_v1")
		.single();

	if (templateError || !template?.prompt_text) {
		return {
			error: new Error(
				`Failed to load system_prompts row for name 'compression_context_v1': ${templateError?.message ?? "not found"}`,
			),
			retriable: true,
		};
	}

	if (!isAssembleCompressionPromptParams(params)) {
		return {
			error: new Error(
				"Invalid compression prompt params: consumingStep must have a non-empty step_description and a non-empty JSON-compatible outputs_required object.",
			),
			retriable: false,
		};
	}

	if (!isAssembleCompressionPromptPayload(payload)) {
		return {
			error: new Error(
				"Invalid compression prompt payload: mode must be 'json' or 'text', content must be a non-empty string, and chunk fields must be provided together as numbers.",
			),
			retriable: false,
		};
	}

	if (payload.mode === "json") {
		try {
			JSON.parse(payload.content);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				error: new Error(`Invalid JSON content for mode 'json': ${message}`),
				retriable: false,
			};
		}
	}

	const dynamicContextVariables: Record<string, unknown> = {
		source_content: payload.content,
		outputs_required: params.consumingStep.outputs_required,
		stage_intent: params.consumingStep.step_description,
	};

	if (payload.mode === "json") {
		dynamicContextVariables.json_mode = "true";
	} else {
		dynamicContextVariables.text_mode = "true";
	}

	if (
		payload.chunk_index !== undefined &&
		payload.chunk_total !== undefined
	) {
		dynamicContextVariables.chunk_context = "true";
		dynamicContextVariables.chunk_index = payload.chunk_index;
		dynamicContextVariables.chunk_total = payload.chunk_total;
	}

	const prompt = deps.renderPromptFn(
		template.prompt_text,
		dynamicContextVariables,
		null,
		null,
	);

	let pathContext: ResourceUploadContext['pathContext'];
	try {
		pathContext = {
			fileType: FileType.CompressionPrompt,
			projectId: params.projectId,
			sessionId: params.sessionId,
			iteration: params.iterationNumber,
			stageSlug: params.stageSlug,
			output_type: params.output_type,
			sourceType: params.sourceType,
			modelSlug: params.modelSlug,
			attemptCount: params.attemptCount,
			...(params.sourceType === "history"
				? { sourceId: params.sourceId, role: params.role }
				: { documentKey: params.documentKey }),
			...(payload.chunk_index !== undefined && payload.chunk_total !== undefined
				? { chunkIndex: payload.chunk_index, chunkTotal: payload.chunk_total }
				: {}),
		};
		deps.constructStoragePath(pathContext);
	} catch (err) {
		return {
			error: err instanceof Error
				? err
				: new Error(`Failed to construct compression prompt storage path: ${String(err)}`),
			retriable: false,
		};
	}

	const uploadContext: ResourceUploadContext = {
		pathContext,
		fileContent: prompt,
		mimeType: "text/markdown",
		sizeBytes: new TextEncoder().encode(prompt).length,
		userId: params.userId,
		description: `Compression prompt for ${params.sourceType} source compressed for ${params.output_type}`,
	};

	const response = await deps.fileManager.uploadAndRegisterFile(uploadContext);

	if (response.error) {
		return { error: response.error, retriable: true };
	}

	return { promptContent: prompt, source_prompt_resource_id: response.record.id };
};
