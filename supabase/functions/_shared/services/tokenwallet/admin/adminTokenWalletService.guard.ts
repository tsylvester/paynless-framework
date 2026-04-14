import { isRecord } from "../../../utils/type-guards/type_guards.common.ts";
import type { IAdminTokenWalletService } from "./adminTokenWalletService.interface.ts";

export function isIAdminTokenWalletService(
  value: unknown,
): value is IAdminTokenWalletService {
  if (!isRecord(value)) {
    return false;
  }
  if (!("createWallet" in value) || typeof value.createWallet !== "function") {
    return false;
  }
  if (
    !("recordTransaction" in value) ||
    typeof value.recordTransaction !== "function"
  ) {
    return false;
  }
  return true;
}
