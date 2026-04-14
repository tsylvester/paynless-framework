import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  PrepareChatContextDeps,
  PrepareChatContextError,
  PrepareChatContextSuccess,
} from "./prepareChatContext.interface.ts";

export function isPrepareChatContextDeps(
  value: unknown,
): value is PrepareChatContextDeps {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !("logger" in value) ||
    !("userTokenWalletService" in value) ||
    !("getAiProviderAdapter" in value) ||
    !("supabaseClient" in value)
  ) {
    return false;
  }
  const loggerValue: unknown = value.logger;
  const userTokenWalletServiceValue: unknown = value.userTokenWalletService;
  const getAiProviderAdapterValue: unknown = value.getAiProviderAdapter;
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

  if (!isRecord(userTokenWalletServiceValue)) {
    return false;
  }
  if (
    typeof userTokenWalletServiceValue.getWalletByIdAndUser !== "function" ||
    typeof userTokenWalletServiceValue.getWalletForContext !== "function"
  ) {
    return false;
  }

  if (typeof getAiProviderAdapterValue !== "function") {
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

export function isPrepareChatContextSuccess(
  value: unknown,
): value is PrepareChatContextSuccess {
  if (!isRecord(value)) {
    return false;
  }
  if ("error" in value) {
    return false;
  }
  if (
    !("wallet" in value) ||
    !("aiProviderAdapter" in value) ||
    !("modelConfig" in value) ||
    !("actualSystemPromptText" in value) ||
    !("finalSystemPromptIdForDb" in value) ||
    !("apiKey" in value) ||
    !("providerApiIdentifier" in value)
  ) {
    return false;
  }
  const walletValue: unknown = value.wallet;
  const aiProviderAdapterValue: unknown = value.aiProviderAdapter;
  const modelConfigValue: unknown = value.modelConfig;
  const actualSystemPromptText: unknown = value.actualSystemPromptText;
  const finalSystemPromptIdForDb: unknown = value.finalSystemPromptIdForDb;
  const apiKey: unknown = value.apiKey;
  const providerApiIdentifier: unknown = value.providerApiIdentifier;

  if (!isRecord(walletValue)) {
    return false;
  }
  if (!isRecord(aiProviderAdapterValue)) {
    return false;
  }
  if (!isRecord(modelConfigValue)) {
    return false;
  }
  if (!(actualSystemPromptText === null || typeof actualSystemPromptText === "string")) {
    return false;
  }
  if (!(finalSystemPromptIdForDb === null || typeof finalSystemPromptIdForDb === "string")) {
    return false;
  }
  if (typeof apiKey !== "string") {
    return false;
  }
  if (typeof providerApiIdentifier !== "string") {
    return false;
  }

  return true;
}

export function isPrepareChatContextError(
  value: unknown,
): value is PrepareChatContextError {
  if (!isRecord(value)) {
    return false;
  }
  if (!("error" in value)) {
    return false;
  }
  const errorValue: unknown = value.error;
  if (!isRecord(errorValue)) {
    return false;
  }
  if (!("message" in errorValue) || !("status" in errorValue)) {
    return false;
  }
  if (typeof errorValue.message !== "string") {
    return false;
  }
  if (typeof errorValue.status !== "number") {
    return false;
  }
  return true;
}
