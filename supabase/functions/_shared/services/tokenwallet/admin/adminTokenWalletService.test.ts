import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import type { RecordTransactionParams } from "./adminTokenWalletService.interface.ts";
import {
  asSupabaseAdminClientForTests,
  buildMockSupabaseConfigAdminCreateWalletOrg,
  buildMockSupabaseConfigAdminCreateWalletUser,
  buildMockSupabaseConfigAdminRecordTransactionNotifyFailure,
  buildMockSupabaseConfigAdminRecordTransactionRpcFailure,
  buildMockSupabaseConfigAdminRecordTransactionSuccess,
} from "./adminTokenWalletService.mock.ts";
import { AdminTokenWalletService } from "./adminTokenWalletService.ts";
import type { TokenWalletTransactionType } from "../../../types/tokenWallet.types.ts";

Deno.test("AdminTokenWalletService createWallet — happy path with userId", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const walletId = "22222222-2222-4222-8222-222222222222";
  const { client, spies } = createMockSupabaseClient(
    userId,
    buildMockSupabaseConfigAdminCreateWalletUser(userId, walletId),
  );
  const service: AdminTokenWalletService = new AdminTokenWalletService(
    asSupabaseAdminClientForTests(client),
  );
  const wallet = await service.createWallet(userId, undefined);
  assertEquals(wallet.userId, userId);
  assertEquals(wallet.currency, "AI_TOKEN");
  assertEquals(wallet.walletId, walletId);
  assertEquals(spies.fromSpy.calls.length > 0, true);
});

Deno.test("AdminTokenWalletService createWallet — happy path with organizationId", async () => {
  const orgId = "33333333-3333-4333-8333-333333333333";
  const walletId = "44444444-4444-4444-8444-444444444444";
  const { client, spies } = createMockSupabaseClient(
    undefined,
    buildMockSupabaseConfigAdminCreateWalletOrg(orgId, walletId),
  );
  const service: AdminTokenWalletService = new AdminTokenWalletService(
    asSupabaseAdminClientForTests(client),
  );
  const wallet = await service.createWallet(undefined, orgId);
  assertEquals(wallet.organizationId, orgId);
  assertEquals(wallet.currency, "AI_TOKEN");
  assertEquals(wallet.walletId, walletId);
  assertEquals(spies.fromSpy.calls.length > 0, true);
});

Deno.test("AdminTokenWalletService createWallet — throws when neither userId nor organizationId", async () => {
  const { client } = createMockSupabaseClient(
    "55555555-5555-4555-8555-555555555555",
    {},
  );
  const service: AdminTokenWalletService = new AdminTokenWalletService(
    asSupabaseAdminClientForTests(client),
  );
  await assertRejects(
    async () => {
      await service.createWallet(undefined, undefined);
    },
    Error,
    "Cannot create wallet: userId or organizationId must be provided.",
  );
});

Deno.test(
  "AdminTokenWalletService recordTransaction — RPC succeeds and notification RPC is invoked",
  async () => {
    const walletId = "66666666-6666-4666-8666-666666666666";
    const recordedByUserId = "77777777-7777-4777-8777-777777777777";
    const targetUserId = "88888888-8888-4888-8888-888888888888";
    const txnType: TokenWalletTransactionType = "DEBIT_USAGE";
    const idempotencyKey = "idem-happy-1";
    const { client, spies } = createMockSupabaseClient(
      targetUserId,
      buildMockSupabaseConfigAdminRecordTransactionSuccess({
        walletId,
        recordedByUserId,
        targetUserId,
        txnType,
        idempotencyKey,
        transactionId: "99999999-9999-4999-8999-999999999999",
        amount: 1,
        balanceAfterTxn: 99,
        timestamp: "2024-01-02T00:00:00.000Z",
      }),
    );
    const service: AdminTokenWalletService = new AdminTokenWalletService(
      asSupabaseAdminClientForTests(client),
    );
    const params: RecordTransactionParams = {
      walletId,
      type: txnType,
      amount: "1",
      recordedByUserId,
      idempotencyKey,
    };
    const result = await service.recordTransaction(params);
    assertExists(result.transactionId);
    assertEquals(result.walletId, walletId);
    assertEquals(result.idempotencyKey, params.idempotencyKey);
    const rpcNames = spies.rpcSpy.calls.map((call) => call.args[0]);
    assertEquals(rpcNames[0], "record_token_transaction");
    assertEquals(rpcNames[1], "create_notification_for_user");
  },
);

Deno.test(
  "AdminTokenWalletService recordTransaction — notification RPC error does not reject the call",
  async () => {
    const walletId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const recordedByUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const targetUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const txnType: TokenWalletTransactionType = "CREDIT_PURCHASE";
    const idempotencyKey = "idem-notify-fail";
    const notificationError: Error = new Error(
      "create_notification_for_user failed",
    );
    const { client, spies } = createMockSupabaseClient(
      targetUserId,
      buildMockSupabaseConfigAdminRecordTransactionNotifyFailure({
        walletId,
        recordedByUserId,
        targetUserId,
        txnType,
        idempotencyKey,
        transactionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        amount: 5,
        balanceAfterTxn: 105,
        timestamp: "2024-01-03T00:00:00.000Z",
        notificationError,
      }),
    );
    const service: AdminTokenWalletService = new AdminTokenWalletService(
      asSupabaseAdminClientForTests(client),
    );
    const params: RecordTransactionParams = {
      walletId,
      type: txnType,
      amount: "5",
      recordedByUserId,
      idempotencyKey,
    };
    const result = await service.recordTransaction(params);
    assertEquals(result.walletId, walletId);
    assertEquals(result.balanceAfterTxn, "105");
    assertEquals(spies.rpcSpy.calls.length, 2);
  },
);

Deno.test(
  "AdminTokenWalletService recordTransaction — RPC error propagates as rejection",
  async () => {
    const walletId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const recordedByUserId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const rpcError: Error = new Error(
      "Failed to record token transaction: rpc denied",
    );
    const { client } = createMockSupabaseClient(
      "10101010-1010-4101-8101-101010101010",
      buildMockSupabaseConfigAdminRecordTransactionRpcFailure(rpcError),
    );
    const service: AdminTokenWalletService = new AdminTokenWalletService(
      asSupabaseAdminClientForTests(client),
    );
    const params: RecordTransactionParams = {
      walletId,
      type: "DEBIT_USAGE",
      amount: "1",
      recordedByUserId,
      idempotencyKey: "idem-rpc-fail",
    };
    await assertRejects(
      async () => {
        await service.recordTransaction(params);
      },
      Error,
      "Failed to record token transaction: rpc denied",
    );
  },
);
