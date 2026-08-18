import type {
  PrepareResponseContentDeps,
  PrepareResponseContentParams,
  PrepareResponseContentPayload,
  PrepareResponseContentRetryRequiredReturn,
  PrepareResponseContentPreparedReturn,
  PrepareResponseContentErrorReturn,
  PrepareResponseContentFn,
  PrepareResponseContentSanitizeErrorConstructorParams,
  PrepareResponseContentSanitizeError,
  PrepareResponseContentContinuationErrorConstructorParams,
  PrepareResponseContentContinuationError,
} from "./prepareResponseContent.interface.ts";
import {
  PrepareResponseContentSanitizeError as PrepareResponseContentSanitizeErrorClass,
  PrepareResponseContentContinuationError as PrepareResponseContentContinuationErrorClass,
} from "./prepareResponseContent.interface.ts";
import type { FinishReason } from "../../_shared/types.ts";
import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";
import type { JsonSanitizationResult } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.interface.ts";
import type {
  ResolveFinishReasonFn,
  IsIntermediateChunkFn,
} from "../createJobContext/JobContext.interface.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { buildUnifiedAIResponse } from "../../_shared/dialectic.mock.ts";

// --- PrepareResponseContentDeps ---

const defaultResolveFinishReason: ResolveFinishReasonFn = (
  _aiResponse: UnifiedAIResponse,
): FinishReason => {
  return "stop";
};

const defaultIsIntermediateChunk: IsIntermediateChunkFn = (
  _resolvedFinish: FinishReason,
  _continueUntilComplete: boolean,
): boolean => {
  return false;
};

const defaultSanitizeJsonContent = (
  content: string,
): JsonSanitizationResult => {
  return {
    sanitized: content,
    wasSanitized: false,
    wasStructurallyFixed: false,
    hasDuplicateKeys: false,
    duplicateKeysResolved: [],
    originalLength: content.length,
  };
};

const defaultDetermineContinuation = (): { shouldContinue: boolean } => {
  return { shouldContinue: false };
};

export type PrepareResponseContentDepsOverrides =
  Partial<PrepareResponseContentDeps>;

