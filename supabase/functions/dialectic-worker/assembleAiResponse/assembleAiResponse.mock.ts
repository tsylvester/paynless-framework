import type {
  AssembleAiResponseDeps,
  AssembleAiResponseParams,
  AssembleAiResponsePayload,
  AssembleAiResponseMissingPreflightErrorConstructorParams,
  AssembleAiResponseTokenCountErrorConstructorParams,
  AssembleAiResponseSuccessReturn,
  AssembleAiResponseErrorReturn,
  AssembleAiResponseFn,
  BoundAssembleAiResponseFn,
} from "./assembleAiResponse.interface.ts";
import {
  AssembleAiResponseTokenCountError,
  AssembleAiResponseMissingPreflightError,
} from "./assembleAiResponse.interface.ts";
import type { BoundCountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildTokenUsage } from "../../_shared/dialectic.mock.ts";
import { buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";

// --- AssembleAiResponseDeps ---

const defaultCountTokens: BoundCountTokensFn = (_payload, _modelConfig) => 42;

export type AssembleAiResponseDepsOverrides = Partial<AssembleAiResponseDeps>;

export function buildAssembleAiResponseDeps(
  overrides?: AssembleAiResponseDepsOverrides,
): AssembleAiResponseDeps {
  const base: AssembleAiResponseDeps = {
    countTokens: defaultCountTokens,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type AssembleAiResponseDepsCorruptions = {
  [K in keyof AssembleAiResponseDeps]?: unknown;
};

export function invalidateAssembleAiResponseDeps(
  corruptions: AssembleAiResponseDepsCorruptions,
): unknown {
  return { ...buildAssembleAiResponseDeps(), ...corruptions };
}

// --- AssembleAiResponseParams ---

export type AssembleAiResponseParamsOverrides = Partial<AssembleAiResponseParams>;

export function buildAssembleAiResponseParams(
  overrides?: AssembleAiResponseParamsOverrides,
): AssembleAiResponseParams {
  const base: AssembleAiResponseParams = {
    processingTimeMs: 100,
    preflightInputTokens: 200,
    modelConfig: buildExtendedModelConfig(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type AssembleAiResponseParamsCorruptions = {
  [K in keyof AssembleAiResponseParams]?: unknown;
};

export function invalidateAssembleAiResponseParams(
  corruptions: AssembleAiResponseParamsCorruptions,
): unknown {
  return { ...buildAssembleAiResponseParams(), ...corruptions };
}

// --- AssembleAiResponsePayload ---

export type AssembleAiResponsePayloadOverrides = Partial<AssembleAiResponsePayload>;

export function buildAssembleAiResponsePayload(
  overrides?: AssembleAiResponsePayloadOverrides,
): AssembleAiResponsePayload {
  const base: AssembleAiResponsePayload = {
    assembledContent: "Test assembled content",
    tokenUsage: buildTokenUsage(),
    finishReason: "stop",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type AssembleAiResponsePayloadCorruptions = {
  [K in keyof AssembleAiResponsePayload]?: unknown;
};

export function invalidateAssembleAiResponsePayload(
  corruptions: AssembleAiResponsePayloadCorruptions,
): unknown {
  return { ...buildAssembleAiResponsePayload(), ...corruptions };
}

// --- AssembleAiResponseTokenCountErrorConstructorParams ---

export type AssembleAiResponseTokenCountErrorConstructorParamsOverrides =
  Partial<AssembleAiResponseTokenCountErrorConstructorParams>;

export function buildAssembleAiResponseTokenCountErrorConstructorParams(
  overrides?: AssembleAiResponseTokenCountErrorConstructorParamsOverrides,
): AssembleAiResponseTokenCountErrorConstructorParams {
  const base: AssembleAiResponseTokenCountErrorConstructorParams = {
    apiIdentifier: "test-api-identifier",
    thrownValue: "test thrown value",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type AssembleAiResponseTokenCountErrorConstructorParamsCorruptions = {
  [K in keyof AssembleAiResponseTokenCountErrorConstructorParams]?: unknown;
};

export function invalidateAssembleAiResponseTokenCountErrorConstructorParams(
  corruptions: AssembleAiResponseTokenCountErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildAssembleAiResponseTokenCountErrorConstructorParams(),
    ...corruptions,
  };
}

// --- AssembleAiResponseTokenCountError ---

export function buildAssembleAiResponseTokenCountError(
  overrides?: AssembleAiResponseTokenCountErrorConstructorParamsOverrides,
): AssembleAiResponseTokenCountError {
  return new AssembleAiResponseTokenCountError(
    buildAssembleAiResponseTokenCountErrorConstructorParams(overrides),
  );
}

// --- AssembleAiResponseMissingPreflightErrorConstructorParams ---

export type AssembleAiResponseMissingPreflightErrorConstructorParamsOverrides =
  Partial<AssembleAiResponseMissingPreflightErrorConstructorParams>;

export function buildAssembleAiResponseMissingPreflightErrorConstructorParams(
  overrides?: AssembleAiResponseMissingPreflightErrorConstructorParamsOverrides,
): AssembleAiResponseMissingPreflightErrorConstructorParams {
  const base: AssembleAiResponseMissingPreflightErrorConstructorParams = {
    apiIdentifier: "test-api-identifier",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type AssembleAiResponseMissingPreflightErrorConstructorParamsCorruptions = {
  [K in keyof AssembleAiResponseMissingPreflightErrorConstructorParams]?: unknown;
};

export function invalidateAssembleAiResponseMissingPreflightErrorConstructorParams(
  corruptions: AssembleAiResponseMissingPreflightErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildAssembleAiResponseMissingPreflightErrorConstructorParams(),
    ...corruptions,
  };
}

// --- AssembleAiResponseMissingPreflightError ---

export function buildAssembleAiResponseMissingPreflightError(
  overrides?: AssembleAiResponseMissingPreflightErrorConstructorParamsOverrides,
): AssembleAiResponseMissingPreflightError {
  return new AssembleAiResponseMissingPreflightError(
    buildAssembleAiResponseMissingPreflightErrorConstructorParams(overrides),
  );
}

// --- AssembleAiResponseSuccessReturn ---

export type AssembleAiResponseSuccessReturnOverrides =
  Partial<AssembleAiResponseSuccessReturn>;

export function buildAssembleAiResponseSuccessReturn(
  overrides?: AssembleAiResponseSuccessReturnOverrides,
): AssembleAiResponseSuccessReturn {
  const base: AssembleAiResponseSuccessReturn = {
    aiResponse: buildUnifiedAIResponse(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type AssembleAiResponseSuccessReturnCorruptions = {
  [K in keyof AssembleAiResponseSuccessReturn]?: unknown;
};

export function invalidateAssembleAiResponseSuccessReturn(
  corruptions: AssembleAiResponseSuccessReturnCorruptions,
): unknown {
  return { ...buildAssembleAiResponseSuccessReturn(), ...corruptions };
}

// --- AssembleAiResponseErrorReturn ---

export type AssembleAiResponseErrorReturnOverrides =
  Partial<AssembleAiResponseErrorReturn>;

export function buildAssembleAiResponseErrorReturn(
  overrides?: AssembleAiResponseErrorReturnOverrides,
): AssembleAiResponseErrorReturn {
  const base: AssembleAiResponseErrorReturn = {
    error: buildAssembleAiResponseTokenCountError(),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type AssembleAiResponseErrorReturnCorruptions = {
  [K in keyof AssembleAiResponseErrorReturn]?: unknown;
};

export function invalidateAssembleAiResponseErrorReturn(
  corruptions: AssembleAiResponseErrorReturnCorruptions,
): unknown {
  return { ...buildAssembleAiResponseErrorReturn(), ...corruptions };
}

// --- Function mocks ---

export const mockAssembleAiResponse: AssembleAiResponseFn = (
  _deps,
  _params,
  _payload,
) => {
  return buildAssembleAiResponseSuccessReturn();
};

export const mockBoundAssembleAiResponseFn: BoundAssembleAiResponseFn = (
  _params,
  _payload,
) => {
  return buildAssembleAiResponseSuccessReturn();
};
