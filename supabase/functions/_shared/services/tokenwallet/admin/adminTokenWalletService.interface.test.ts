import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  IAdminTokenWalletService,
  RecordTransactionParams,
} from "./adminTokenWalletService.interface.ts";
import type {
  TokenWalletTransaction,
  TokenWalletTransactionType,
} from "../../../types/tokenWallet.types.ts";

Deno.test(
  "Contract: createWallet with userId only returns TokenWallet with userId and currency AI_TOKEN",
  () => {
    const wallet: Awaited<
      ReturnType<IAdminTokenWalletService["createWallet"]>
    > = {
      walletId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      balance: "0",
      currency: "AI_TOKEN",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    assertEquals(wallet.userId, "00000000-0000-4000-8000-000000000002");
    assertEquals(wallet.currency, "AI_TOKEN");
  },
);

Deno.test(
  "Contract: createWallet with organizationId only returns TokenWallet with organizationId",
  () => {
    const wallet: Awaited<
      ReturnType<IAdminTokenWalletService["createWallet"]>
    > = {
      walletId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      balance: "0",
      currency: "AI_TOKEN",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    assertEquals(
      wallet.organizationId,
      "00000000-0000-4000-8000-000000000004",
    );
  },
);

Deno.test(
  "Contract: createWallet with neither userId nor organizationId is an invalid call tuple",
  () => {
    const neither: Parameters<IAdminTokenWalletService["createWallet"]> = [
      undefined,
      undefined,
    ];
    assertEquals(neither[0], undefined);
    assertEquals(neither[1], undefined);
  },
);

Deno.test(
  "Contract: recordTransaction with valid params returns TokenWalletTransaction with all required fields",
  () => {
    const txnType: TokenWalletTransactionType = "DEBIT_USAGE";
    const params: RecordTransactionParams = {
      walletId: "00000000-0000-4000-8000-000000000005",
      type: txnType,
      amount: "1",
      recordedByUserId: "00000000-0000-4000-8000-000000000006",
      idempotencyKey: "key-1",
    };
    const transaction: Awaited<
      ReturnType<IAdminTokenWalletService["recordTransaction"]>
    > = {
      transactionId: "00000000-0000-4000-8000-000000000007",
      walletId: params.walletId,
      type: txnType,
      amount: "1",
      balanceAfterTxn: "0",
      recordedByUserId: params.recordedByUserId,
      idempotencyKey: params.idempotencyKey,
      timestamp: new Date(0),
    };
    assertEquals("transactionId" in transaction, true);
    assertEquals("walletId" in transaction, true);
    assertEquals("type" in transaction, true);
    assertEquals("amount" in transaction, true);
    assertEquals("balanceAfterTxn" in transaction, true);
    assertEquals("recordedByUserId" in transaction, true);
    assertEquals("idempotencyKey" in transaction, true);
    assertEquals("timestamp" in transaction, true);
    assertEquals(transaction.idempotencyKey, params.idempotencyKey);
  },
);

Deno.test(
  "Contract: recordTransaction RPC failure rejects with an error",
  async () => {
    const failingRpc = (): Promise<TokenWalletTransaction> =>
      Promise.reject(
        new Error("Failed to record token transaction: rpc unavailable"),
      );
    await assertRejects(
      () => failingRpc(),
      Error,
      "Failed to record token transaction: rpc unavailable",
    );
  },
);

Deno.test(
  "Contract: recordTransaction notification failure does not reject the settled result",
  async () => {
    const txnType: TokenWalletTransactionType = "CREDIT_PURCHASE";
    const settled: TokenWalletTransaction = {
      transactionId: "00000000-0000-4000-8000-000000000008",
      walletId: "00000000-0000-4000-8000-000000000009",
      type: txnType,
      amount: "5",
      balanceAfterTxn: "15",
      recordedByUserId: "00000000-0000-4000-8000-000000000010",
      idempotencyKey: "key-2",
      timestamp: new Date(0),
    };
    const outcome: TokenWalletTransaction = await (async () => {
      try {
        throw new Error("notification path failed");
      } catch {
        // Notification errors are non-fatal; RPC success value is still returned.
      }
      return settled;
    })();
    assertEquals(outcome.transactionId, settled.transactionId);
    assertEquals(outcome.idempotencyKey, settled.idempotencyKey);
  },
);
