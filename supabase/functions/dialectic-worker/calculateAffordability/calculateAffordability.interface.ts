// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.ts

import type { Tables } from "../../types_db.ts";
import type {
  AiModelExtendedConfig,
  ILogger,
  Messages,
} from "../../_shared/types.ts";
import { ResourceDocuments } from '../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts'
import type { CountTokensFn } from "../../_shared/types/tokenizer.types.ts";

export type TierOutputCapTokens = Tables<'tier_definitions'>['output_cap_tokens'];

export interface UserConfig {
  readonly tier_output_cap_tokens: TierOutputCapTokens;
}

export type GetMaxOutputTokensFn = (
  user_balance_tokens: number,
  prompt_input_tokens: number,
  modelConfig: AiModelExtendedConfig,
  logger: ILogger,
  deficit_tokens_allowed: number,
  tierOutputCapTokens: TierOutputCapTokens | null,
) => number;

export interface CalculateAffordabilityDeps {
  logger: ILogger;
  countTokens: CountTokensFn;
  getMaxOutputTokens: GetMaxOutputTokensFn;
}
export interface CalculateAffordabilityParams {
  walletBalance: number;
  userConfig: UserConfig;
}

export interface CalculateAffordabilityPayload {
  extendedModelConfig: AiModelExtendedConfig;
  resourceDocuments: ResourceDocuments;
  conversationHistory: Messages[];
  currentUserPrompt: string;
  systemInstruction: string;
}

export interface CalculateAffordabilityWithinBudgetReturn {
  overBudget: false;
  maxOutputTokens: number;
  resolvedInputTokenCount: number;
}

export interface CalculateAffordabilityOverBudgetReturn {
  overBudget: true;
  resolvedInputTokenCount: number;
  finalTargetThreshold: number;
  balanceAfterCompression: number;
}

export type CalculateAffordabilitySuccessReturn =
  | CalculateAffordabilityWithinBudgetReturn
  | CalculateAffordabilityOverBudgetReturn;

export interface CalculateAffordabilityErrorReturn {
  error: Error;
  retriable: boolean;
}

export type CalculateAffordabilityReturn =
  | CalculateAffordabilitySuccessReturn
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
