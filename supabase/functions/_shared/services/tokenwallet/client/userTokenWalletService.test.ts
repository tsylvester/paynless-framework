import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import {
  asSupabaseUserClientForTests,
  buildUserMockConfigGetBalance,
  buildUserMockConfigGetBalanceNotFound,
  buildUserMockConfigGetWalletForContextMaybeSingle,
  buildUserMockConfigGetWalletSelectSingle,
  buildUserMockConfigTransactionHistory,
  buildUserTokenTransactionRow,
  buildUserTokenWalletRow,
  userTokenWalletServiceTestIds,
} from "./userTokenWalletService.mock.ts";
import { UserTokenWalletService } from "./userTokenWalletService.ts";

const {
  walletIdA,
  walletIdB,
  userIdA,
  orgIdA,
  timestampIso: ts,
  userWithNoWallet: missingUser,
} = userTokenWalletServiceTestIds;

Deno.test("UserTokenWalletService getWallet — returns wallet for valid UUID when row exists", async () => {
  const row: ReturnType<typeof buildUserTokenWalletRow> = buildUserTokenWalletRow({
    walletId: walletIdA,
    userId: userIdA,
    organizationId: null,
    balance: 12345,
    currency: "AI_TOKEN",
    createdAt: ts,
    updatedAt: ts,
  });
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletSelectSingle(row),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWallet(walletIdA);
  assertExists(wallet);
  assertEquals(wallet.walletId, walletIdA);
  assertEquals(wallet.userId, userIdA);
  assertEquals(wallet.balance, "12345");
  assertEquals(wallet.currency, "AI_TOKEN");
});

Deno.test("UserTokenWalletService getWallet — returns null for invalid walletId format", async () => {
  const { client } = createMockSupabaseClient(userIdA, {});
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWallet("not-a-valid-uuid");
  assertEquals(wallet, null);
});

Deno.test("UserTokenWalletService getWallet — returns null when row not found (PGRST116 path)", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletSelectSingle(null),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWallet(walletIdA);
  assertEquals(wallet, null);
});

Deno.test("UserTokenWalletService getWallet — throws when Supabase returns non-PGRST116 error", async () => {
  const dbError: Error = new Error("database unavailable");
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletSelectSingle(null, { error: dbError }),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.getWallet(walletIdA);
    },
    Error,
    `Error fetching wallet ${walletIdA}: database unavailable`,
  );
});

Deno.test("UserTokenWalletService getWallet — returns organization wallet fields", async () => {
  const row: ReturnType<typeof buildUserTokenWalletRow> = buildUserTokenWalletRow({
    walletId: walletIdB,
    userId: null,
    organizationId: orgIdA,
    balance: 0,
    currency: "AI_TOKEN",
    createdAt: ts,
    updatedAt: ts,
  });
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletSelectSingle(row),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWallet(walletIdB);
  assertExists(wallet);
  assertEquals(wallet.organizationId, orgIdA);
  assertEquals(wallet.userId, undefined);
});

Deno.test("UserTokenWalletService getWalletForContext — returns null when neither userId nor organizationId", async () => {
  const { client } = createMockSupabaseClient(userIdA, {});
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletForContext(undefined, undefined);
  assertEquals(wallet, null);
});

Deno.test("UserTokenWalletService getWalletForContext — returns wallet for userId", async () => {
  const row: ReturnType<typeof buildUserTokenWalletRow> = buildUserTokenWalletRow({
    walletId: walletIdA,
    userId: userIdA,
    organizationId: null,
    balance: 0,
    currency: "AI_TOKEN",
    createdAt: ts,
    updatedAt: ts,
  });
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletForContextMaybeSingle(row),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletForContext(userIdA, undefined);
  assertExists(wallet);
  assertEquals(wallet.userId, userIdA);
});

Deno.test("UserTokenWalletService getWalletForContext — returns null when userId has no wallet", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletForContextMaybeSingle(null),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletForContext(missingUser, undefined);
  assertEquals(wallet, null);
});

Deno.test("UserTokenWalletService getWalletForContext — returns null on query error", async () => {
  const queryError: Error = new Error("query failed");
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletForContextMaybeSingle(null, { error: queryError }),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletForContext(userIdA, undefined);
  assertEquals(wallet, null);
});

Deno.test("UserTokenWalletService getWalletForContext — prioritizes organization when organizationId provided", async () => {
  const row: ReturnType<typeof buildUserTokenWalletRow> = buildUserTokenWalletRow({
    walletId: walletIdB,
    userId: null,
    organizationId: orgIdA,
    balance: 0,
    currency: "AI_TOKEN",
    createdAt: ts,
    updatedAt: ts,
  });
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletForContextMaybeSingle(row),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletForContext(userIdA, orgIdA);
  assertExists(wallet);
  assertEquals(wallet.organizationId, orgIdA);
});

Deno.test("UserTokenWalletService getBalance — returns string balance for existing wallet", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("12345"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const balance: string = await service.getBalance(walletIdA);
  assertEquals(balance, "12345");
});

