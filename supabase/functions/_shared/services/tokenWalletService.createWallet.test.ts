import {
  assertEquals,
  assertRejects,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { TokenWalletService } from './tokenWalletService.ts';
import {
  type ITokenWalletService,
  type TokenWalletTransactionType,
} from '../types/tokenWallet.types.ts';
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  type TestSetupConfig,
  registerUndoAction,
} from '../_integration.test.utils.ts';

Deno.test("TokenWalletService (Integration Tests)", async (t) => {

  await t.step("createWallet: verifies auto-creation of a new user wallet", async () => {
    let testStep: Awaited<ReturnType<typeof coreInitializeTestStep>> | null = null;
    try {
      const config: TestSetupConfig = {
        // We want to test the auto-created wallet, so we ensure the balance is what we expect from the trigger.
        // Assuming the trigger sets the initial balance to 0.
        initialWalletBalance: 0,
      };
      testStep = await coreInitializeTestStep(config, 'local');
      const { primaryUserId, primaryUserClient, adminClient } = testStep;
      
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      // Action: Fetch the wallet that should have been auto-created for the user.
      const wallet = await tokenWalletService.getWalletForContext(primaryUserId);
      
      // Assertions
      assertExists(wallet, "A wallet should be automatically created for a new user.");
      assertEquals(wallet.userId, primaryUserId);
      assertEquals(wallet.organizationId, undefined);
      assertEquals(wallet.balance, '0'); // Default balance should be 0.
      assertEquals(wallet.currency, 'AI_TOKEN');
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("createWallet: successfully creates an organization wallet via trigger", async () => {
    let testStep: Awaited<ReturnType<typeof coreInitializeTestStep>> | null = null;
    try {
      const config: TestSetupConfig = { userProfile: { role: 'admin' } };
      testStep = await coreInitializeTestStep(config, 'local');
      const { primaryUserId, primaryUserClient, adminClient } = testStep;

      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const orgName = `Test Org-${crypto.randomUUID()}`;
      const { data: orgData, error: orgInsertError } = await adminClient
        .from('organizations')
        .insert({ name: orgName })
        .select('id')
        .single();
      
      assertExists(orgData, "Organization data should exist after insert.");
      if (orgInsertError) throw orgInsertError;
      const newOrgId = orgData.id;
      // Register cleanup for the created organization
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'organizations', criteria: { id: newOrgId }, scope: 'local' });

      const { error: memberInsertError } = await adminClient
        .from('organization_members')
        .insert({ organization_id: newOrgId, user_id: primaryUserId, role: 'admin', status: 'active' });
      
      if (memberInsertError) throw memberInsertError;
      // Register cleanup for the created membership
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'organization_members', criteria: { organization_id: newOrgId, user_id: primaryUserId }, scope: 'local' });


      const fetchedOrgWallet = await tokenWalletService.getWalletForContext(primaryUserId, newOrgId);

      assertExists(fetchedOrgWallet, "Organization wallet should be auto-created by trigger and retrievable.");
      assertEquals(fetchedOrgWallet.organizationId, newOrgId);
      assertEquals(fetchedOrgWallet.userId, undefined, "User ID on an org wallet should be undefined.");
      assertEquals(fetchedOrgWallet.balance, '0');

    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("createWallet: throws error if neither userId nor organizationId is provided", async () => {
    const service = new TokenWalletService({} as SupabaseClient, {} as SupabaseClient);
    await assertRejects(
      () => service.createWallet(undefined, undefined),
      Error,
      'Cannot create wallet: userId or organizationId must be provided.'
    );
  });

  await t.step("recordTransaction: successful CREDIT_PURCHASE", async () => {
    let testStep: Awaited<ReturnType<typeof coreInitializeTestStep>> | null = null;
    try {
      const config: TestSetupConfig = { initialWalletBalance: 0 };
      testStep = await coreInitializeTestStep(config, 'local');
      const { primaryUserId, primaryUserClient, adminClient } = testStep;
      
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);

      const generatedPaymentTxId = crypto.randomUUID();
      const creditAmount = '1000';

      const { error: paymentTxError } = await adminClient
        .from('payment_transactions')
        .insert({
          id: generatedPaymentTxId,
          target_wallet_id: userWallet.walletId,
          payment_gateway_id: 'TEST_GATEWAY',
          tokens_to_award: parseInt(creditAmount),
          status: 'COMPLETED',
          user_id: primaryUserId, 
        });
      assertEquals(paymentTxError, null);
      // Register cleanup for the created payment transaction
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'payment_transactions', criteria: { id: generatedPaymentTxId }, scope: 'local' });

      const transactionResult = await tokenWalletService.recordTransaction({
        walletId: userWallet.walletId,
        type: 'CREDIT_PURCHASE',
        amount: creditAmount,
        recordedByUserId: primaryUserId, 
        idempotencyKey: crypto.randomUUID(),
        paymentTransactionId: generatedPaymentTxId,
      });

      assertExists(transactionResult);
      assertEquals(transactionResult.walletId, userWallet.walletId);
      assertEquals(transactionResult.amount, creditAmount);
      assertEquals(transactionResult.balanceAfterTxn, creditAmount);

      const newBalance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(newBalance, creditAmount, "Wallet balance should be updated by the amount of credit.");

    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("recordTransaction: successful DEBIT_USAGE", async () => {
    let testStep: Awaited<ReturnType<typeof coreInitializeTestStep>> | null = null;
    const initialBalance = 100;
    const debitAmount = 30;
    const finalBalance = initialBalance - debitAmount;
    
    try {
      const config: TestSetupConfig = { initialWalletBalance: initialBalance };
      testStep = await coreInitializeTestStep(config, 'local');
      const { primaryUserId, primaryUserClient, adminClient } = testStep;

      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);
      assertEquals(userWallet.balance, initialBalance.toString());

      const debitResult = await tokenWalletService.recordTransaction({
        walletId: userWallet.walletId,
        type: 'DEBIT_USAGE',
        amount: debitAmount.toString(),
        recordedByUserId: primaryUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      assertExists(debitResult);
      assertEquals(debitResult.balanceAfterTxn, finalBalance.toString());

      const newBalance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(newBalance, finalBalance.toString(), "Wallet balance should be correctly debited.");

    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("recordTransaction: fails if wallet does not exist", async () => {
    let testStep: Awaited<ReturnType<typeof coreInitializeTestStep>> | null = null;
    try {
      const config: TestSetupConfig = {}; // Standard user, no wallet pre-created unless by trigger
      testStep = await coreInitializeTestStep(config, 'local');
      const { primaryUserId, primaryUserClient, adminClient } = testStep;
      
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const nonExistentWalletId = crypto.randomUUID();

      await assertRejects(
        () => tokenWalletService.recordTransaction({
          walletId: nonExistentWalletId,
          type: 'DEBIT_USAGE',
          amount: '50',
          recordedByUserId: primaryUserId,
          idempotencyKey: crypto.randomUUID(),
        }),
        Error,
        "Failed to record token transaction"
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });
}); 