import type {
  PrepareResponseContentFn,
  PrepareResponseContentReturn,
  PrepareResponseContentRetryRequiredReturn,
  PrepareResponseContentPreparedReturn,
  PrepareResponseContentErrorReturn,
} from "./prepareResponseContent.interface.ts";
import {
  PrepareResponseContentSanitizeError,
  PrepareResponseContentContinuationError,
} from "./prepareResponseContent.interface.ts";
import { isJsonSanitizationResult } from "../../_shared/utils/jsonSanitizer/jsonSanitizer.guard.ts";
import { isDialecticContinueReason } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";

export const prepareResponseContent: PrepareResponseContentFn = (
  deps,
  params,
  payload,
): PrepareResponseContentReturn => {
  const aiResponse = payload.aiResponse;

  if (aiResponse.error || !aiResponse.content) {
    const retryRequired: PrepareResponseContentRetryRequiredReturn = {
      retryRequired: true,
      reason: aiResponse.error || 'AI response was empty.',
    };
    return retryRequired;
  }

  const resolvedFinish = deps.resolveFinishReason(aiResponse);

  if (resolvedFinish === 'error') {
    const retryRequired: PrepareResponseContentRetryRequiredReturn = {
      retryRequired: true,
      reason: 'AI provider signaled error via finish_reason.',
    };
    return retryRequired;
  }

  let shouldContinue: boolean = isDialecticContinueReason(resolvedFinish);

  const isIntermediate: boolean = deps.isIntermediateChunk(
    resolvedFinish,
    params.continueUntilComplete,
  );

  let contentForStorage: string;
  if (isIntermediate || params.mode === 'text') {
    contentForStorage = aiResponse.content;
    deps.logger.info(
      `[saveResponse] Skipping sanitize/parse for intermediate continuation chunk (finish_reason: ${resolvedFinish})`,
      { jobId: params.jobId },
    );
  } else {
    let sanitizationResult;
    try {
      sanitizationResult = deps.sanitizeJsonContent(aiResponse.content);
    } catch (e: unknown) {
      if (!(e instanceof Error)) throw e;
      const errorReturn: PrepareResponseContentErrorReturn = {
        error: new PrepareResponseContentSanitizeError({
          jobId: params.jobId,
          thrownValue: e.message,
        }),
        retriable: false,
      };
      return errorReturn;
    }

    if (!isJsonSanitizationResult(sanitizationResult)) {
      deps.logger.warn(
        `[saveResponse] Invalid sanitization result for job ${params.jobId}. Triggering retry.`,
      );
      const retryRequired: PrepareResponseContentRetryRequiredReturn = {
        retryRequired: true,
        reason: 'Invalid JSON sanitization result',
      };
      return retryRequired;
    }

    if (sanitizationResult.wasSanitized) {
      deps.logger.info(`[saveResponse] JSON content sanitized for job ${params.jobId}`, {
        originalLength: sanitizationResult.originalLength,
        sanitizedLength: sanitizationResult.sanitized.length,
        wasStructurallyFixed: sanitizationResult.wasStructurallyFixed,
      });
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(sanitizationResult.sanitized);
    } catch (e: unknown) {
      if (!(e instanceof SyntaxError)) throw e;
      deps.logger.warn(
        `[saveResponse] Malformed JSON response for job ${params.jobId} after sanitization. Triggering retry.`,
        { error: e.message },
      );
      const retryRequired: PrepareResponseContentRetryRequiredReturn = {
        retryRequired: true,
        reason: `Malformed JSON response: ${e.message}`,
      };
      return retryRequired;
    }

    contentForStorage = sanitizationResult.sanitized;

    let continuationResult;
    try {
      continuationResult = deps.determineContinuation({
        finishReasonContinue: isDialecticContinueReason(resolvedFinish),
        wasStructurallyFixed: sanitizationResult.wasStructurallyFixed,
        parsedContent,
        continueUntilComplete: params.continueUntilComplete,
        documentKey: params.documentKey,
        contextForDocuments: params.contextForDocuments,
        sourceObject: params.sourceObject,
      });
    } catch (e: unknown) {
      if (!(e instanceof Error)) throw e;
      const errorReturn: PrepareResponseContentErrorReturn = {
        error: new PrepareResponseContentContinuationError({
          jobId: params.jobId,
          thrownValue: e.message,
        }),
        retriable: false,
      };
      return errorReturn;
    }

    shouldContinue = continuationResult.shouldContinue;
  }

  const needsContinuation: boolean = params.continueUntilComplete && shouldContinue;

  const prepared: PrepareResponseContentPreparedReturn = {
    retryRequired: false,
    contentForStorage,
    shouldContinue,
    needsContinuation,
    resolvedFinishReason: resolvedFinish,
    isIntermediate,
  };
  return prepared;
};
