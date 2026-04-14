import { isIAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.guard.ts";
import {
  isAiModelExtendedConfig,
  isChatApiRequest,
  isChatMessageRow,
  isFinishReason,
} from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  SseChatCompleteEvent,
  StreamChatDeps,
  StreamChatParams,
  StreamChatPayload,
  StreamChatReturn,
} from "./streamChat.interface.ts";

export function isStreamChatDeps(value: unknown): value is StreamChatDeps {
  if (!isRecord(value)) {
    return false;
  }
  const requiredKeys: (keyof StreamChatDeps)[] = [
    "logger",
    "adminTokenWalletService",
    "countTokens",
    "debitTokens",
    "createErrorResponse",
    "findOrCreateChat",
    "constructMessageHistory",
    "getMaxOutputTokens",
  ];
  for (const key of requiredKeys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (!isRecord(value.logger)) {
    return false;
  }
  const logger = value.logger;
  if (
    typeof logger.debug !== "function" ||
    typeof logger.info !== "function" ||
    typeof logger.warn !== "function" ||
    typeof logger.error !== "function"
  ) {
    return false;
  }
  if (!isIAdminTokenWalletService(value.adminTokenWalletService)) {
    return false;
  }
  if (typeof value.countTokens !== "function") {
    return false;
  }
  if (typeof value.debitTokens !== "function") {
    return false;
  }
  if (typeof value.createErrorResponse !== "function") {
    return false;
  }
  if (typeof value.findOrCreateChat !== "function") {
    return false;
  }
  if (typeof value.constructMessageHistory !== "function") {
    return false;
  }
  if (typeof value.getMaxOutputTokens !== "function") {
    return false;
  }
  return true;
}

export function isStreamChatParams(
  value: unknown,
): value is StreamChatParams {
  if (!isRecord(value)) {
    return false;
  }
  const requiredKeys: (keyof StreamChatParams)[] = [
    "supabaseClient",
    "userId",
    "wallet",
    "aiProviderAdapter",
    "modelConfig",
    "actualSystemPromptText",
    "finalSystemPromptIdForDb",
    "apiKey",
    "providerApiIdentifier",
  ];
  for (const key of requiredKeys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (
    !isRecord(value.supabaseClient) ||
    typeof value.supabaseClient.from !== "function"
  ) {
    return false;
  }
  if (typeof value.userId !== "string") {
    return false;
  }
  if (!isRecord(value.wallet)) {
    return false;
  }
  const wallet = value.wallet;
  if (typeof wallet.walletId !== "string") {
    return false;
  }
  if (typeof wallet.balance !== "string") {
    return false;
  }
  if (wallet.currency !== "AI_TOKEN") {
    return false;
  }
  if (!(wallet.createdAt instanceof Date)) {
    return false;
  }
  if (!(wallet.updatedAt instanceof Date)) {
    return false;
  }
  if (!isRecord(value.aiProviderAdapter)) {
    return false;
  }
  const adapter = value.aiProviderAdapter;
  if (typeof adapter.sendMessage !== "function") {
    return false;
  }
  if (typeof adapter.sendMessageStream !== "function") {
    return false;
  }
  if (typeof adapter.listModels !== "function") {
    return false;
  }
  if (!isAiModelExtendedConfig(value.modelConfig)) {
    return false;
  }
  const actualSystemPromptText = value.actualSystemPromptText;
  if (
    actualSystemPromptText !== null &&
    typeof actualSystemPromptText !== "string"
  ) {
    return false;
  }
  const finalSystemPromptIdForDb = value.finalSystemPromptIdForDb;
  if (
    finalSystemPromptIdForDb !== null &&
    typeof finalSystemPromptIdForDb !== "string"
  ) {
    return false;
  }
  if (typeof value.apiKey !== "string") {
    return false;
  }
  if (typeof value.providerApiIdentifier !== "string") {
    return false;
  }
  return true;
}

export function isStreamChatPayload(
  value: unknown,
): value is StreamChatPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("requestBody" in value)) {
    return false;
  }
  if (!("req" in value)) {
    return false;
  }
  if (!(value.req instanceof Request)) {
    return false;
  }
  return isChatApiRequest(value.requestBody);
}

export function isStreamChatReturn(value: unknown): value is StreamChatReturn {
  return value instanceof Response || value instanceof Error;
}

export function isSseChatCompleteEvent(
  value: unknown,
): value is SseChatCompleteEvent {
  if (!isRecord(value)) {
    return false;
  }
  if (value.type !== "chat_complete") {
    return false;
  }
  const requiredKeys: (keyof SseChatCompleteEvent)[] = [
    "type",
    "assistantMessage",
    "finish_reason",
    "timestamp",
  ];
  for (const key of requiredKeys) {
    if (!(key in value)) {
      return false;
    }
  }
  if (!isChatMessageRow(value.assistantMessage)) {
    return false;
  }
  if (value.finish_reason === null || value.finish_reason === undefined) {
    return false;
  }
  if (!isFinishReason(value.finish_reason)) {
    return false;
  }
  if (typeof value.timestamp !== "string") {
    return false;
  }
  return true;
}
