// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.mock.ts

import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { buildResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";

import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityFn,
  CalculateAffordabilityOverBudgetReturn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  CalculateAffordabilityWithinBudgetReturn,
  GetMaxOutputTokensFn,
  UserConfig,
} from "./calculateAffordability.interface.ts";

export type UserConfigOverrides = Partial<UserConfig>;

export function buildUserConfig(overrides?: UserConfigOverrides): UserConfig {
  const base: UserConfig = {
    tier_output_cap_tokens: null,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type UserConfigCorruptions = { [K in keyof UserConfig]?: unknown };

export function invalidateUserConfig(corruptions: UserConfigCorruptions): unknown {
  return { ...buildUserConfig(), ...corruptions };
}

export type CalculateAffordabilityDepsOverrides = Partial<CalculateAffordabilityDeps>;

export type CalculateAffordabilityDepsCorruptions = {
  [K in keyof CalculateAffordabilityDeps]?: unknown;
};

export function buildCalculateAffordabilityDeps(
  overrides?: CalculateAffordabilityDepsOverrides,
): CalculateAffordabilityDeps {
  const base: CalculateAffordabilityDeps = {
    logger: new MockLogger(),
    countTokens: createMockCountTokens(),
    getMaxOutputTokens: getMaxOutputTokens,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCalculateAffordabilityDeps(
  corruptions: CalculateAffordabilityDepsCorruptions,
): unknown {
  return { ...buildCalculateAffordabilityDeps(), ...corruptions };
}

export type CalculateAffordabilityParamsOverrides = Partial<CalculateAffordabilityParams>;

export type CalculateAffordabilityParamsCorruptions = {
  [K in keyof CalculateAffordabilityParams]?: unknown;
};

export function buildCalculateAffordabilityParams(
  overrides?: CalculateAffordabilityParamsOverrides,
): CalculateAffordabilityParams {
  const base: CalculateAffordabilityParams = {
    walletBalance: 1_000_000,
    userConfig: buildUserConfig(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCalculateAffordabilityParams(
  corruptions: CalculateAffordabilityParamsCorruptions,
): unknown {
  return { ...buildCalculateAffordabilityParams(), ...corruptions };
}

export type CalculateAffordabilityPayloadOverrides = Partial<CalculateAffordabilityPayload>;

export type CalculateAffordabilityPayloadCorruptions = {
  [K in keyof CalculateAffordabilityPayload]?: unknown;
};

export function buildCalculateAffordabilityPayload(
  overrides?: CalculateAffordabilityPayloadOverrides,
): CalculateAffordabilityPayload {
  const base: CalculateAffordabilityPayload = {
    extendedModelConfig: buildExtendedModelConfig(),
    resourceDocuments: [buildResourceDocument()],
    conversationHistory: [],
    currentUserPrompt: "contract user prompt text",
    systemInstruction: "contract system instruction",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCalculateAffordabilityPayload(
  corruptions: CalculateAffordabilityPayloadCorruptions,
): unknown {
  return { ...buildCalculateAffordabilityPayload(), ...corruptions };
}

export type CalculateAffordabilityWithinBudgetReturnOverrides =
  Partial<CalculateAffordabilityWithinBudgetReturn>;

export type CalculateAffordabilityWithinBudgetReturnCorruptions = {
  [K in keyof CalculateAffordabilityWithinBudgetReturn]?: unknown;
};

export function buildCalculateAffordabilityWithinBudgetReturn(
  overrides?: CalculateAffordabilityWithinBudgetReturnOverrides,
): CalculateAffordabilityWithinBudgetReturn {
  const base: CalculateAffordabilityWithinBudgetReturn = {
    overBudget: false,
    maxOutputTokens: 100,
    resolvedInputTokenCount: 50,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCalculateAffordabilityWithinBudgetReturn(
  corruptions: CalculateAffordabilityWithinBudgetReturnCorruptions,
): unknown {
  return { ...buildCalculateAffordabilityWithinBudgetReturn(), ...corruptions };
}

export type CalculateAffordabilityOverBudgetReturnOverrides =
  Partial<CalculateAffordabilityOverBudgetReturn>;

export type CalculateAffordabilityOverBudgetReturnCorruptions = {
  [K in keyof CalculateAffordabilityOverBudgetReturn]?: unknown;
};

export function buildCalculateAffordabilityOverBudgetReturn(
  overrides?: CalculateAffordabilityOverBudgetReturnOverrides,
): CalculateAffordabilityOverBudgetReturn {
  const base: CalculateAffordabilityOverBudgetReturn = {
    overBudget: true,
    resolvedInputTokenCount: 100,
    finalTargetThreshold: 50000,
    balanceAfterCompression: 900000,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCalculateAffordabilityOverBudgetReturn(
  corruptions: CalculateAffordabilityOverBudgetReturnCorruptions,
): unknown {
  return { ...buildCalculateAffordabilityOverBudgetReturn(), ...corruptions };
}

export type CalculateAffordabilityErrorReturnOverrides =
  Partial<CalculateAffordabilityErrorReturn>;

export type CalculateAffordabilityErrorReturnCorruptions = {
  [K in keyof CalculateAffordabilityErrorReturn]?: unknown;
};

export function buildCalculateAffordabilityErrorReturn(
  overrides?: CalculateAffordabilityErrorReturnOverrides,
): CalculateAffordabilityErrorReturn {
  const base: CalculateAffordabilityErrorReturn = {
    error: new Error("mock-calculate-affordability-error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function invalidateCalculateAffordabilityErrorReturn(
  corruptions: CalculateAffordabilityErrorReturnCorruptions,
): unknown {
  return { ...buildCalculateAffordabilityErrorReturn(), ...corruptions };
}

export const mockCalculateAffordability: CalculateAffordabilityFn = async (
  _deps,
  _params,
  _payload,
) => {
  return buildCalculateAffordabilityWithinBudgetReturn();
};

export const mockBoundCalculateAffordability: BoundCalculateAffordabilityFn = async (
  _params,
  _payload,
) => {
  return buildCalculateAffordabilityWithinBudgetReturn();
};

export const mockGetMaxOutputTokens: GetMaxOutputTokensFn = (
  _user_balance_tokens,
  _prompt_input_tokens,
  _modelConfig,
  _logger,
  _deficit_tokens_allowed,
  _tierOutputCapTokens,
) => 0;
