import { isIAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.guard.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { StreamRequestDeps } from "./streamRequest.interface.ts";

export function isStreamRequestDeps(
  value: unknown,
): value is StreamRequestDeps {
  if (!isRecord(value)) {
    return false;
  }
  const requiredKeys: (keyof StreamRequestDeps)[] = [
    "logger",
    "adminTokenWalletService",
    "getAiProviderAdapter",
    "prepareChatContext",
    "streamChat",
    "streamRewind",
    "createErrorResponse",
    "countTokens",
    "debitTokens",
    "getMaxOutputTokens",
    "findOrCreateChat",
    "constructMessageHistory",
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
  if (typeof value.getAiProviderAdapter !== "function") {
    return false;
  }
  if (typeof value.prepareChatContext !== "function") {
    return false;
  }
  if (typeof value.streamChat !== "function") {
    return false;
  }
  if (typeof value.streamRewind !== "function") {
    return false;
  }
  if (typeof value.createErrorResponse !== "function") {
    return false;
  }
  if (typeof value.countTokens !== "function") {
    return false;
  }
  if (typeof value.debitTokens !== "function") {
    return false;
  }
  if (typeof value.getMaxOutputTokens !== "function") {
    return false;
  }
  if (typeof value.findOrCreateChat !== "function") {
    return false;
  }
  if (typeof value.constructMessageHistory !== "function") {
    return false;
  }
  return true;
}