Deno.test("UserTokenWalletService getBalance — returns zero string for zero balance", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("0"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const balance: string = await service.getBalance(walletIdA);
  assertEquals(balance, "0");
});

Deno.test("UserTokenWalletService getBalance — throws Wallet not found when no row", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalanceNotFound(),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.getBalance(walletIdA);
    },
    Error,
    "Wallet not found",
  );
});

Deno.test("UserTokenWalletService getBalance — throws on invalid walletId format", async () => {
  const { client } = createMockSupabaseClient(userIdA, {});
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.getBalance("this-is-not-a-uuid");
    },
    Error,
    "Invalid wallet ID format",
  );
});

Deno.test("UserTokenWalletService getBalance — throws when select returns error", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("0", { error: new Error("rls denied") }),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.getBalance(walletIdA);
    },
    Error,
    "Failed to fetch balance: rls denied",
  );
});

Deno.test("UserTokenWalletService getBalance — returns very large balance as string", async () => {
  const large: string = "9999999999999999999";
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance(large),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const balance: string = await service.getBalance(walletIdA);
  assertEquals(balance, large);
});

Deno.test("UserTokenWalletService checkBalance — true when balance exceeds spend", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("100"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const ok: boolean = await service.checkBalance(walletIdA, "50");
  assertEquals(ok, true);
});

Deno.test("UserTokenWalletService checkBalance — true when balance equals spend", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("100"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const ok: boolean = await service.checkBalance(walletIdA, "100");
  assertEquals(ok, true);
});

Deno.test("UserTokenWalletService checkBalance — false when balance is less than spend", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("100"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const ok: boolean = await service.checkBalance(walletIdA, "101");
  assertEquals(ok, false);
});

Deno.test("UserTokenWalletService checkBalance — false for zero balance when spend positive", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("0"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const ok: boolean = await service.checkBalance(walletIdA, "1");
  assertEquals(ok, false);
});

Deno.test("UserTokenWalletService checkBalance — true for spend amount zero", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("100"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const ok: boolean = await service.checkBalance(walletIdA, "0");
  assertEquals(ok, true);
});

Deno.test("UserTokenWalletService checkBalance — propagates Wallet not found from getBalance", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalanceNotFound(),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.checkBalance(walletIdA, "10");
    },
    Error,
    "Wallet not found",
  );
});

Deno.test("UserTokenWalletService checkBalance — throws on invalid walletId format", async () => {
  const { client } = createMockSupabaseClient(userIdA, {});
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.checkBalance("not-a-uuid", "10");
    },
    Error,
    "Invalid wallet ID format",
  );
});

Deno.test("UserTokenWalletService checkBalance — throws on non-numeric amountToSpend", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("100"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.checkBalance(walletIdA, "not-a-number");
    },
    Error,
    "Amount to spend must be a non-negative integer string",
  );
});

Deno.test("UserTokenWalletService checkBalance — throws on negative amountToSpend string", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("100"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.checkBalance(walletIdA, "-10");
    },
    Error,
    "Amount to spend must be a non-negative integer string",
  );
});

Deno.test("UserTokenWalletService checkBalance — large balances compare correctly (sufficient)", async () => {
  const large: string = "9999999999999999999";
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance(large),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const ok: boolean = await service.checkBalance(walletIdA, large);
  assertEquals(ok, true);
});

Deno.test("UserTokenWalletService checkBalance — large balances compare correctly (insufficient)", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetBalance("9999999999999999990"),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const ok: boolean = await service.checkBalance(
    walletIdA,
    "9999999999999999999",
  );
  assertEquals(ok, false);
});

Deno.test("UserTokenWalletService getTransactionHistory — maps rows and totalCount", async () => {
  const txRow: ReturnType<typeof buildUserTokenTransactionRow> =
    buildUserTokenTransactionRow({
      transactionId: "66666666-6666-4666-8666-666666666666",
      walletId: walletIdA,
      transactionType: "DEBIT_USAGE",
      amount: 10,
      balanceAfterTxn: 90,
      recordedByUserId: userIdA,
      idempotencyKey: "idem-1",
      timestamp: ts,
      notes: "n1",
      relatedEntityId: null,
      relatedEntityType: null,
      paymentTransactionId: null,
    });
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigTransactionHistory(1, [txRow]),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const page = await service.getTransactionHistory(walletIdA);
  assertEquals(page.totalCount, 1);
  assertEquals(page.transactions.length, 1);
  assertEquals(page.transactions[0].transactionId, txRow.transaction_id);
  assertEquals(page.transactions[0].walletId, walletIdA);
  assertEquals(page.transactions[0].amount, "10");
  assertEquals(page.transactions[0].idempotencyKey, "idem-1");
});

Deno.test("UserTokenWalletService getTransactionHistory — returns empty when count query errors", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigTransactionHistory(0, [], {
      countError: new Error("count failed"),
    }),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const page = await service.getTransactionHistory(walletIdA);
  assertEquals(page.transactions.length, 0);
  assertEquals(page.totalCount, 0);
});

