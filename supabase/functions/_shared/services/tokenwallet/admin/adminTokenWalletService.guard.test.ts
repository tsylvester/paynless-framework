import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isIAdminTokenWalletService } from "./adminTokenWalletService.guard.ts";
import type {
  IAdminTokenWalletService,
  RecordTransactionParams,
} from "./adminTokenWalletService.interface.ts";
import type {
  TokenWallet,
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

Deno.test(
  "isIAdminTokenWalletService accepts admin implementors and rejects null, empty object, and user-scoped shapes",
  () => {
    const validAdminTokenWalletService: IAdminTokenWalletService = {
      async createWallet(
        _userId?: string,
        _organizationId?: string,
      ): Promise<TokenWallet> {
        return {
          walletId: "00000000-0000-4000-8000-000000000020",
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
          transactionId: "00000000-0000-4000-8000-000000000021",
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

    const userTokenWalletServiceLike = {
      getWallet: async (_walletId: string) => null,
      getWalletForContext: async () => null,
      getWalletByIdAndUser: async () => null,
      getBalance: async (_walletId: string) => "0",
      checkBalance: async (_walletId: string, _amountToSpend: string) => true,
      getTransactionHistory: async () => ({
        transactions: [],
        totalCount: 0,
      }),
    };

    assertEquals(isIAdminTokenWalletService(validAdminTokenWalletService), true);
    assertEquals(isIAdminTokenWalletService(null), false);
    assertEquals(isIAdminTokenWalletService({}), false);
    assertEquals(isIAdminTokenWalletService(userTokenWalletServiceLike), false);
  },
);
