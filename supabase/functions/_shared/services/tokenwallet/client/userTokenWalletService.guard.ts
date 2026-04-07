import { isRecord } from "../../../utils/type-guards/type_guards.common.ts";
import type { IUserTokenWalletService } from "./userTokenWalletService.interface.ts";

export function isIUserTokenWalletService(
  value: unknown,
): value is IUserTokenWalletService {
  if (!isRecord(value)) {
    return false;
  }
  if (!("getWallet" in value) || typeof value.getWallet !== "function") {
    return false;
  }
  if (
    !("getWalletForContext" in value) ||
    typeof value.getWalletForContext !== "function"
  ) {
    return false;
  }
  if (!("getBalance" in value) || typeof value.getBalance !== "function") {
    return false;
  }
  if (
    !("checkBalance" in value) ||
    typeof value.checkBalance !== "function"
  ) {
    return false;
  }
  if (
    !("getTransactionHistory" in value) ||
    typeof value.getTransactionHistory !== "function"
  ) {
    return false;
  }
  if (
    !("getWalletByIdAndUser" in value) ||
    typeof value.getWalletByIdAndUser !== "function"
  ) {
    return false;
  }
  return true;
}
