import type { BoundCountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import type { AiModelExtendedConfig, TokenUsage } from "../../_shared/types.ts";
import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";

export interface AssembleAiResponseDeps {
  countTokens: BoundCountTokensFn;
}

export interface AssembleAiResponseParams {
  processingTimeMs: number;
  preflightInputTokens?: number;
  modelConfig: AiModelExtendedConfig;
}

export interface AssembleAiResponsePayload {
  assembledContent: string;
  tokenUsage: TokenUsage | null;
  finishReason: string | null;
}

export interface AssembleAiResponseTokenCountErrorConstructorParams {
  apiIdentifier: string;
  thrownValue: string;
}

export class AssembleAiResponseTokenCountError extends Error {
  readonly apiIdentifier: string;
  readonly thrownValue: string;
  constructor(params: AssembleAiResponseTokenCountErrorConstructorParams) {
    super(`apiIdentifier: ${params.apiIdentifier}, thrownValue: ${params.thrownValue}`);
    this.name = "AssembleAiResponseTokenCountError";
    this.apiIdentifier = params.apiIdentifier;
    this.thrownValue = params.thrownValue;
  }
}

export interface AssembleAiResponseMissingPreflightErrorConstructorParams {
  apiIdentifier: string;
}

export class AssembleAiResponseMissingPreflightError extends Error {
  readonly apiIdentifier: string;
  constructor(params: AssembleAiResponseMissingPreflightErrorConstructorParams) {
    super(`apiIdentifier: ${params.apiIdentifier}`);
    this.name = "AssembleAiResponseMissingPreflightError";
    this.apiIdentifier = params.apiIdentifier;
  }
}

export type AssembleAiResponseSuccessReturn = { aiResponse: UnifiedAIResponse };

export type AssembleAiResponseErrorReturn = {
  error: AssembleAiResponseTokenCountError | AssembleAiResponseMissingPreflightError;
  retriable: boolean;
};

export type AssembleAiResponseReturn =
  | AssembleAiResponseSuccessReturn
  | AssembleAiResponseErrorReturn;

export type AssembleAiResponseFn = (
  deps: AssembleAiResponseDeps,
  params: AssembleAiResponseParams,
  payload: AssembleAiResponsePayload,
) => AssembleAiResponseReturn;

export type BoundAssembleAiResponseFn = (
  params: AssembleAiResponseParams,
  payload: AssembleAiResponsePayload,
) => AssembleAiResponseReturn;
