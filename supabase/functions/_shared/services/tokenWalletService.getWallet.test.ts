import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TokenWalletService } from './tokenWalletService.ts';
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  type TestSetupConfig,
  registerUndoAction,
  coreCreateAndSetupTestUser,
} from '../_integration.test.utils.ts';

Deno.test("TokenWalletService (getTransactionHistory)", async (t) => {

  await t.step("retrieves transactions for a user wallet, sorted descending", async () => {
    let testStep;
    try {
      const config: TestSetupConfig = { initialWalletBalance: 1000 };
      testStep = await coreInitializeTestStep(config);
      const { primaryUserId, primaryUserClient, adminClient } = testStep;
      const service = new TokenWalletService(primaryUserClient, adminClient);

      const userWallet = await service.getWalletForContext(primaryUserId);
      assertExists(userWallet);

      // Record some transactions
      await service.recordTransaction({ walletId: userWallet.walletId, type: 'DEBIT_USAGE', amount: '10', recordedByUserId: primaryUserId, idempotencyKey: crypto.randomUUID(), notes: "Transaction 1" });
      await new Promise(r => setTimeout(r, 10)); // ensure timestamp difference
      await service.recordTransaction({ walletId: userWallet.walletId, type: 'DEBIT_USAGE', amount: '20', recordedByUserId: primaryUserId, idempotencyKey: crypto.randomUUID(), notes: "Transaction 2" });
      await new Promise(r => setTimeout(r, 10));
      await service.recordTransaction({ walletId: userWallet.walletId, type: 'DEBIT_USAGE', amount: '30', recordedByUserId: primaryUserId, idempotencyKey: crypto.randomUUID(), notes: "Transaction 3" });

      const history = await service.getTransactionHistory(userWallet.walletId);
      assertExists(history);
      assertEquals(history.transactions.length, 4);
      assertEquals(history.totalCount, 4);
      assertEquals(history.transactions[0].notes, "Transaction 3", "Should be sorted by timestamp descending");
      assertEquals(history.transactions[1].notes, "Transaction 2");
      assertEquals(history.transactions[2].notes, "Transaction 1");

    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("respects pagination parameters (limit and offset)", async () => {
    let testStep;
    try {
        const config: TestSetupConfig = { initialWalletBalance: 1000 };
        testStep = await coreInitializeTestStep(config);
        const { primaryUserId, primaryUserClient, adminClient } = testStep;
        const service = new TokenWalletService(primaryUserClient, adminClient);
        
        const userWallet = await service.getWalletForContext(primaryUserId);
        assertExists(userWallet);
  
        // Create 5 transactions
        for (let i = 1; i <= 5; i++) {
          await service.recordTransaction({ walletId: userWallet.walletId, type: 'DEBIT_USAGE', amount: `${i}`, recordedByUserId: primaryUserId, idempotencyKey: crypto.randomUUID(), notes: `Txn ${i}` });
          if (i < 5) await new Promise(r => setTimeout(r, 10));
        }

        // Test limit
        const page1 = await service.getTransactionHistory(userWallet.walletId, { limit: 2 });
        assertEquals(page1.transactions.length, 2);
        assertEquals(page1.totalCount, 6);
        assertEquals(page1.transactions[0].notes, "Txn 5");

        // Test offset
        const page2 = await service.getTransactionHistory(userWallet.walletId, { limit: 2, offset: 2 });
        assertEquals(page2.transactions.length, 2);
        assertEquals(page2.transactions[0].notes, "Txn 3");
        
        // Test fetchAll
        const allHistory = await service.getTransactionHistory(userWallet.walletId, { fetchAll: true });
        assertEquals(allHistory.transactions.length, 6);
        assertEquals(allHistory.totalCount, 6);

    } finally {
        await coreCleanupTestResources('local');
    }
  });

  await t.step("returns one initial transaction for a new wallet with no other transactions", async () => {
    let testStep;
    try {
      const config: TestSetupConfig = { initialWalletBalance: 0 };
      testStep = await coreInitializeTestStep(config);
      const { primaryUserId, primaryUserClient, adminClient } = testStep;
      const service = new TokenWalletService(primaryUserClient, adminClient);
      
      const userWallet = await service.getWalletForContext(primaryUserId);
      assertExists(userWallet);

      const history = await service.getTransactionHistory(userWallet.walletId);
      assertEquals(history.transactions.length, 1);
      assertEquals(history.totalCount, 1);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("(RLS) returns empty array for another user's wallet", async () => {
    let testStepA, testStepB;
    try {
      // User A has a wallet with transactions
      testStepA = await coreInitializeTestStep({ initialWalletBalance: 100 });
      const serviceA = new TokenWalletService(testStepA.primaryUserClient, testStepA.adminClient);
      const walletA = await serviceA.getWalletForContext(testStepA.primaryUserId);
      assertExists(walletA);
      await serviceA.recordTransaction({ walletId: walletA.walletId, type: 'DEBIT_USAGE', amount: '10', recordedByUserId: testStepA.primaryUserId, idempotencyKey: crypto.randomUUID() });
      
      // User B
      testStepB = await coreInitializeTestStep({});
      const serviceB = new TokenWalletService(testStepB.primaryUserClient, testStepB.adminClient);

      // Action: User B tries to get history for User A's wallet
      const history = await serviceB.getTransactionHistory(walletA.walletId);
      assertEquals(history.transactions.length, 0);
      assertEquals(history.totalCount, 0); // RLS should make it seem like it doesn't exist

    } finally {
      if(testStepB) await coreCleanupTestResources('local');
      if(testStepA) await coreCleanupTestResources('local');
    }
  });

  await t.step("(RLS) returns empty array for org wallet if user is not a member", async () => {
    let testStep;
    try {
      testStep = await coreInitializeTestStep({});
      const { primaryUserClient, adminClient } = testStep;
      const service = new TokenWalletService(primaryUserClient, adminClient);

      // Setup: Create an org and an admin for it (someone other than our test user)
      const { userId: adminId } = await coreCreateAndSetupTestUser({role: 'admin'}, 'local');
      const { data: org, error: orgErr } = await adminClient.from('organizations').insert({ name: 'RLS Org History Test' }).select().single();
      assertExists(org);
      if (orgErr) throw orgErr;
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'organizations', criteria: { id: org.id }, scope: 'local' });

      const { error: memberErr } = await adminClient.from('organization_members').insert({ organization_id: org.id, user_id: adminId, role: 'admin', status: 'active' });
      if (memberErr) throw memberErr;
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'organization_members', criteria: { organization_id: org.id, user_id: adminId }, scope: 'local' });

      // Admin service to get wallet and add transaction
      const adminService = new TokenWalletService(adminClient, adminClient);
      const orgWallet = await adminService.getWalletForContext(undefined, org.id);
      assertExists(orgWallet);
      await adminService.recordTransaction({ walletId: orgWallet.walletId, type: 'CREDIT_ADJUSTMENT', amount: '100', recordedByUserId: adminId, idempotencyKey: crypto.randomUUID() });
      await adminService.recordTransaction({ walletId: orgWallet.walletId, type: 'DEBIT_USAGE', amount: '10', recordedByUserId: adminId, idempotencyKey: crypto.randomUUID() });

      // Action: our non-member test user tries to get the history
      const history = await service.getTransactionHistory(orgWallet.walletId);
      assertEquals(history.transactions.length, 0);
      assertEquals(history.totalCount, 0);
      
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("returns empty results for an invalid wallet ID format", async () => {
    const service = new TokenWalletService(null as any, null as any); // No client needed for validation
    const history = await service.getTransactionHistory("not-a-uuid");
    assertExists(history);
    assertEquals(history.transactions.length, 0);
    assertEquals(history.totalCount, 0);
  });
});