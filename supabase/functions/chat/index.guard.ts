import { isIAdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.guard.ts";
import { isIUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.guard.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";
import { ChatDeps } from "./index.interface.ts";

export function isChatDeps(value: unknown): value is ChatDeps {
  if (!isRecord(value)) {
    return false;
  }
  const requiredKeys: (keyof ChatDeps)[] = [
    "logger",
    "adminTokenWalletService",
    "userTokenWalletService",
    "streamRequest",
    "handleCorsPreflightRequest",
    "createSuccessResponse",
    "createErrorResponse",
    "prepareChatContext",
    "countTokens",
    "debitTokens",
    "getMaxOutputTokens",
    "findOrCreateChat",
    "constructMessageHistory",
    "getAiProviderAdapter",
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
  if (!isIUserTokenWalletService(value.userTokenWalletService)) {
    return false;
  }
  if (typeof value.streamRequest !== "function") {
    return false;
  }
  if (typeof value.handleCorsPreflightRequest !== "function") {
    return false;
  }
  if (typeof value.createSuccessResponse !== "function") {
    return false;
  }
  if (typeof value.createErrorResponse !== "function") {
    return false;
  }
  if (typeof value.prepareChatContext !== "function") {
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
  if (typeof value.getAiProviderAdapter !== "function") {
    return false;
  }
  return true;
}
