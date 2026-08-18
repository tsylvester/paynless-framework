import type {
  DebitForResponseDeps,
  DebitForResponseParams,
  DebitForResponsePayload,
  DebitForResponseSuccessReturn,
  DebitForResponseErrorReturn,
} from "./debitForResponse.interface.ts";
import {
  DebitForResponseWalletReadError,
  DebitForResponseWalletNotFoundError,
  DebitForResponseWalletCurrencyError,
  DebitForResponseWalletBalanceError,
  DebitForResponseTokenUsageError,
} from "./debitForResponse.interface.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isSelectedAiProvider, isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isUnifiedAIResponse } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";

export function isDebitForResponseDeps(value: unknown): value is DebitForResponseDeps {
  if (!isRecord(value)) return false;
  return typeof value.debitTokens === "function";
}

export function isDebitForResponseParams(value: unknown): value is DebitForResponseParams {
  if (!isRecord(value)) return false;
  if (!isRecord(value.dbClient)) return false;
  if (typeof value.jobId !== "string" || value.jobId.trim() === "") return false;
  if (typeof value.walletId !== "string" || value.walletId.trim() === "") return false;
  if (typeof value.projectOwnerUserId !== "string" || value.projectOwnerUserId.trim() === "") return false;
  if (!isSelectedAiProvider(value.providerRow)) return false;
  if (!isAiModelExtendedConfig(value.modelConfig)) return false;
  return true;
}

export function isDebitForResponsePayload(value: unknown): value is DebitForResponsePayload {
  if (!isRecord(value)) return false;
  if (!isUnifiedAIResponse(value.aiResponse)) return false;
  return true;
}

export function isDebitForResponseSuccessReturn(value: unknown): value is DebitForResponseSuccessReturn {
  if (!isRecord(value)) return false;
  if (value.debited !== true) return false;
  return true;
}

export function isDebitForResponseErrorReturn(value: unknown): value is DebitForResponseErrorReturn {
  if (!isRecord(value)) return false;
  if (!(value.error instanceof Error)) return false;
  if (typeof value.retriable !== "boolean") return false;
  return true;
}

export function isDebitForResponseWalletReadError(value: unknown): value is DebitForResponseWalletReadError {
  return value instanceof DebitForResponseWalletReadError;
}

export function isDebitForResponseWalletNotFoundError(value: unknown): value is DebitForResponseWalletNotFoundError {
  return value instanceof DebitForResponseWalletNotFoundError;
}

export function isDebitForResponseWalletCurrencyError(value: unknown): value is DebitForResponseWalletCurrencyError {
  return value instanceof DebitForResponseWalletCurrencyError;
}

export function isDebitForResponseWalletBalanceError(value: unknown): value is DebitForResponseWalletBalanceError {
  return value instanceof DebitForResponseWalletBalanceError;
}

export function isDebitForResponseTokenUsageError(value: unknown): value is DebitForResponseTokenUsageError {
  return value instanceof DebitForResponseTokenUsageError;
}
