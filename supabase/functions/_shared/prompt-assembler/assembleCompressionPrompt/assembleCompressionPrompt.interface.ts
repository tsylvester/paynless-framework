import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../../../types_db.ts";
import { ILogger } from "../../types.ts";
import { CompressionMode } from "../../types/file_manager.types.ts";
import { OutputRule } from "../../../dialectic-service/dialectic.interface.ts";

export type RenderCompressionPromptFn = (
	basePromptText: string,
	dynamicContextVariables: Record<string, unknown>,
	systemDefaultOverlayValues?: Json | null,
	userProjectOverlayValues?: Json | null,
) => string;

export interface AssembleCompressionPromptDeps {
	dbClient: SupabaseClient<Database>;
	renderPromptFn: RenderCompressionPromptFn;
	logger: ILogger;
}

export interface CompressionTargetStep {
	outputs_required: OutputRule;
	step_description: string | null;
}

export interface AssembleCompressionPromptParams {
	consumingStep: CompressionTargetStep;
}

export interface AssembleCompressionPromptPayload {
	mode: CompressionMode;
	content: string;
	chunk_index?: number;
	chunk_total?: number;
}

export interface AssembleCompressionPromptSuccessReturn {
	prompt: string;
}

export interface AssembleCompressionPromptErrorReturn {
	error: Error;
	retriable: boolean;
}

export type AssembleCompressionPromptReturn =
	| AssembleCompressionPromptSuccessReturn
	| AssembleCompressionPromptErrorReturn;

export type AssembleCompressionPromptFn = (
	deps: AssembleCompressionPromptDeps,
	params: AssembleCompressionPromptParams,
	payload: AssembleCompressionPromptPayload,
) => Promise<AssembleCompressionPromptReturn>;

export type BoundAssembleCompressionPromptFn = (
	params: AssembleCompressionPromptParams,
	payload: AssembleCompressionPromptPayload,
) => Promise<AssembleCompressionPromptReturn>;
