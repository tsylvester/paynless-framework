import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  IAdminTokenWalletService,
  RecordTransactionParams,
} from "../admin/adminTokenWalletService.interface.ts";
import { isIUserTokenWalletService } from "./userTokenWalletService.guard.ts";
import type { IUserTokenWalletService } from "./userTokenWalletService.interface.ts";
import type {
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

Deno.test(
  "isIUserTokenWalletService accepts user implementors and rejects null, empty object, and admin-scoped shapes",
  () => {
    const validUserTokenWalletService: IUserTokenWalletService = {
      async getWallet(_walletId: string) {
        return null;
      },
      async getWalletForContext(_userId?: string, _organizationId?: string) {
        return null;
      },
      async getBalance(_walletId: string) {
        return "0";
      },
      async checkBalance(_walletId: string, _amountToSpend: string) {
        return true;
      },
      async getTransactionHistory(_walletId: string, _params?) {
        return { transactions: [], totalCount: 0 };
      },
      async getWalletByIdAndUser(_walletId: string, _userId: string) {
        return null;
      },
    };

    const adminTokenWalletServiceLike: IAdminTokenWalletService = {
      async createWallet(
        _userId?: string,
        _organizationId?: string,
      ): Promise<TokenWallet> {
        return {
          walletId: "00000000-0000-4000-8000-000000000030",
          balance: "0",
          currency: "AI_TOKEN",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
      },
      async recordTransaction(
        params: RecordTransactionParams,
      ): Promise<TokenWalletTransaction> {
        const txnType: TokenWalletTransactionType = params.type;
        return {
          transactionId: "00000000-0000-4000-8000-000000000031",
          walletId: params.walletId,
          type: txnType,
          amount: params.amount,
          balanceAfterTxn: "0",
          recordedByUserId: params.recordedByUserId,
          idempotencyKey: params.idempotencyKey,
          timestamp: new Date(0),
        };
      },
    };

    assertEquals(isIUserTokenWalletService(validUserTokenWalletService), true);
    assertEquals(isIUserTokenWalletService(null), false);
    assertEquals(isIUserTokenWalletService({}), false);
    assertEquals(
      isIUserTokenWalletService(adminTokenWalletServiceLike),
      false,
    );
  },
);
