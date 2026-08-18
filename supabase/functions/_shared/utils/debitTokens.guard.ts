import type {
  DebitTokensSuccess,
  DebitTokensError,
} from "./debitTokens.interface.ts";
import { isRecord } from "./type-guards/type_guards.common.ts";

export function isDebitTokensSuccess(value: unknown): value is DebitTokensSuccess {
  if (!isRecord(value)) return false;
  if (value.transactionRecordedSuccessfully !== true) return false;
  if (!isRecord(value.result)) return false;
  if (!("userMessage" in value.result)) return false;
  if (!("assistantMessage" in value.result)) return false;
  return true;
}

export function isDebitTokensError(value: unknown): value is DebitTokensError {
  if (!isRecord(value)) return false;
  if ("transactionRecordedSuccessfully" in value) return false;
  if (!(value.error instanceof Error)) return false;
  if (typeof value.retriable !== "boolean") return false;
  return true;
}
