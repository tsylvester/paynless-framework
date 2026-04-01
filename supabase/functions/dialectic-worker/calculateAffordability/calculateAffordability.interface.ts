// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.ts

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  ILogger,
  Messages,
  ResourceDocuments,
} from "../../_shared/types.ts";
import type { CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { RelevanceRule } from "../../dialectic-service/dialectic.interface.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import type { BoundCompressPromptFn } from "../compressPrompt/compressPrompt.interface.ts";

export interface CalculateAffordabilityDeps {
  logger: ILogger;
  countTokens: CountTokensFn;
  compressPrompt: BoundCompressPromptFn;
}

export interface CalculateAffordabilityParams {
  dbClient: SupabaseClient<Database>;
  jobId: string;
  projectOwnerUserId: string;
  sessionId: string;
  stageSlug: string;
  walletId: string;
  walletBalance: number;
  extendedModelConfig: AiModelExtendedConfig;
  inputRate: number;
  outputRate: number;
  isContinuationFlowInitial: boolean;
  inputsRelevance?: RelevanceRule[];
}

export interface CalculateAffordabilityPayload {
  compressionStrategy: ICompressionStrategy;
  resourceDocuments: ResourceDocuments;
  conversationHistory: Messages[];
  currentUserPrompt: string;
  systemInstruction: string;
  chatApiRequest: ChatApiRequest;
}

export interface CalculateAffordabilityDirectReturn {
  wasCompressed: false;
  maxOutputTokens: number;
}

export interface CalculateAffordabilityCompressedReturn {
  wasCompressed: true;
  chatApiRequest: ChatApiRequest;
  resolvedInputTokenCount: number;
  resourceDocuments: ResourceDocuments;
}

export interface CalculateAffordabilityErrorReturn {
  error: Error;
  retriable: boolean;
}

export type CalculateAffordabilityReturn =
  (CalculateAffordabilityDirectReturn | CalculateAffordabilityCompressedReturn)
    | CalculateAffordabilityErrorReturn;

export type CalculateAffordabilityFn = (
  deps: CalculateAffordabilityDeps,
  params: CalculateAffordabilityParams,
  payload: CalculateAffordabilityPayload,
) => Promise<CalculateAffordabilityReturn>;

export type BoundCalculateAffordabilityFn = (
  params: CalculateAffordabilityParams,
  payload: CalculateAffordabilityPayload,
) => Promise<CalculateAffordabilityReturn>;
