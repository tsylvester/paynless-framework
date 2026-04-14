import { isChatMessageRole } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  ConstructMessageHistoryDeps,
  ConstructMessageHistoryError,
  ConstructMessageHistoryParams,
  ConstructMessageHistoryPayload,
  ConstructMessageHistoryReturn,
  ConstructMessageHistorySuccess,
} from "./constructMessageHistory.interface.ts";

function isStringOrNullOrUndefined(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isConstructMessageHistoryHistoryEntry(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.content !== "string") {
    return false;
  }
  if (typeof value.role !== "string" || !isChatMessageRole(value.role)) {
    return false;
  }
  return true;
}

function isConstructMessageHistoryHistoryArray(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const item of value) {
    if (!isConstructMessageHistoryHistoryEntry(item)) {
      return false;
    }
  }
  return true;
}

function isConstructMessageHistorySelectedMessagesValue(
  value: unknown,
): boolean {
  if (value === undefined) {
    return true;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  for (const item of value) {
    if (!isConstructMessageHistoryHistoryEntry(item)) {
      return false;
    }
  }
  return true;
}

export function isConstructMessageHistoryDeps(
  value: unknown,
): value is ConstructMessageHistoryDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (!("logger" in value) || !("supabaseClient" in value)) {
    return false;
  }
  const loggerValue: unknown = value.logger;
  const supabaseClientValue: unknown = value.supabaseClient;
  if (!isRecord(loggerValue)) {
    return false;
  }
  if (
    typeof loggerValue.debug !== "function" ||
    typeof loggerValue.info !== "function" ||
    typeof loggerValue.warn !== "function" ||
    typeof loggerValue.error !== "function"
  ) {
    return false;
  }
  if (!isRecord(supabaseClientValue)) {
    return false;
  }
  if (typeof supabaseClientValue.from !== "function") {
    return false;
  }
  return true;
}

export function isConstructMessageHistoryParams(
  value: unknown,
): value is ConstructMessageHistoryParams {
  if (!isRecord(value)) {
    return false;
  }
  if (!("system_prompt_text" in value)) {
    return false;
  }
  const existingChatId: unknown = value.existingChatId;
  const systemPromptText: unknown = value.system_prompt_text;
  const rewindFromMessageId: unknown = value.rewindFromMessageId;
  if (!isStringOrNullOrUndefined(existingChatId)) {
    return false;
  }
  if (!(systemPromptText === null || typeof systemPromptText === "string")) {
    return false;
  }
  if (!isStringOrNullOrUndefined(rewindFromMessageId)) {
    return false;
  }
  return true;
}

export function isConstructMessageHistoryPayload(
  value: unknown,
): value is ConstructMessageHistoryPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("newUserMessageContent" in value)) {
    return false;
  }
  if (!("selectedMessages" in value)) {
    return false;
  }
  if (typeof value.newUserMessageContent !== "string") {
    return false;
  }
  return isConstructMessageHistorySelectedMessagesValue(value.selectedMessages);
}

export function isConstructMessageHistorySuccess(
  value: unknown,
): value is ConstructMessageHistorySuccess {
  if (!isRecord(value)) {
    return false;
  }
  if ("historyFetchError" in value) {
    return false;
  }
  if (!("history" in value)) {
    return false;
  }
  return isConstructMessageHistoryHistoryArray(value.history);
}

export function isConstructMessageHistoryError(
  value: unknown,
): value is ConstructMessageHistoryError {
  if (!isRecord(value)) {
    return false;
  }
  if (!("history" in value) || !("historyFetchError" in value)) {
    return false;
  }
  if (!(value.historyFetchError instanceof Error)) {
    return false;
  }
  return isConstructMessageHistoryHistoryArray(value.history);
}

export function isConstructMessageHistoryReturn(
  value: unknown,
): value is ConstructMessageHistoryReturn {
  return (
    isConstructMessageHistorySuccess(value) ||
    isConstructMessageHistoryError(value)
  );
}