export function buildPrepareResponseContentDeps(
  overrides?: PrepareResponseContentDepsOverrides,
): PrepareResponseContentDeps {
  const base: PrepareResponseContentDeps = {
    logger: new MockLogger(),
    resolveFinishReason: defaultResolveFinishReason,
    isIntermediateChunk: defaultIsIntermediateChunk,
    sanitizeJsonContent: defaultSanitizeJsonContent,
    determineContinuation: defaultDetermineContinuation,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentDepsCorruptions = {
  [K in keyof PrepareResponseContentDeps]?: unknown;
};

export function invalidatePrepareResponseContentDeps(
  corruptions: PrepareResponseContentDepsCorruptions,
): unknown {
  return { ...buildPrepareResponseContentDeps(), ...corruptions };
}

// --- PrepareResponseContentParams ---

export type PrepareResponseContentParamsOverrides =
  Partial<PrepareResponseContentParams>;

export function buildPrepareResponseContentParams(
  overrides?: PrepareResponseContentParamsOverrides,
): PrepareResponseContentParams {
  const base: PrepareResponseContentParams = {
    jobId: "job-1",
    mode: "json",
    continueUntilComplete: false,
    documentKey: undefined,
    contextForDocuments: undefined,
    sourceObject: undefined,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentParamsCorruptions = {
  [K in keyof PrepareResponseContentParams]?: unknown;
};

export function invalidatePrepareResponseContentParams(
  corruptions: PrepareResponseContentParamsCorruptions,
): unknown {
  return { ...buildPrepareResponseContentParams(), ...corruptions };
}

// --- PrepareResponseContentPayload ---

export type PrepareResponseContentPayloadOverrides =
  Partial<PrepareResponseContentPayload>;

export function buildPrepareResponseContentPayload(
  overrides?: PrepareResponseContentPayloadOverrides,
): PrepareResponseContentPayload {
  const base: PrepareResponseContentPayload = {
    aiResponse: buildUnifiedAIResponse(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentPayloadCorruptions = {
  [K in keyof PrepareResponseContentPayload]?: unknown;
};

export function invalidatePrepareResponseContentPayload(
  corruptions: PrepareResponseContentPayloadCorruptions,
): unknown {
  return { ...buildPrepareResponseContentPayload(), ...corruptions };
}

// --- PrepareResponseContentRetryRequiredReturn ---

export type PrepareResponseContentRetryRequiredReturnOverrides =
  Partial<PrepareResponseContentRetryRequiredReturn>;

export function buildPrepareResponseContentRetryRequiredReturn(
  overrides?: PrepareResponseContentRetryRequiredReturnOverrides,
): PrepareResponseContentRetryRequiredReturn {
  const base: PrepareResponseContentRetryRequiredReturn = {
    retryRequired: true,
    reason: "AI response was empty.",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentRetryRequiredReturnCorruptions = {
  [K in keyof PrepareResponseContentRetryRequiredReturn]?: unknown;
};

export function invalidatePrepareResponseContentRetryRequiredReturn(
  corruptions: PrepareResponseContentRetryRequiredReturnCorruptions,
): unknown {
  return {
    ...buildPrepareResponseContentRetryRequiredReturn(),
    ...corruptions,
  };
}

// --- PrepareResponseContentPreparedReturn ---

export type PrepareResponseContentPreparedReturnOverrides =
  Partial<PrepareResponseContentPreparedReturn>;

export function buildPrepareResponseContentPreparedReturn(
  overrides?: PrepareResponseContentPreparedReturnOverrides,
): PrepareResponseContentPreparedReturn {
  const base: PrepareResponseContentPreparedReturn = {
    retryRequired: false,
    contentForStorage: "",
    shouldContinue: false,
    needsContinuation: false,
    resolvedFinishReason: "stop",
    isIntermediate: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentPreparedReturnCorruptions = {
  [K in keyof PrepareResponseContentPreparedReturn]?: unknown;
};

export function invalidatePrepareResponseContentPreparedReturn(
  corruptions: PrepareResponseContentPreparedReturnCorruptions,
): unknown {
  return {
    ...buildPrepareResponseContentPreparedReturn(),
    ...corruptions,
  };
}

// --- PrepareResponseContentSanitizeErrorConstructorParams ---

export type PrepareResponseContentSanitizeErrorConstructorParamsOverrides =
  Partial<PrepareResponseContentSanitizeErrorConstructorParams>;

export function buildPrepareResponseContentSanitizeErrorConstructorParams(
  overrides?: PrepareResponseContentSanitizeErrorConstructorParamsOverrides,
): PrepareResponseContentSanitizeErrorConstructorParams {
  const base: PrepareResponseContentSanitizeErrorConstructorParams = {
    jobId: "job-1",
    thrownValue: "sanitize error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentSanitizeErrorConstructorParamsCorruptions = {
  [K in keyof PrepareResponseContentSanitizeErrorConstructorParams]?: unknown;
};

export function invalidatePrepareResponseContentSanitizeErrorConstructorParams(
  corruptions: PrepareResponseContentSanitizeErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildPrepareResponseContentSanitizeErrorConstructorParams(),
    ...corruptions,
  };
}

// --- PrepareResponseContentSanitizeError ---

export function buildPrepareResponseContentSanitizeError(
  overrides?: PrepareResponseContentSanitizeErrorConstructorParamsOverrides,
): PrepareResponseContentSanitizeError {
  return new PrepareResponseContentSanitizeErrorClass(
    buildPrepareResponseContentSanitizeErrorConstructorParams(overrides),
  );
}

// --- PrepareResponseContentContinuationErrorConstructorParams ---

export type PrepareResponseContentContinuationErrorConstructorParamsOverrides =
  Partial<PrepareResponseContentContinuationErrorConstructorParams>;

export function buildPrepareResponseContentContinuationErrorConstructorParams(
  overrides?: PrepareResponseContentContinuationErrorConstructorParamsOverrides,
): PrepareResponseContentContinuationErrorConstructorParams {
  const base: PrepareResponseContentContinuationErrorConstructorParams = {
    jobId: "job-1",
    thrownValue: "continuation error",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentContinuationErrorConstructorParamsCorruptions = {
  [K in keyof PrepareResponseContentContinuationErrorConstructorParams]?: unknown;
};

export function invalidatePrepareResponseContentContinuationErrorConstructorParams(
  corruptions: PrepareResponseContentContinuationErrorConstructorParamsCorruptions,
): unknown {
  return {
    ...buildPrepareResponseContentContinuationErrorConstructorParams(),
    ...corruptions,
  };
}

// --- PrepareResponseContentContinuationError ---

export function buildPrepareResponseContentContinuationError(
  overrides?: PrepareResponseContentContinuationErrorConstructorParamsOverrides,
): PrepareResponseContentContinuationError {
  return new PrepareResponseContentContinuationErrorClass(
    buildPrepareResponseContentContinuationErrorConstructorParams(overrides),
  );
}

// --- PrepareResponseContentErrorReturn ---

export type PrepareResponseContentErrorReturnOverrides =
  Partial<PrepareResponseContentErrorReturn>;

export function buildPrepareResponseContentErrorReturn(
  overrides?: PrepareResponseContentErrorReturnOverrides,
): PrepareResponseContentErrorReturn {
  const base: PrepareResponseContentErrorReturn = {
    error: buildPrepareResponseContentSanitizeError(),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareResponseContentErrorReturnCorruptions = {
  [K in keyof PrepareResponseContentErrorReturn]?: unknown;
};

export function invalidatePrepareResponseContentErrorReturn(
  corruptions: PrepareResponseContentErrorReturnCorruptions,
): unknown {
  return {
    ...buildPrepareResponseContentErrorReturn(),
    ...corruptions,
  };
}

// --- Function mock ---

export const mockPrepareResponseContent: PrepareResponseContentFn = (
  _deps,
  _params,
  _payload,
) => {
  return buildPrepareResponseContentPreparedReturn();
};
