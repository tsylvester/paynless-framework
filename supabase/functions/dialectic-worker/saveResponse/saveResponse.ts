import type {
  SaveResponseDeps,
  SaveResponseErrorReturn,
  SaveResponseParams,
  SaveResponsePayload,
  SaveResponseReturn,
  SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";
import type {
  AssembleAiResponseParams,
  AssembleAiResponsePayload,
} from "../assembleAiResponse/assembleAiResponse.provides.ts";
import type {
  DebitForResponseParams,
  DebitForResponsePayload,
} from "../debitForResponse/debitForResponse.provides.ts";
import type {
  PrepareResponseContentParams,
  PrepareResponseContentPayload,
} from "../prepareResponseContent/prepareResponseContent.provides.ts";
import type { SaveContributionResponseParams } from "../saveContributionResponse/saveContributionResponse.provides.ts";
import type { SaveCompressedResponseParams } from "../saveCompressedResponse/saveCompressedResponse.provides.ts";
import type { RetryJobParams, RetryJobPayload } from "../retryJob/retryJob.provides.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import { isDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import type {
  DialecticExecuteJobPayload,
  FailedAttemptError,
  ContentToInclude,
} from "../../dialectic-service/dialectic.interface.ts";
import {
  isDialecticExecuteJobPayload,
  isContentToInclude,
} from "../../_shared/utils/type-guards/type_guards.dialectic.ts";