Deno.test("UserTokenWalletService getTransactionHistory — returns empty transactions when data query errors", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigTransactionHistory(3, [], {
      dataError: new Error("select failed"),
    }),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const page = await service.getTransactionHistory(walletIdA);
  assertEquals(page.transactions.length, 0);
  assertEquals(page.totalCount, 3);
});

Deno.test("UserTokenWalletService getTransactionHistory — throws on invalid walletId", async () => {
  const { client } = createMockSupabaseClient(userIdA, {});
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.getTransactionHistory("bad-id");
    },
    Error,
    "Invalid input: walletId must be a valid UUID.",
  );
});

Deno.test("UserTokenWalletService getTransactionHistory — respects limit via range", async () => {
  const rows: ReturnType<typeof buildUserTokenTransactionRow>[] = [
    buildUserTokenTransactionRow({
      transactionId: "77777777-7777-4777-8777-777777777777",
      walletId: walletIdA,
      transactionType: "DEBIT_USAGE",
      amount: 1,
      balanceAfterTxn: 99,
      recordedByUserId: userIdA,
      idempotencyKey: "a",
      timestamp: ts,
      notes: "n",
      relatedEntityId: null,
      relatedEntityType: null,
      paymentTransactionId: null,
    }),
    buildUserTokenTransactionRow({
      transactionId: "88888888-8888-4888-8888-888888888888",
      walletId: walletIdA,
      transactionType: "DEBIT_USAGE",
      amount: 2,
      balanceAfterTxn: 98,
      recordedByUserId: userIdA,
      idempotencyKey: "b",
      timestamp: ts,
      notes: "n2",
      relatedEntityId: null,
      relatedEntityType: null,
      paymentTransactionId: null,
    }),
  ];
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigTransactionHistory(2, rows),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const page = await service.getTransactionHistory(walletIdA, { limit: 2, offset: 0 });
  assertEquals(page.transactions.length, 2);
  assertEquals(page.totalCount, 2);
});

Deno.test("UserTokenWalletService getTransactionHistory — fetchAll returns full row set from mock", async () => {
  const rows: ReturnType<typeof buildUserTokenTransactionRow>[] = [
    buildUserTokenTransactionRow({
      transactionId: "99999999-9999-4999-8999-999999999999",
      walletId: walletIdA,
      transactionType: "CREDIT_PURCHASE",
      amount: 5,
      balanceAfterTxn: 105,
      recordedByUserId: userIdA,
      idempotencyKey: "c",
      timestamp: ts,
      notes: null,
      relatedEntityId: null,
      relatedEntityType: null,
      paymentTransactionId: null,
    }),
  ];
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigTransactionHistory(1, rows),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const page = await service.getTransactionHistory(walletIdA, { fetchAll: true });
  assertEquals(page.transactions.length, 1);
  assertEquals(page.totalCount, 1);
});

Deno.test("UserTokenWalletService getWalletByIdAndUser — returns wallet for authorized row", async () => {
  const row: ReturnType<typeof buildUserTokenWalletRow> = buildUserTokenWalletRow({
    walletId: walletIdA,
    userId: userIdA,
    organizationId: null,
    balance: 0,
    currency: "AI_TOKEN",
    createdAt: ts,
    updatedAt: ts,
  });
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletSelectSingle(row),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletByIdAndUser(walletIdA, userIdA);
  assertExists(wallet);
  assertEquals(wallet.walletId, walletIdA);
  assertEquals(wallet.userId, userIdA);
});

Deno.test("UserTokenWalletService getWalletByIdAndUser — returns null when not found", async () => {
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletSelectSingle(null),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletByIdAndUser(walletIdA, userIdA);
  assertEquals(wallet, null);
});

Deno.test("UserTokenWalletService getWalletByIdAndUser — returns null for invalid walletId format", async () => {
  const { client } = createMockSupabaseClient(userIdA, {});
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletByIdAndUser("not-uuid", userIdA);
  assertEquals(wallet, null);
});

Deno.test("UserTokenWalletService getWalletByIdAndUser — returns org wallet for admin context", async () => {
  const row: ReturnType<typeof buildUserTokenWalletRow> = buildUserTokenWalletRow({
    walletId: walletIdB,
    userId: null,
    organizationId: orgIdA,
    balance: 0,
    currency: "AI_TOKEN",
    createdAt: ts,
    updatedAt: ts,
  });
  const { client } = createMockSupabaseClient(
    userIdA,
    buildUserMockConfigGetWalletSelectSingle(row),
  );
  const service: UserTokenWalletService = new UserTokenWalletService(
    asSupabaseUserClientForTests(client),
  );
  const wallet = await service.getWalletByIdAndUser(walletIdB, userIdA);
  assertExists(wallet);
  assertEquals(wallet.organizationId, orgIdA);
});
