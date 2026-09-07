import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isAiModelExtendedConfig, isChatApiRequest, isSelectedAiProvider } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isDialecticJobRow } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isUserConfig } from "../calculateAffordability/calculateAffordability.provides.ts";
import type {
  AiStreamEventBody,
  AiStreamEventData,
  EnqueueModelCallDeps,
  EnqueueModelCallErrorReturn,
  EnqueueModelCallEventSizeErrorReturn,
  EnqueueModelCallJobRowErrorReturn,
  EnqueueModelCallParams,
  EnqueueModelCallPayload,
  EnqueueModelCallPreparationErrorReturn,
  EnqueueModelCallPreparationFailure,
  EnqueueModelCallQueueFailure,
  EnqueueModelCallQueueRejectedErrorReturn,
  EnqueueModelCallQueueUnreachableErrorReturn,
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
  return true;
}

export function isEnqueueModelCallPayload(
  v: unknown,
): v is EnqueueModelCallPayload {
  if (!isRecord(v)) {
    return false;
  }
  const keys: (keyof EnqueueModelCallPayload)[] = [
    "job",
    "providerRow",
    "userConfig",
    "chatApiRequest",
    "preflightInputTokens",
  ];
  for (let i = 0; i < keys.length; i++) {
    const key: keyof EnqueueModelCallPayload = keys[i];
    if (!(key in v)) {
      return false;
    }
  }
  if (!isDialecticJobRow(v.job)) {
    return false;
  }
  if (!isSelectedAiProvider(v.providerRow)) {
    return false;
  }
  if (!isUserConfig(v.userConfig)) {
    return false;
  }
  if (!isChatApiRequest(v.chatApiRequest)) {
    return false;
  }
  if (typeof v.preflightInputTokens !== "number") {
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
  if (!("queued" in v) || v.queued !== true) {
    return false;
  }
  if (!("jobId" in v) || typeof v.jobId !== "string") {
    return false;
  }
  if (!("sig" in v) || typeof v.sig !== "string") {
    return false;
  }
  if (!("preflightInputTokens" in v) || typeof v.preflightInputTokens !== "number") {
    return false;
  }
  if (!("eventBodyBytes" in v) || typeof v.eventBodyBytes !== "number") {
    return false;
  }
  if (!("queueStatus" in v) || typeof v.queueStatus !== "number") {
    return false;
  }
  return true;
}

export function isEnqueueModelCallPreparationFailure(
  v: unknown,
): v is EnqueueModelCallPreparationFailure {
  return (
    v === "provider_config_invalid" ||
    v === "api_key_missing" ||
    v === "job_user_id_missing" ||
    v === "job_signature_failed" ||
    v === "job_payload_invalid" ||
    v === "composed_payload_not_json"
  );
}

export function isEnqueueModelCallQueueFailure(
  v: unknown,
): v is EnqueueModelCallQueueFailure {
  return v === "queue_rejected" || v === "queue_unreachable";
}

export function isEnqueueModelCallPreparationErrorReturn(
  v: unknown,
): v is EnqueueModelCallPreparationErrorReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!("failure" in v) || !isEnqueueModelCallPreparationFailure(v.failure)) {
    return false;
  }
  if (!("error" in v) || !(v.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in v) || v.retriable !== false) {
    return false;
  }
  return true;
}

export function isEnqueueModelCallJobRowErrorReturn(
  v: unknown,
): v is EnqueueModelCallJobRowErrorReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!("failure" in v) || v.failure !== "job_row_update_failed") {
    return false;
  }
  if (!("error" in v) || !(v.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in v) || v.retriable !== true) {
    return false;
  }
  return true;
}

export function isEnqueueModelCallEventSizeErrorReturn(
  v: unknown,
): v is EnqueueModelCallEventSizeErrorReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!("failure" in v) || v.failure !== "event_body_too_large") {
    return false;
  }
  if (!("error" in v) || !(v.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in v) || v.retriable !== false) {
    return false;
  }
  if (!("eventBodyBytes" in v) || typeof v.eventBodyBytes !== "number") {
    return false;
  }
  if (!("limitBytes" in v) || typeof v.limitBytes !== "number") {
    return false;
  }
  return true;
}

export function isEnqueueModelCallQueueRejectedErrorReturn(
  v: unknown,
): v is EnqueueModelCallQueueRejectedErrorReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!("failure" in v) || v.failure !== "queue_rejected") {
    return false;
  }
  if (!("error" in v) || !(v.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in v) || v.retriable !== true) {
    return false;
  }
  if (!("queueStatus" in v) || typeof v.queueStatus !== "number") {
    return false;
  }
  return true;
}

export function isEnqueueModelCallQueueUnreachableErrorReturn(
  v: unknown,
): v is EnqueueModelCallQueueUnreachableErrorReturn {
  if (!isRecord(v)) {
    return false;
  }
  if (!("failure" in v) || v.failure !== "queue_unreachable") {
    return false;
  }
  if (!("error" in v) || !(v.error instanceof Error)) {
    return false;
  }
  if (!("retriable" in v) || v.retriable !== true) {
    return false;
  }
  return true;
}

export function isEnqueueModelCallErrorReturn(
  v: unknown,
): v is EnqueueModelCallErrorReturn {
  if (isEnqueueModelCallPreparationErrorReturn(v)) {
    return true;
  }
  if (isEnqueueModelCallJobRowErrorReturn(v)) {
    return true;
  }
  if (isEnqueueModelCallEventSizeErrorReturn(v)) {
    return true;
  }
  if (isEnqueueModelCallQueueRejectedErrorReturn(v)) {
    return true;
  }
  if (isEnqueueModelCallQueueUnreachableErrorReturn(v)) {
    return true;
  }
  return false;
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
  if (!("model_config" in v) || !isAiModelExtendedConfig(v.model_config)) {
    return false;
  }
  if (!("chat_api_request" in v) || !isChatApiRequest(v.chat_api_request)) {
    return false;
  }
  if (!("sig" in v) || typeof v.sig !== "string") {
    return false;
  }
  if (!("user_config" in v) || !isUserConfig(v.user_config)) {
    return false;
  }
  return true;
}

export function isAiStreamEventBody(v: unknown): v is AiStreamEventBody {
  if (!isRecord(v)) {
    return false;
  }
  if (!("eventName" in v) || v.eventName !== "ai-stream-background") {
    return false;
  }
  if (!("data" in v) || !isAiStreamEventData(v.data)) {
    return false;
  }
  return true;
}
