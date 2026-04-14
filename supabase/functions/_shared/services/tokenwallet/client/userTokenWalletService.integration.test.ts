import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  coreInitializeTestStep,
  initializeTestDeps,
  registerUndoAction,
} from "../../../_integration.test.utils.ts";
import type { TokenWallet } from "../../../types/tokenWallet.types.ts";
import { UserTokenWalletService } from "./userTokenWalletService.ts";

Deno.test("UserTokenWalletService integration", async (t) => {
  initializeTestDeps();

  async function setupSecondUserWallet(): Promise<
    { userId: string; wallet: TokenWallet }
  > {
    const { userId, userClient } = await coreCreateAndSetupTestUser(
      {},
      "local",
    );
    await coreEnsureTestUserAndWallet(userId, 0, "local");
    const svc: UserTokenWalletService = new UserTokenWalletService(userClient);
    const wallet: TokenWallet | null = await svc.getWalletForContext(userId);
    assertExists(wallet);
    return { userId, wallet };
  }

  await t.step("getWalletForContext with valid userId returns wallet", async () => {
    try {
      const { primaryUserId, primaryUserClient } = await coreInitializeTestStep(
        { initialWalletBalance: 0 },
        "local",
      );
      const svc: UserTokenWalletService = new UserTokenWalletService(
        primaryUserClient,
      );
      const wallet: TokenWallet | null = await svc.getWalletForContext(
        primaryUserId,
      );
      assertExists(wallet);
      assertEquals(wallet.userId, primaryUserId);
      assertEquals(wallet.currency, "AI_TOKEN");
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance returns correct string balance", async () => {
    try {
      const balanceValue: number = 7777;
      const { primaryUserId, primaryUserClient } = await coreInitializeTestStep(
        { initialWalletBalance: balanceValue },
        "local",
      );
      const svc: UserTokenWalletService = new UserTokenWalletService(
        primaryUserClient,
      );
      const wallet: TokenWallet | null = await svc.getWalletForContext(
        primaryUserId,
      );
      assertExists(wallet);
      const balance: string = await svc.getBalance(wallet.walletId);
      assertEquals(balance, String(balanceValue));
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getTransactionHistory returns paginated results", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } =
        await coreInitializeTestStep({ initialWalletBalance: 100 }, "local");
      const svc: UserTokenWalletService = new UserTokenWalletService(
        primaryUserClient,
      );
      const wallet: TokenWallet | null = await svc.getWalletForContext(
        primaryUserId,
      );
      assertExists(wallet);

      const tsOlder: string = "2024-01-10T12:00:00.000Z";
      const tsNewer: string = "2024-01-11T12:00:00.000Z";

      const { data: rows, error: insertError } = await adminClient
        .from("token_wallet_transactions")
        .insert([
          {
            wallet_id: wallet.walletId,
            transaction_type: "CREDIT_PURCHASE",
            amount: 50,
            balance_after_txn: 150,
            recorded_by_user_id: primaryUserId,
            idempotency_key: `integ-${crypto.randomUUID()}`,
            timestamp: tsOlder,
          },
          {
            wallet_id: wallet.walletId,
            transaction_type: "DEBIT_USAGE",
            amount: 20,
            balance_after_txn: 130,
            recorded_by_user_id: primaryUserId,
            idempotency_key: `integ-${crypto.randomUUID()}`,
            timestamp: tsNewer,
          },
        ])
        .select("transaction_id");

      assertEquals(insertError, null, insertError?.message ?? "");
      assertExists(rows);
      assertEquals(rows.length, 2);
      for (const row of rows) {
        registerUndoAction({
          type: "DELETE_CREATED_ROW",
          tableName: "token_wallet_transactions",
          criteria: { transaction_id: row.transaction_id },
          scope: "local",
        });
      }

      const page = await svc.getTransactionHistory(wallet.walletId, {
        limit: 10,
        offset: 0,
      });

      const insertedIds: string[] = rows.map((r) => r.transaction_id);
      const ours = page.transactions.filter((t) =>
        insertedIds.includes(t.transactionId)
      );
      assertEquals(ours.length, 2);
      assertEquals(page.totalCount >= 2, true);
      assertEquals(page.transactions.length >= 2, true);

      const debit = ours.find((t) => t.type === "DEBIT_USAGE");
      const credit = ours.find((t) => t.type === "CREDIT_PURCHASE");
      assertExists(debit);
      assertExists(credit);
      assertEquals(debit.amount, "20");
      assertEquals(credit.amount, "50");

      const idxDebit: number = page.transactions.findIndex((t) =>
        t.transactionId === debit.transactionId
      );
      const idxCredit: number = page.transactions.findIndex((t) =>
        t.transactionId === credit.transactionId
      );
      assertEquals(idxDebit >= 0, true);
      assertEquals(idxCredit >= 0, true);
      assertEquals(idxDebit < idxCredit, true);
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step(
    "RLS: user cannot read another user's wallet via getWalletByIdAndUser",
    async () => {
      try {
        const { primaryUserClient } = await coreInitializeTestStep(
          { initialWalletBalance: 0 },
          "local",
        );
        const userASvc: UserTokenWalletService = new UserTokenWalletService(
          primaryUserClient,
        );
        const other: { userId: string; wallet: TokenWallet } =
          await setupSecondUserWallet();
        const fetched: TokenWallet | null = await userASvc.getWalletByIdAndUser(
          other.wallet.walletId,
          other.userId,
        );
        assertEquals(fetched, null);
      } finally {
        await coreCleanupTestResources("local");
      }
    },
  );
});
