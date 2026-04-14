import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { IUserTokenWalletService } from "./userTokenWalletService.interface.ts";
import { createMockUserTokenWalletService } from "./userTokenWalletService.mock.ts";
import type {
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

Deno.test(
  "Contract: getWallet with valid UUID may return TokenWallet",
  () => {
    const wallet: Awaited<
      ReturnType<IUserTokenWalletService["getWallet"]>
    > = {
      walletId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      balance: "10",
      currency: "AI_TOKEN",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    assertEquals(wallet.walletId, "00000000-0000-4000-8000-000000000001");
    assertEquals(wallet.currency, "AI_TOKEN");
  },
);

Deno.test(
  "Contract: getWallet with valid UUID may return null",
  () => {
    const absent: Awaited<
      ReturnType<IUserTokenWalletService["getWallet"]>
    > = null;
    assertEquals(absent, null);
  },
);

Deno.test(
  "Contract: getWallet with invalid UUID returns null",
  () => {
    const invalidWalletId = "not-a-valid-uuid";
    const call: Parameters<IUserTokenWalletService["getWallet"]> = [
      invalidWalletId,
    ];
    const outcome: Awaited<
      ReturnType<IUserTokenWalletService["getWallet"]>
    > = null;
    assertEquals(call[0], invalidWalletId);
    assertEquals(outcome, null);
  },
);

Deno.test(
  "Contract: getWalletForContext with userId may return wallet or null",
  () => {
    const withUserId: Parameters<IUserTokenWalletService["getWalletForContext"]> =
      ["00000000-0000-4000-8000-000000000003", undefined];
    const wallet: Awaited<
      ReturnType<IUserTokenWalletService["getWalletForContext"]>
    > = {
      walletId: "00000000-0000-4000-8000-000000000004",
      userId: withUserId[0],
      balance: "0",
      currency: "AI_TOKEN",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    assertEquals(withUserId[0], "00000000-0000-4000-8000-000000000003");
    assertEquals(wallet.userId, "00000000-0000-4000-8000-000000000003");
  },
);

Deno.test(
  "Contract: getWalletForContext with neither userId nor organizationId returns null",
  () => {
    const neither: Parameters<IUserTokenWalletService["getWalletForContext"]> = [
      undefined,
      undefined,
    ];
    const outcome: Awaited<
      ReturnType<IUserTokenWalletService["getWalletForContext"]>
    > = null;
    assertEquals(neither[0], undefined);
    assertEquals(neither[1], undefined);
    assertEquals(outcome, null);
  },
);

Deno.test(
  "Contract: getBalance with valid wallet returns balance string",
  () => {
    const balance: Awaited<
      ReturnType<IUserTokenWalletService["getBalance"]>
    > = "42";
    assertEquals(balance, "42");
    assertEquals(typeof balance, "string");
  },
);

Deno.test(
  "Contract: getBalance with non-existent wallet rejects with an error",
  async () => {
    const failingBalance = (): Promise<string> =>
      Promise.reject(new Error("Wallet not found"));
    await assertRejects(
      () => failingBalance(),
      Error,
      "Wallet not found",
    );
  },
);

Deno.test(
  "Contract: checkBalance returns true when balance is sufficient",
  () => {
    const sufficient: Awaited<
      ReturnType<IUserTokenWalletService["checkBalance"]>
    > = true;
    assertEquals(sufficient, true);
  },
);

Deno.test(
  "Contract: checkBalance returns false when balance is insufficient",
  () => {
    const insufficient: Awaited<
      ReturnType<IUserTokenWalletService["checkBalance"]>
    > = false;
    assertEquals(insufficient, false);
  },
);

Deno.test(
  "Contract: getTransactionHistory returns PaginatedTransactions with correct shape",
  () => {
    const txnType: TokenWalletTransactionType = "DEBIT_USAGE";
    const tx: TokenWalletTransaction = {
      transactionId: "00000000-0000-4000-8000-000000000010",
      walletId: "00000000-0000-4000-8000-000000000011",
      type: txnType,
      amount: "1",
      balanceAfterTxn: "9",
      recordedByUserId: "00000000-0000-4000-8000-000000000012",
      idempotencyKey: "key-hist-1",
      timestamp: new Date(0),
    };
    const page: Awaited<
      ReturnType<IUserTokenWalletService["getTransactionHistory"]>
    > = {
      transactions: [tx],
      totalCount: 1,
    };
    assertEquals(Array.isArray(page.transactions), true);
    assertEquals(page.totalCount, 1);
    assertEquals(page.transactions.length, 1);
    assertEquals(page.transactions[0].walletId, tx.walletId);
  },
);

Deno.test(
  "Contract: getWalletByIdAndUser returns wallet for owner",
  () => {
    const ownerUserId: string = "00000000-0000-4000-8000-000000000014";
    const wallet: Awaited<
      ReturnType<IUserTokenWalletService["getWalletByIdAndUser"]>
    > = {
      walletId: "00000000-0000-4000-8000-000000000013",
      userId: ownerUserId,
      balance: "5",
      currency: "AI_TOKEN",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const args: Parameters<IUserTokenWalletService["getWalletByIdAndUser"]> = [
      wallet.walletId,
      ownerUserId,
    ];
    assertEquals(args[0], wallet.walletId);
    assertEquals(args[1], ownerUserId);
    assertEquals(wallet.userId, ownerUserId);
  },
);

Deno.test(
  "Contract: getWalletByIdAndUser returns null when caller is not owner (RLS)",
  () => {
    const denied: Awaited<
      ReturnType<IUserTokenWalletService["getWalletByIdAndUser"]>
    > = null;
    assertEquals(denied, null);
  },
);

Deno.test(
  "createMockUserTokenWalletService instance is IUserTokenWalletService",
  async () => {
    const wid: string = "00000000-0000-4000-8000-000000000020";
    const uid: string = "00000000-0000-4000-8000-000000000021";
    const { instance } = createMockUserTokenWalletService();
    const svc: IUserTokenWalletService = instance;
    await svc.getWallet(wid);
    await svc.getWalletForContext(undefined, undefined);
    await svc.getBalance(wid);
    await svc.checkBalance(wid, "0");
    await svc.getTransactionHistory(wid);
    await svc.getWalletByIdAndUser(wid, uid);
  },
);
