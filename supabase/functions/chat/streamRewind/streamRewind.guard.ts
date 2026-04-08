import { isIAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.guard.ts";
import { isChatApiRequest } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  StreamRewindDeps,
  StreamRewindPayload,
  StreamRewindReturn,
} from "./streamRewind.interface.ts";

export function isStreamRewindDeps(value: unknown): value is StreamRewindDeps {
  if (!isRecord(value)) {
    return false;
  }
  const requiredKeys: (keyof StreamRewindDeps)[] = [
    "logger",
    "adminTokenWalletService",
    "countTokens",
    "debitTokens",
    "createErrorResponse",
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
  if (typeof value.getMaxOutputTokens !== "function") {
    return false;
  }
  return true;
}

export function isStreamRewindPayload(
  value: unknown,
): value is StreamRewindPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!("requestBody" in value)) {
    return false;
  }
  return isChatApiRequest(value.requestBody);
}

export function isStreamRewindReturn(
  value: unknown,
): value is StreamRewindReturn {
  return value instanceof Response || value instanceof Error;
}
