import type { ILogger, FinishReason } from "../../_shared/types.ts";
import type { CompressionMode } from "../../_shared/types/file_manager.types.ts";
import type {
  UnifiedAIResponse,
  ContextForDocument,
  ContentToInclude,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  ResolveFinishReasonFn,
  IsIntermediateChunkFn,
  DetermineContinuationFn,
} from "../createJobContext/JobContext.interface.ts";
import type { SanitizeJsonContentFn } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.interface.ts";

export interface PrepareResponseContentDeps {
  logger: ILogger;
  resolveFinishReason: ResolveFinishReasonFn;
  isIntermediateChunk: IsIntermediateChunkFn;
  sanitizeJsonContent: SanitizeJsonContentFn;
  determineContinuation: DetermineContinuationFn;
}

export interface PrepareResponseContentParams {
  jobId: string;
  mode?: CompressionMode;
  continueUntilComplete: boolean;
  documentKey: string | null | undefined;
  contextForDocuments: ContextForDocument[] | undefined;
  sourceObject: ContentToInclude | undefined;
}

export interface PrepareResponseContentPayload {
  aiResponse: UnifiedAIResponse;
}

export type PrepareResponseContentRetryRequiredReturn = {
  retryRequired: true;
  reason: string;
};

export type PrepareResponseContentPreparedReturn = {
  retryRequired: false;
  contentForStorage: string;
  shouldContinue: boolean;
  needsContinuation: boolean;
  resolvedFinishReason: FinishReason;
  isIntermediate: boolean;
};

export type PrepareResponseContentSuccessReturn =
  | PrepareResponseContentRetryRequiredReturn
  | PrepareResponseContentPreparedReturn;

export interface PrepareResponseContentSanitizeErrorConstructorParams {
  jobId: string;
  thrownValue: string;
}

export class PrepareResponseContentSanitizeError extends Error {
  readonly jobId: string;
  readonly thrownValue: string;
  constructor(params: PrepareResponseContentSanitizeErrorConstructorParams) {
    super(`jobId: ${params.jobId}, thrownValue: ${params.thrownValue}`);
    this.name = "PrepareResponseContentSanitizeError";
    this.jobId = params.jobId;
    this.thrownValue = params.thrownValue;
  }
}

export interface PrepareResponseContentContinuationErrorConstructorParams {
  jobId: string;
  thrownValue: string;
}

export class PrepareResponseContentContinuationError extends Error {
  readonly jobId: string;
  readonly thrownValue: string;
  constructor(params: PrepareResponseContentContinuationErrorConstructorParams) {
    super(`jobId: ${params.jobId}, thrownValue: ${params.thrownValue}`);
    this.name = "PrepareResponseContentContinuationError";
    this.jobId = params.jobId;
    this.thrownValue = params.thrownValue;
  }
}

export type PrepareResponseContentErrorReturn = {
  error: PrepareResponseContentSanitizeError | PrepareResponseContentContinuationError;
  retriable: boolean;
};

export type PrepareResponseContentReturn =
  | PrepareResponseContentSuccessReturn
  | PrepareResponseContentErrorReturn;

export type PrepareResponseContentFn = (
  deps: PrepareResponseContentDeps,
  params: PrepareResponseContentParams,
  payload: PrepareResponseContentPayload,
) => PrepareResponseContentReturn;

export type BoundPrepareResponseContentFn = (
  params: PrepareResponseContentParams,
  payload: PrepareResponseContentPayload,
) => PrepareResponseContentReturn;
