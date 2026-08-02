import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../../../types_db.ts";
import { ILogger, Messages } from "../../types.ts";
import {
  CompressionMode,
  CompressionSourceType,
  DialecticStageSlug,
  FileManagerError,
  FileType,
  IFileManager,
  ModelContributionFileTypes,
} from "../../types/file_manager.types.ts";
import { ConstructStoragePathFn } from "../../utils/path_constructor.types.ts";
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
  fileManager: IFileManager;
  constructStoragePath: ConstructStoragePathFn;
}

export interface CompressionTargetStep {
  outputs_required: OutputRule;
  step_description: string | null;
}

export interface AssembleCompressionPromptParams {
  consumingStep: CompressionTargetStep;
  projectId: string;
  sessionId: string;
  iterationNumber: number;
  stageSlug: DialecticStageSlug;
  targetKey: ModelContributionFileTypes;
  sourceType: CompressionSourceType;
  documentKey?: FileType; // Required when sourceType is 'contribution', 'resource', or 'feedback'
  sourceId?: string; // Required when sourceType is 'history'
  role?: Messages["role"]; // Required when sourceType is 'history'
  modelSlug: string;
  attemptCount: number;
  userId: string;
}

export interface AssembleCompressionPromptPayload {
  mode: CompressionMode;
  content: string;
  chunk_index?: number;
  chunk_total?: number;
}

export type AssembleCompressionPromptError = Error | FileManagerError;

export interface AssembleCompressionPromptErrorReturn {
  error: AssembleCompressionPromptError;
  retriable: boolean;
}

export interface AssembleCompressionPromptSuccessReturn {
  promptContent: string;
  source_prompt_resource_id: string;
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
