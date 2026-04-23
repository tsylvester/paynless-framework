import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type {
  AiStreamEventBody,
  AiStreamEventData,
  EnqueueModelCallDeps,
  EnqueueModelCallErrorReturn,
  EnqueueModelCallParams,
  EnqueueModelCallPayload,
  EnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.interface.ts";

export function isEnqueueModelCallDeps(
  v: unknown,
): v is EnqueueModelCallDeps {
  if (!isRecord(v)) {
    return false;
  }
  const keys: (keyof EnqueueModelCallDeps)[] = [
    "logger",
    "netlifyQueueUrl",
    "netlifyApiKey",
    "apiKeyForProvider",
    "computeJobSig",
  ];
  for (let i = 0; i < keys.length; i++) {
    const key: keyof EnqueueModelCallDeps = keys[i];
    if (!(key in v)) {
      return false;
    }
  }
  if (!isRecord(v.logger)) {
    return false;
  }
  if (typeof v.netlifyQueueUrl !== "string") {
    return false;
  }
  if (typeof v.netlifyApiKey !== "string") {
    return false;
  }
  if (typeof v.apiKeyForProvider !== "function") {
    return false;
  }
  if (typeof v.computeJobSig !== "function") {
    return false;
  }
  return true;
}

export function isEnqueueModelCallParams(
  v: unknown,
): v is EnqueueModelCallParams {
  if (!isRecord(v)) {
    return false;
  }
  const keys: (keyof EnqueueModelCallParams)[] = [
    "dbClient",
    "job",
    "providerRow",
    "userAuthToken",
    "output_type",
  ];
  for (let i = 0; i < keys.length; i++) {
    const key: keyof EnqueueModelCallParams = keys[i];
    if (!(key in v)) {
      return false;
    }
  }
  if (!isRecord(v.dbClient)) {
    return false;
  }
  if (!isRecord(v.job)) {
    return false;
  }
  if (!isRecord(v.providerRow)) {
    return false;
  }
  if (typeof v.userAuthToken !== "string") {
    return false;
  }
  if (typeof v.output_type !== "string") {
    return false;
  }
  return true;
}

export function isEnqueueModelCallPayload(
  v: unknown,
): v is EnqueueModelCallPayload {
  if (!isRecord(v)) {
    return false;
  }
  if (!("chatApiRequest" in v) || !isRecord(v.chatApiRequest)) {
    return false;
  }
  if (
    !("preflightInputTokens" in v) ||
    typeof v.preflightInputTokens !== "number"
  ) {
    return false;
  }
  return true;
}

export function isEnqueueModelCallSuccessReturn(
  v: unknown,
): v is EnqueueModelCallSuccessReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!("queued" in v)) {
    return false;
  }
  if (v.queued !== true) {
    return false;
  }
  return true;
}

export function isEnqueueModelCallErrorReturn(
  v: unknown,
): v is EnqueueModelCallErrorReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!("error" in v) || !(v.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in v) || typeof v.retriable !== "boolean") {
    return false;
  }
  return true;
}

export function isAiStreamEventData(v: unknown): v is AiStreamEventData {
  if (!isRecord(v)) {
    return false;
  }
  if (!("job_id" in v) || typeof v.job_id !== "string") {
    return false;
  }
  if (!("api_identifier" in v) || typeof v.api_identifier !== "string") {
    return false;
  }
  if (!("model_config" in v) || !isRecord(v.model_config)) {
    return false;
  }
  if (!("chat_api_request" in v) || !isRecord(v.chat_api_request)) {
    return false;
  }
  if (!("sig" in v) || typeof v.sig !== "string") {
    return false;
  }
  return true;
}

export function isAiStreamEventBody(v: unknown): v is AiStreamEventBody {
  if (!isRecord(v)) {
    return false;
  }
  if (!("eventName" in v) || v.eventName !== "ai-stream") {
    return false;
  }
  if (!("data" in v) || !isRecord(v.data)) {
    return false;
  }
  return true;
}