export async function saveResponse(
  deps: SaveResponseDeps,
  params: SaveResponseParams,
  payload: SaveResponsePayload,
): Promise<SaveResponseReturn> {
  const ctxResult = await deps.loadJobContext(
    { dbClient: params.dbClient },
    { jobId: params.job_id },
  );
  if ("error" in ctxResult) {
    const out: SaveResponseErrorReturn = {
      error: ctxResult.error,
      retriable: ctxResult.retriable,
    };
    return out;
  }

  if (ctxResult.job.job_type === "EXECUTE") {
    let executePayload: DialecticExecuteJobPayload;
    try {
      if (isDialecticExecuteJobPayload(ctxResult.job.payload)) {
        executePayload = ctxResult.job.payload;
      } else {
        throw new Error("unreachable");
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        const out: SaveResponseErrorReturn = { error: e, retriable: false };
        return out;
      }
      const err: Error = new Error(String(e));
      const out: SaveResponseErrorReturn = { error: err, retriable: false };
      return out;
    }

    const assembleParams: AssembleAiResponseParams = {
      processingTimeMs: payload.processingTimeMs,
      modelConfig: ctxResult.modelConfig,
    };
    if (executePayload.preflight_input_tokens !== undefined) {
      assembleParams.preflightInputTokens = executePayload.preflight_input_tokens;
    }
    const assemblePayload: AssembleAiResponsePayload = {
      assembledContent: payload.assembled_content,
      tokenUsage: payload.token_usage,
      finishReason: payload.finish_reason,
    };
    const assembleResult = deps.assembleAiResponse(assembleParams, assemblePayload);
    if ("error" in assembleResult) {
      const out: SaveResponseErrorReturn = {
        error: assembleResult.error,
        retriable: assembleResult.retriable,
      };
      return out;
    }

    const debitParams: DebitForResponseParams = {
      dbClient: params.dbClient,
      jobId: params.job_id,
      walletId: ctxResult.walletId,
      providerRow: ctxResult.providerRow,
      modelConfig: ctxResult.modelConfig,
      projectOwnerUserId: ctxResult.job.user_id,
    };
    const debitPayload: DebitForResponsePayload = {
      aiResponse: assembleResult.aiResponse,
    };
    const debitResult = await deps.debitForResponse(debitParams, debitPayload);
    if ("error" in debitResult) {
      const out: SaveResponseErrorReturn = {
        error: debitResult.error,
        retriable: debitResult.retriable,
      };
      return out;
    }

    const prepareParams: PrepareResponseContentParams = {
      jobId: params.job_id,
      continueUntilComplete: executePayload.continueUntilComplete === true,
      documentKey: executePayload.document_key,
      contextForDocuments: undefined,
      sourceObject: undefined,
    };
    if (
      executePayload.context_for_documents !== null &&
      executePayload.context_for_documents !== undefined
    ) {
      prepareParams.contextForDocuments = executePayload.context_for_documents;
    }
    const preparePayload: PrepareResponseContentPayload = {
      aiResponse: assembleResult.aiResponse,
    };
    const prepareResult = deps.prepareResponseContent(prepareParams, preparePayload);
    if ("error" in prepareResult) {
      const out: SaveResponseErrorReturn = {
        error: prepareResult.error,
        retriable: prepareResult.retriable,
      };
      return out;
    }
    if (prepareResult.retryRequired === true) {
      const failedAttempt: FailedAttemptError = {
        modelId: ctxResult.providerRow.id,
        api_identifier: ctxResult.providerRow.api_identifier,
        error: prepareResult.reason,
        processingTimeMs: assembleResult.aiResponse.processingTimeMs,
      };
      const retryParams: RetryJobParams = {
        dbClient: params.dbClient,
        job: ctxResult.job,
      };
      const retryPayload: RetryJobPayload = {
        failedAttempts: [failedAttempt],
      };
      await deps.retryJob(retryParams, retryPayload);
      const out: SaveResponseSuccessReturn = { status: "completed" };
      return out;
    }

    const contributionParams: SaveContributionResponseParams = {
      dbClient: params.dbClient,
      job: ctxResult.job,
      providerRow: ctxResult.providerRow,
      modelConfig: ctxResult.modelConfig,
      assembledResponse: assembleResult.aiResponse,
      preparedContentResult: prepareResult,
    };
    const contributionResult = await deps.saveContributionResponse(
      contributionParams,
      executePayload,
    );
    if ("error" in contributionResult) {
      const out: SaveResponseErrorReturn = {
        error: contributionResult.error,
        retriable: contributionResult.retriable,
      };
      return out;
    }
    const out: SaveResponseSuccessReturn = { status: contributionResult.status };
    return out;
  }

  if (ctxResult.job.job_type === "COMPRESS") {
    let compressPayload: DialecticCompressJobPayload;
    try {
      if (isDialecticCompressJobPayload(ctxResult.job.payload)) {
        compressPayload = ctxResult.job.payload;
      } else {
        throw new Error("unreachable");
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        const out: SaveResponseErrorReturn = { error: e, retriable: false };
        return out;
      }
      const err: Error = new Error(String(e));
      const out: SaveResponseErrorReturn = { error: err, retriable: false };
      return out;
    }

    let sourceObject: ContentToInclude;
    try {
      const parsed: unknown = JSON.parse(compressPayload.content);
      if (!isContentToInclude(parsed)) {
        throw new Error("COMPRESS payload content is not a source object");
      }
      sourceObject = parsed;
    } catch {
      const err: Error = new Error(
        "COMPRESS payload content is not a source object",
      );
      const out: SaveResponseErrorReturn = { error: err, retriable: false };
      return out;
    }

    const assembleParams: AssembleAiResponseParams = {
      processingTimeMs: payload.processingTimeMs,
      modelConfig: ctxResult.modelConfig,
    };
    if (compressPayload.preflight_input_tokens !== undefined) {
      assembleParams.preflightInputTokens = compressPayload.preflight_input_tokens;
    }
    const assemblePayload: AssembleAiResponsePayload = {
      assembledContent: payload.assembled_content,
      tokenUsage: payload.token_usage,
      finishReason: payload.finish_reason,
    };
    const assembleResult = deps.assembleAiResponse(assembleParams, assemblePayload);
    if ("error" in assembleResult) {
      const out: SaveResponseErrorReturn = {
        error: assembleResult.error,
        retriable: assembleResult.retriable,
      };
      return out;
    }

    const debitParams: DebitForResponseParams = {
      dbClient: params.dbClient,
      jobId: params.job_id,
      walletId: ctxResult.walletId,
      providerRow: ctxResult.providerRow,
      modelConfig: ctxResult.modelConfig,
      projectOwnerUserId: ctxResult.job.user_id,
    };
    const debitPayload: DebitForResponsePayload = {
      aiResponse: assembleResult.aiResponse,
    };
    const debitResult = await deps.debitForResponse(debitParams, debitPayload);
    if ("error" in debitResult) {
      const out: SaveResponseErrorReturn = {
        error: debitResult.error,
        retriable: debitResult.retriable,
      };
      return out;
    }

    const prepareParams: PrepareResponseContentParams = {
      jobId: params.job_id,
      continueUntilComplete: compressPayload.continueUntilComplete === true,
      documentKey: compressPayload.documentKey,
      mode: compressPayload.mode,
      contextForDocuments: undefined,
      sourceObject: sourceObject,
    };
    const preparePayload: PrepareResponseContentPayload = {
      aiResponse: assembleResult.aiResponse,
    };
    const prepareResult = deps.prepareResponseContent(prepareParams, preparePayload);
    if ("error" in prepareResult) {
      const out: SaveResponseErrorReturn = {
        error: prepareResult.error,
        retriable: prepareResult.retriable,
      };
      return out;
    }
    if (prepareResult.retryRequired === true) {
      const failedAttempt: FailedAttemptError = {
        modelId: ctxResult.providerRow.id,
        api_identifier: ctxResult.providerRow.api_identifier,
        error: prepareResult.reason,
        processingTimeMs: assembleResult.aiResponse.processingTimeMs,
      };
      const retryParams: RetryJobParams = {
        dbClient: params.dbClient,
        job: ctxResult.job,
      };
      const retryPayload: RetryJobPayload = {
        failedAttempts: [failedAttempt],
      };
      await deps.retryJob(retryParams, retryPayload);
      const out: SaveResponseSuccessReturn = { status: "completed" };
      return out;
    }

    const compressedParams: SaveCompressedResponseParams = {
      dbClient: params.dbClient,
      job: ctxResult.job,
      providerRow: ctxResult.providerRow,
      assembledResponse: assembleResult.aiResponse,
      preparedContentResult: prepareResult,
    };
    const compressedResult = await deps.saveCompressedResponse(
      compressedParams,
      compressPayload,
    );
    if ("error" in compressedResult) {
      const out: SaveResponseErrorReturn = {
        error: compressedResult.error,
        retriable: compressedResult.retriable,
      };
      return out;
    }
    const out: SaveResponseSuccessReturn = { status: compressedResult.status };
    return out;
  }

  const err: Error = new Error(`Unknown job_type: ${ctxResult.job.job_type}`);
  const out: SaveResponseErrorReturn = { error: err, retriable: false };
  return out;
}
