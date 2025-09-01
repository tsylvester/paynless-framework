import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  findProcessedResource,
  TestSetupConfig,
  coreCreateAndSetupTestUser,
  registerUndoAction,
  initializeTestDeps,
} from '../_integration.test.utils.ts';
import { TokenWalletService } from './tokenWalletService.ts';
import {
  type ITokenWalletService,
  type TokenWallet,
  type TokenWalletTransaction,
  type GetTransactionHistoryParams,
  type PaginatedTransactions,
  type TokenWalletTransactionType,
} from '../types/tokenWallet.types.ts'; 
import type { Database } from '../../types_db.ts';

Deno.test("TokenWalletService (Integration with Dev Server)", async (t) => {
  initializeTestDeps();
  // All old setup helpers and global clients are removed.
  // Each test step will now be self-contained for setup and cleanup.

  await t.step("createWallet: successfully creates a new user wallet", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const createdWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(createdWallet, "Wallet object should be returned.");

      assertEquals(createdWallet.userId, primaryUserId);
      assertEquals(createdWallet.organizationId, undefined);
      assertEquals(createdWallet.balance, '0');
      assertEquals(createdWallet.currency, 'AI_TOKEN');
      assertExists(createdWallet.walletId, "Wallet ID should be present.");
      assertExists(createdWallet.createdAt, "createdAt should be present.");
      assertExists(createdWallet.updatedAt, "updatedAt should be present.");

      const { data: dbWallet, error } = await primaryUserClient // Use user client to check RLS
        .from('token_wallets')
        .select('*')
        .eq('wallet_id', createdWallet.walletId)
        .single();

      assertEquals(error, null, `Error fetching wallet from DB: ${error?.message}`);
      assertExists(dbWallet, "Wallet should be in the database.");
      assertEquals(dbWallet.user_id, primaryUserId);
      assertEquals(dbWallet.organization_id, null);
      assertEquals(dbWallet.balance?.toString(), '0');
      assertEquals(dbWallet.currency, 'AI_TOKEN');
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("createWallet: successfully creates a new organization wallet", async (t) => {
    try {
      const config: TestSetupConfig = {
        resources: [
          {
            tableName: 'organizations',
            identifier: { name: 'Test Org for Auto Wallet' },
            desiredState: { name: 'Test Org for Auto Wallet' },
            exportId: 'testOrg'
          },
          {
            tableName: 'organization_members',
            identifier: { organization_id: { $ref: 'testOrg' } }, // Let it be created
            desiredState: {
              role: 'admin',
              status: 'active'
            },
            linkUserId: true // Link to the primary user created for this test step
          }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const testOrg = findProcessedResource(processedResources, 'organizations', 'testOrg');
      assertExists(testOrg, "Test organization should have been created.");
      assertExists(testOrg.id, "Test organization ID should exist.");

      const fetchedOrgWallet = await tokenWalletService.getWalletForContext(primaryUserId, testOrg.id);
      
      assertExists(fetchedOrgWallet, "Organization wallet should be auto-created by trigger and retrievable by service.");

      console.log("[Test Debug CreateWalletOrg] Fetched auto-created Org Wallet:", JSON.stringify(fetchedOrgWallet));

      assertEquals(fetchedOrgWallet.organizationId, testOrg.id);
      assertEquals(fetchedOrgWallet.userId, undefined, "User ID on an org wallet should be undefined."); 
      assertEquals(fetchedOrgWallet.balance, '0');
      assertEquals(fetchedOrgWallet.currency, 'AI_TOKEN');
      assertExists(fetchedOrgWallet.walletId, "Fetched wallet ID should be present.");

      // Optionally, verify directly in DB if needed, though getWalletForContext should be reliable if RLS allows
      const { data: dbWallet, error: dbError } = await adminClient
        .from('token_wallets')
        .select('*')
        .eq('organization_id', testOrg.id)
        .maybeSingle(); // Use maybeSingle as there should be at most one
      
      assertEquals(dbError, null, `DB error fetching org wallet: ${dbError?.message}`);
      assertExists(dbWallet, "Wallet for organization should exist in DB.");
      assertEquals(dbWallet.wallet_id, fetchedOrgWallet.walletId, "DB wallet_id should match fetched walletId.");
      assertEquals(dbWallet.currency, 'AI_TOKEN');
      assertEquals(dbWallet.organization_id, testOrg.id);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("createWallet: throws error if user wallet already exists", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      // This test is now redundant because coreInitializeTestStep always creates a wallet.
      // A direct call here will always throw, so we can assert that behavior.
      await assertRejects(
        async () => { await tokenWalletService.createWallet(primaryUserId); },
        Error,
        'Failed to create token wallet: duplicate key value violates unique constraint "unique_user_personal_wallet_idx"'
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("createWallet: throws error if org wallet already exists", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          {
            tableName: 'organizations',
            identifier: { name: 'Test Org for Auto Wallet' },
            desiredState: { name: 'Test Org for Auto Wallet' },
            exportId: 'testOrg'
          },
          {
            tableName: 'organization_members',
            identifier: { organization_id: { $ref: 'testOrg' } }, // Let it be created
            desiredState: {
              role: 'admin',
              status: 'active'
            },
            linkUserId: true // Link to the primary user created for this test step
          }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const testOrg = findProcessedResource(processedResources, 'organizations', 'testOrg');
      assertExists(testOrg, "Test organization should have been created.");
      assertExists(testOrg.id, "Test organization ID should exist.");

      await assertRejects(
        async () => { await tokenWalletService.createWallet(undefined, testOrg.id); },
        Error,
        'Failed to create token wallet: duplicate key value violates unique constraint "unique_org_dedicated_wallet_idx"'
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("recordTransaction: successful CREDIT_PURCHASE to user wallet", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const newWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(newWallet, "A new wallet should be created for the test user.");
      const testUserWalletId = newWallet.walletId;

      const generatedPaymentTxId = crypto.randomUUID();

      const params = {
        walletId: testUserWalletId,
        type: 'CREDIT_PURCHASE' as TokenWalletTransactionType,
        amount: '1000',
        recordedByUserId: primaryUserId, 
        idempotencyKey: crypto.randomUUID(),
        relatedEntityId: `payment-${Date.now()}`,
        relatedEntityType: 'payment_transaction',
        paymentTransactionId: generatedPaymentTxId,
        notes: 'Test credit purchase via service-created wallet',
      };

      // Insert a dummy payment_transactions record
      const { error: paymentTxError } = await adminClient
        .from('payment_transactions')
        .insert({
          id: generatedPaymentTxId,
          target_wallet_id: testUserWalletId,
          payment_gateway_id: 'TEST_GATEWAY',
          tokens_to_award: parseInt(params.amount),
          status: 'COMPLETED',
          user_id: primaryUserId, 
        });
      assertEquals(paymentTxError, null, `Failed to insert dummy payment transaction: ${paymentTxError?.message}`);

      // Ensure the dummy payment transaction is cleaned up
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'payment_transactions',
        criteria: { id: generatedPaymentTxId },
        scope: 'local'
      });

      const transactionResult = await tokenWalletService.recordTransaction(params);

      // Register cleanup for the created transaction ledger entry
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'token_wallet_transactions',
        criteria: { transaction_id: transactionResult.transactionId },
        scope: 'local'
      });

      assertExists(transactionResult, "Transaction result should exist.");
      assertEquals(transactionResult.walletId, params.walletId);
      assertEquals(transactionResult.type, params.type);
      assertEquals(transactionResult.amount, params.amount);
      assertExists(transactionResult.transactionId, "Transaction ID should be present.");

      const { data: dbTxn, error: dbTxnError } = await primaryUserClient
        .from('token_wallet_transactions')
        .select('*')
        .eq('transaction_id', transactionResult.transactionId)
        .single();

      assertEquals(dbTxnError, null, `Error fetching transaction from DB: ${dbTxnError?.message}`);
      assertExists(dbTxn, "Transaction should be in the database.");
      assertEquals(dbTxn.wallet_id, params.walletId);
      assertEquals(dbTxn.transaction_type, params.type);
      assertEquals(dbTxn.amount.toString(), params.amount);
      assertEquals(dbTxn.notes, params.notes);
      assertEquals(dbTxn.payment_transaction_id, generatedPaymentTxId);

      const { data: updatedWallet, error: fetchWalletError } = await primaryUserClient
        .from('token_wallets')
        .select('balance')
        .eq('wallet_id', testUserWalletId)
        .single();
      
      assertEquals(fetchWalletError, null, `Error fetching updated wallet: ${fetchWalletError?.message}`);
      assertExists(updatedWallet, "Updated wallet data should exist.");
      assertEquals(updatedWallet.balance.toString(), params.amount, "Wallet balance should be updated by the amount of credit.");
      assertEquals(dbTxn.balance_after_txn.toString(), params.amount, "Ledger balance_after_txn should match new wallet balance.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });
  
  // NOTE: This is a partial refactoring. The remaining tests below this point still use the old structure and will fail.
  // They need to be updated one by one to use `coreInitializeTestStep` and remove dependencies on the old setup/cleanup logic.
  
  await t.step("recordTransaction: successful DEBIT_USAGE from wallet with sufficient balance", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const walletBefore = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(walletBefore, "Wallet should exist before debit.");
      assertEquals(walletBefore.balance, '100');

      const params = {
        walletId: walletBefore.walletId,
        type: 'DEBIT_USAGE' as TokenWalletTransactionType,
        amount: '30',
        recordedByUserId: primaryUserId,
        idempotencyKey: `debit-idempotency-${crypto.randomUUID()}`,
        relatedEntityId: `usage-${crypto.randomUUID()}`,
        relatedEntityType: 'ai_service_usage' as const,
        notes: 'Test debit usage',
      };

      const transactionResult = await tokenWalletService.recordTransaction(params);

      // Register cleanup for the created transaction ledger entry to prevent FK violation on user deletion
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'token_wallet_transactions',
        criteria: { transaction_id: transactionResult.transactionId },
        scope: 'local'
      });

      assertExists(transactionResult, "Transaction result should exist.");
      assertEquals(transactionResult.walletId, params.walletId);
      assertEquals(transactionResult.type, params.type);
      assertEquals(transactionResult.amount, params.amount);

      const walletAfter = await tokenWalletService.getWallet(walletBefore.walletId);
      assertExists(walletAfter, "Wallet should still exist after debit.");
      assertEquals(walletAfter.balance, '70', "Balance should be correctly debited.");

    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("recordTransaction: fails if wallet does not exist", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const nonExistentWalletId = "00000000-0000-0000-0000-000000000001"; // Use a valid UUID format
      const params = {
        walletId: nonExistentWalletId,
        type: 'DEBIT_USAGE' as TokenWalletTransactionType,
        amount: '50',
        recordedByUserId: primaryUserId,
        idempotencyKey: crypto.randomUUID(),
        notes: 'Test debit from non-existent wallet',
      };

      await assertRejects(
        async () => { await tokenWalletService.recordTransaction(params); },
        Error,
        "Failed to record token transaction"
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("recordTransaction: fails if recordedByUserId is missing (via direct RPC call)", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      // 1. Setup: Create a wallet
      const newWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(newWallet, "A new wallet should be created for the test.");
      const testUserWalletId = newWallet.walletId;

      // 2. Action & Verification: Attempt to call RPC with p_recorded_by_user_id as null
      await assertRejects(
        async () => {
          const { error } = await adminClient.rpc('record_token_transaction', {
            p_wallet_id: testUserWalletId as string,
            p_transaction_type: 'CREDIT_ADJUSTMENT' as TokenWalletTransactionType,
            p_input_amount_text: '10',
            p_recorded_by_user_id: null, // Intentionally null to trigger the NOT NULL constraint
            p_idempotency_key: crypto.randomUUID(), // Ensured this is present
            p_related_entity_id: null, // Added
            p_related_entity_type: null, // Added
            p_notes: 'Test attempt with null recordedByUserId for RPC direct call',
            p_payment_transaction_id: null // Added
          } as any); // Cast to 'any' to bypass TypeScript compile-time check for null argument

          if (error) {
            throw new Error(error.message); 
          }
          throw new Error("RPC call 'record_token_transaction' with null p_recorded_by_user_id completed without returning an error object, which was not expected.");
        },
        Error, 
        'Recorded by User ID cannot be null' 
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  // --- Tests for getWallet --- 

  await t.step("getWallet: successfully retrieves an existing user wallet", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 12345 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      // First, get the wallet via the context method to find its ID
      const contextWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(contextWallet, "Wallet should exist and be retrievable by context.");
      assertEquals(contextWallet.balance, '12345');
      const walletIdToFetch = contextWallet.walletId;

      // Now, use the getWallet method with the specific ID
      const fetchedWallet = await tokenWalletService.getWallet(walletIdToFetch);
      assertExists(fetchedWallet, "getWallet should successfully retrieve the wallet by its ID.");
      assertEquals(fetchedWallet.walletId, walletIdToFetch);
      assertEquals(fetchedWallet.userId, primaryUserId);
      assertEquals(fetchedWallet.balance, '12345');
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step(
    "getWallet: successfully retrieves an existing organization wallet",
    async (t) => {
      try {
        const config: TestSetupConfig = {
          resources: [
            {
              tableName: 'organizations',
              identifier: { name: 'Test Org for Wallet' },
              desiredState: { name: 'Test Org for Wallet' },
              exportId: 'testOrg'
            },
            {
              tableName: 'organization_members',
              identifier: { organization_id: { $ref: 'testOrg' } },
              desiredState: {
                role: 'admin',
                status: 'active'
              },
              linkUserId: true
            }
          ]
        };
        const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
        const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
        
        const testOrg = findProcessedResource(processedResources, 'organizations', 'testOrg');
        assertExists(testOrg?.id, "Test organization should have been created with an ID.");

        // Get the org wallet via context to find its ID
        const orgWalletFromContext = await tokenWalletService.getWalletForContext(primaryUserId, testOrg.id);
        assertExists(orgWalletFromContext, "Organization wallet should be retrievable by context.");
        const orgWalletId = orgWalletFromContext.walletId;

        // Now fetch it directly by its ID
        const fetchedWallet = await tokenWalletService.getWallet(orgWalletId);
        assertExists(fetchedWallet, "getWallet should retrieve the organization wallet by its ID.");
        assertEquals(fetchedWallet.walletId, orgWalletId);
        assertEquals(fetchedWallet.organizationId, testOrg.id);
        assertEquals(fetchedWallet.userId, undefined);

      } finally {
        await coreCleanupTestResources('local');
      }
    }
  );

  await t.step(
    "getWallet: returns null for an organization wallet if the user is a member but not an admin",
    async (t) => {
      // This outer try/finally is to ensure the dummy org/users are cleaned up even if sub-steps fail.
      try {
        let orgId: string | undefined;
        let nonAdminClient: SupabaseClient<Database> | undefined;

        await t.step(
          "Setup: Create dummy organization, a dummy admin, and test user as non-admin member",
          async () => {
            // Create the admin user and the organization
            const {
              primaryUserId: adminId,
              adminClient: adminSupabaseClient,
              processedResources,
            } = await coreInitializeTestStep(
              {
                resources: [
                  {
                    tableName: "organizations",
                    identifier: { name: "Test Org Non-Admin" },
                    desiredState: { name: "Test Org Non-Admin" },
                    exportId: "org",
                  },
                  {
                    tableName: 'organization_members',
                    identifier: { organization_id: { $ref: 'org' } }, // Let it be created
                    desiredState: { role: 'admin', status: 'active' },
                    linkUserId: true
                  }
                ],
              },
              "local"
            );
            
            const orgResource = findProcessedResource(processedResources, "organizations", "org");
            assertExists(orgResource?.id, "Organization should have been created with an ID.");
            orgId = orgResource.id;

            // Create the second user who will be the non-admin member
            const { primaryUserId: nonAdminId, primaryUserClient } =
              await coreInitializeTestStep({}, "local");
            nonAdminClient = primaryUserClient;

            // Make the second user a member (not admin) of the org
            const { error: nonAdminMemberError } = await adminSupabaseClient
              .from("organization_members")
              .insert({
                organization_id: orgId,
                user_id: nonAdminId,
                role: "member",
                status: "active",
              });
            assertEquals(nonAdminMemberError, null, "Failed to create non-admin member.");
          }
        );

        let orgWalletId: string | undefined;

        await t.step(
          "Fetch organization wallet ID for non-admin test scenario",
          async () => {
            assertExists(orgId, "Org ID must be defined from setup.");
            const { adminClient } = await coreInitializeTestStep({}, "local"); // Fresh admin client
            const { data: wallet, error } = await adminClient
              .from("token_wallets")
              .select("wallet_id")
              .eq("organization_id", orgId)
              .single();
            
            assertEquals(error, null, `Error fetching org wallet for test setup: ${error?.message}`);
            assertExists(wallet, "Organization wallet should exist.");
            orgWalletId = wallet.wallet_id;
          }
        );

        await t.step(
          "Fetch organization wallet using service (as non-admin member)",
          async () => {
            assertExists(orgWalletId, "Org wallet ID must be defined.");
            assertExists(nonAdminClient, "Non-admin client must be defined.");
            const { adminClient } = await coreInitializeTestStep({}, "local"); // Fresh admin client
            const tokenWalletService = new TokenWalletService(nonAdminClient, adminClient);
            const fetchedWallet = await tokenWalletService.getWallet(orgWalletId);
            
            assertEquals(fetchedWallet, null, "getWallet should return null for a non-admin.");
          }
        );
      } finally {
        // Since we have nested coreInitializeTestStep, we need to be careful with cleanup.
        // The 'local' scope helps, we just need to call it enough times to clear the stack for this test.
        await coreCleanupTestResources("local");
        await coreCleanupTestResources("local");
        await coreCleanupTestResources("local");
        await coreCleanupTestResources("local");
      }
    }
  );

  await t.step(
    "getWallet: returns null for a non-existent (but valid UUID) wallet ID",
    async () => {
      try {
        const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
        const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
        const nonExistentWalletId = crypto.randomUUID();
        const fetchedWallet = await tokenWalletService.getWallet(nonExistentWalletId);
        assertEquals(fetchedWallet, null, "Should return null for a non-existent wallet ID.");
      } finally {
        await coreCleanupTestResources('local');
      }
    }
  );

  await t.step("getWallet: returns null for an invalidly formatted wallet ID string", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const invalidWalletId = "this-is-not-a-uuid";
      const fetchedWallet = await tokenWalletService.getWallet(invalidWalletId);
      assertEquals(fetchedWallet, null, "Should return null for an invalidly formatted wallet ID.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWallet: (RLS) returns null when trying to fetch another user's wallet", async () => {
    try {
      // 1. Setup original user and their wallet
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const originalUserWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(originalUserWallet, "Original user's wallet should be created.");

      // 2. Setup second user
      const { primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
      
      // 3. Second user tries to fetch first user's wallet
      const fetchedWalletBySecondUser = await secondUserService.getWallet(originalUserWallet.walletId);
      assertEquals(fetchedWalletBySecondUser, null, "Second user should not be able to fetch original user's wallet.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  // --- End of tests for getWallet --- 

  // --- Tests for getWalletForContext ---
  await t.step("getWalletForContext: successfully retrieves a user wallet given only userId", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId!); 
      assertExists(userWallet, "User wallet should be created for setup.");

      const fetchedWallet = await tokenWalletService.getWalletForContext(primaryUserId!, undefined);
      assertExists(fetchedWallet, "Fetched wallet should exist when userId is provided.");
      assertEquals(fetchedWallet.walletId, userWallet.walletId);
      assertEquals(fetchedWallet.userId, primaryUserId);
      assertEquals(fetchedWallet.organizationId, undefined);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletForContext: successfully retrieves an org wallet given orgId and admin userId", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          {
            tableName: 'organizations',
            identifier: { name: 'CtxOrg' },
            desiredState: { name: 'CtxOrg' },
            exportId: 'org'
          },
          {
            tableName: 'organization_members',
            identifier: { organization_id: { $ref: 'org' } }, // Let it be created
            desiredState: {
              role: 'admin',
              status: 'active',
            },
            linkUserId: true 
          }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const testOrg = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(testOrg?.id, "Test organization should have been created with an ID.");

      const wallet = await tokenWalletService.getWalletForContext(primaryUserId, testOrg.id);

      assertExists(wallet, "Wallet should be retrieved successfully.");
      assertEquals(wallet.organizationId, testOrg.id, "Wallet should belong to the correct organization.");
      assertEquals(wallet.userId, undefined, "Organization wallet should not have a userId.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletForContext: returns null if neither userId nor organizationId is provided", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const result = await tokenWalletService.getWalletForContext(undefined, undefined);
      assertEquals(result, null, "Should return null if no IDs are provided.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletForContext: returns null if userId provided but no wallet exists", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const nonExistentUserId = crypto.randomUUID();
      const result = await tokenWalletService.getWalletForContext(nonExistentUserId, undefined);
      assertEquals(result, null, "Should return null if userId provided but no wallet exists.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletForContext: returns null if orgId provided but no wallet exists", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const nonExistentOrgId = crypto.randomUUID();
      const result = await tokenWalletService.getWalletForContext(primaryUserId!, nonExistentOrgId);
      assertEquals(result, null, "Should return null if orgId provided but no wallet exists for that user/org combo.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletForContext: (RLS) returns null for org wallet if user not admin/member", async () => {
    try {
      // 1. Setup: Create org, add original testUser as admin, create/fetch wallet
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'RLSOrgNotAdmin' }, desiredState: {name: 'RLSOrgNotAdmin'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const orgForRlsTest = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(orgForRlsTest?.id);

      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId!, orgForRlsTest.id);
      assertExists(orgWallet, "Org wallet for RLS test should be created/fetched.");

      // 2. Create a second user who is NOT a member of the org
      const { primaryUserId: secondUserId, primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);

      // 3. Second user (non-member) attempts to get org wallet via context
      const fetchedWallet = await secondUserService.getWalletForContext(secondUserId, orgForRlsTest.id); 
      assertEquals(fetchedWallet, null, "Should return null for org wallet when user is not a member/admin.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletForContext: prioritizes org wallet if both userId and orgId provided", async () => {
    try {
      const config: TestSetupConfig = {
        initialWalletBalance: 12345, // Give the user wallet a distinct balance
        resources: [
          {
            tableName: 'organizations',
            identifier: { name: 'CtxPrioOrg' },
            desiredState: { name: 'CtxPrioOrg' },
            exportId: 'org'
          },
          {
            tableName: 'organization_members',
            identifier: { organization_id: { $ref: 'org' } },
            desiredState: {
              role: 'admin',
              status: 'active',
            },
            linkUserId: true
          }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const orgResource = findProcessedResource(processedResources, "organizations", "org");
      assertExists(orgResource?.id, "Organization should have been created with an ID.");

      // First, get the user's personal wallet to confirm it has the distinct balance
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User's personal wallet should exist.");
      assertEquals(userWallet.balance, '12345', "User wallet should have the initial balance.");

      // Now, get the wallet for the context of both user and org
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, orgResource.id);
      
      assertExists(orgWallet, "Organization wallet should be returned when both IDs are provided.");
      assertEquals(orgWallet.organizationId, orgResource.id, "The returned wallet should be the organization's wallet.");
      assertEquals(orgWallet.balance, '0', "The organization wallet should have its own balance (0 by default).");
      assert(orgWallet.walletId !== userWallet.walletId, "The org wallet should be different from the user wallet.");

    } finally {
      await coreCleanupTestResources('local');
    }
  });
  
  await t.step("getWalletForContext: (RLS) returns null if called with a different userId than authenticated user", async () => {
    try {
      let userOneCleanup = false;
      let userTwoCleanup = false;
      try {
        // Setup: Create 'userOne' who owns a wallet
        const { primaryUserId: userOneId, primaryUserClient: userOneClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
        userOneCleanup = true;
        const tokenWalletServiceOne = new TokenWalletService(userOneClient, adminClient);
        
        const userOneWallet = await tokenWalletServiceOne.getWalletForContext(userOneId);
        assertExists(userOneWallet, "User one's wallet should exist.");

        // Setup: Create 'userTwo' who will try to access the wallet
        const { primaryUserClient: userTwoClient } = await coreInitializeTestStep({}, 'local');
        userTwoCleanup = true;
        const tokenWalletServiceTwo = new TokenWalletService(userTwoClient, adminClient);

        // Test: userTwo attempts to get userOne's wallet using a context meant for userOne
        const walletForUserTwo = await tokenWalletServiceTwo.getWalletForContext(userOneId);

        // Assert: RLS should prevent access, returning null
        assertEquals(walletForUserTwo, null, "Should not be able to fetch another user's wallet via context.");
      } finally {
        // Cleanup will handle both users created in separate coreInitializeTestStep calls
        if(userTwoCleanup) await coreCleanupTestResources('local');
        if(userOneCleanup) await coreCleanupTestResources('local');
      }
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  // --- End of tests for getWalletForContext ---

  // --- Tests for getBalance ---
  await t.step("getBalance: successfully retrieves the balance for an existing user wallet", async () => {
    try {
      const creditAmount = '12345';
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: parseInt(creditAmount) }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created for setup.");

      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, creditAmount);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: successfully retrieves the balance for an existing organization wallet (user is admin)", async () => {
    try {
      const creditAmount = '54321';
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'GetBalanceOrg' }, desiredState: {name: 'GetBalanceOrg'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);
      
      // Org wallet is created by trigger with 0 balance, we need to add funds.
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, org.id);
      assertExists(orgWallet, "Org wallet should be created/fetched for setup.");
      
      await adminClient.from('token_wallets').update({ balance: parseInt(creditAmount) }).eq('wallet_id', orgWallet.walletId);

      const balance = await tokenWalletService.getBalance(orgWallet.walletId);
      assertEquals(balance, creditAmount);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: returns '0' for a newly created user wallet", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId!);
      assertExists(userWallet, "User wallet should be created for setup.");

      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, '0');
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: returns '0' for a newly created organization wallet", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'GetBalanceOrgNew' }, desiredState: {name: 'GetBalanceOrgNew'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);

      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId!, org.id);
      assertExists(orgWallet, "Org wallet should be created/fetched for setup.");

      const balance = await tokenWalletService.getBalance(orgWallet.walletId);
      assertEquals(balance, '0');
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: returns an error if the wallet ID does not exist", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const nonExistentWalletId = crypto.randomUUID();
      // Expecting getBalance to throw an error for a non-existent wallet
      await assertRejects(
        async () => { await tokenWalletService.getBalance(nonExistentWalletId); },
        Error, // Or a more specific error type if defined later
        "Wallet not found" // Or similar error message
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: (RLS) fails to retrieve/returns error for another user's wallet", async () => {
    try {
      const { primaryUserId, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const adminService = new TokenWalletService(adminClient, adminClient);
      const originalUserWallet = await adminService.getWalletForContext(primaryUserId);
      assertExists(originalUserWallet, "Original user's wallet should be created.");

      const { primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
      
      await assertRejects(
        async () => { await secondUserService.getBalance(originalUserWallet!.walletId); },
        Error, // Or specific error due to RLS / not found
        "Wallet not found" // RLS might make it appear as 'not found' to the other user
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: (RLS) fails/error for an org wallet if user is not admin", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'GetBalanceOrgRLS' }, desiredState: {name: 'GetBalanceOrgRLS'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);

      // Main user (admin) creates an org and its wallet
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId!, org.id);
      assertExists(orgWallet, "Org wallet should be created/fetched by admin.");

      // Create a second user (who will not be an admin of this org)
      const { primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
      
      // Second user attempts to get balance (should fail due to RLS)
      await assertRejects(
        async () => { await secondUserService.getBalance(orgWallet!.walletId); },
        Error,
        "Wallet not found" // RLS denial should appear as not found
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: (Input Validation) returns an error if wallet ID is invalid format", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const invalidWalletId = "this-is-not-a-uuid";
      await assertRejects(
        async () => { await tokenWalletService.getBalance(invalidWalletId); },
        Error, // Or a specific input validation error type
        "Invalid wallet ID format"
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: successfully retrieves a very large balance correctly as a string", async () => {
    try {
      const veryLargeAmount = '9999999999999999999'; // Max 19 digits for NUMERIC(19,0)
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId!);
      assertExists(userWallet, "User wallet should be created for setup.");
      
      // Use admin client to directly call the RPC for a large credit adjustment.
      const { error: rpcError } = await adminClient.rpc('record_token_transaction', {
        p_wallet_id: userWallet.walletId,
        p_transaction_type: 'CREDIT_ADJUSTMENT',
        p_input_amount_text: veryLargeAmount,
        p_recorded_by_user_id: primaryUserId!, 
        p_notes: 'Test credit of very large amount',
        p_idempotency_key: `idem-large-${crypto.randomUUID()}`,
        p_payment_transaction_id: undefined
      });
      assertEquals(rpcError, null, `RPC call for large credit failed: ${rpcError?.message}`);
  
      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, veryLargeAmount);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: (RLS) returns error for another user's wallet", async () => {
    try {
      const { primaryUserId, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const adminService = new TokenWalletService(adminClient, adminClient);
      const originalUserWallet = await adminService.getWalletForContext(primaryUserId);
      assertExists(originalUserWallet, "Original user's wallet should be created.");

      const { primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
      
      await assertRejects(
        async () => { await secondUserService.getBalance(originalUserWallet!.walletId); },
        Error, // Or specific error due to RLS / not found
        "Wallet not found" // RLS might make it appear as 'not found' to the other user
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: (RLS) fails/error for an org wallet if user is not admin", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'GetBalanceOrgRLS' }, desiredState: {name: 'GetBalanceOrgRLS'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);

      // Main user (admin) creates an org and its wallet
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId!, org.id);
      assertExists(orgWallet, "Org wallet should be created/fetched by admin.");

      // Create a second user (who will not be an admin of this org)
      const { primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
      
      // Second user attempts to get balance (should fail due to RLS)
      await assertRejects(
        async () => { await secondUserService.getBalance(orgWallet!.walletId); },
        Error,
        "Wallet not found" // RLS denial should appear as not found
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: (Input Validation) returns an error if wallet ID is invalid format", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const invalidWalletId = "this-is-not-a-uuid";
      await assertRejects(
        async () => { await tokenWalletService.getBalance(invalidWalletId); },
        Error, // Or a specific input validation error type
        "Invalid wallet ID format"
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getBalance: successfully retrieves a very large balance correctly as a string", async () => {
    try {
      const veryLargeAmount = '9999999999999999999'; // Max 19 digits for NUMERIC(19,0)
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId!);
      assertExists(userWallet, "User wallet should be created for setup.");
      
      // Use admin client to directly call the RPC for a large credit adjustment.
      const { error: rpcError } = await adminClient.rpc('record_token_transaction', {
        p_wallet_id: userWallet.walletId,
        p_transaction_type: 'CREDIT_ADJUSTMENT',
        p_input_amount_text: veryLargeAmount,
        p_recorded_by_user_id: primaryUserId!, 
        p_notes: 'Test credit of very large amount',
        p_idempotency_key: `idem-large-${crypto.randomUUID()}`,
        p_payment_transaction_id: undefined
      });
      assertEquals(rpcError, null, `RPC call for large credit failed: ${rpcError?.message}`);
  
      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, veryLargeAmount);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  // --- End of tests for getBalance ---

  // --- Tests for checkBalance ---
  await t.step("checkBalance: returns true when balance is sufficient", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");
      
      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '50');
      assertEquals(canSpend, true);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: returns true when balance is exactly equal to amount to spend", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");

      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '100');
      assertEquals(canSpend, true);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: returns false when balance is insufficient", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");

      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '101');
      assertEquals(canSpend, false);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: returns false for a new wallet (zero balance) when spending > 0", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");
      
      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '1');
      assertEquals(canSpend, false);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: throws error for a non-existent wallet ID", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const nonExistentWalletId = crypto.randomUUID();
      await assertRejects(
        async () => { await tokenWalletService.checkBalance(nonExistentWalletId, '10'); },
        Error, // Or a more specific error type if defined later
        "Wallet not found" // Or whatever specific message getBalance throws
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: (RLS) throws error when checking another user's wallet", async () => {
    try {
      const { primaryUserId, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const adminService = new TokenWalletService(adminClient, adminClient);
      const originalUserWallet = await adminService.getWalletForContext(primaryUserId);
      assertExists(originalUserWallet, "Original user's wallet should be created.");

      const { primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
        
      await assertRejects(
        async () => { await secondUserService.checkBalance(originalUserWallet.walletId, '10'); },
        Error,
        "Wallet not found" // RLS denial should appear as not found
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });
  
  await t.step("checkBalance: (RLS) throws error for an org wallet if user is not admin", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'org-cb-rls-na' }, desiredState: {name: 'org-cb-rls-na'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const testOrg = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(testOrg?.id);

      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, testOrg.id);
      assertExists(orgWallet, "Org wallet should be created/fetched for RLS test.");
      
      const { primaryUserClient: secondUserClient } = await coreInitializeTestStep({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
      
      await assertRejects(
        async () => { await secondUserService.checkBalance(orgWallet.walletId, '10'); },
        Error,
        "Wallet not found" // RLS denial
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: (Input Validation) throws error for invalid walletId format", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      await assertRejects(
        async () => { await tokenWalletService.checkBalance("not-a-uuid", '10'); },
        Error,
        "Invalid wallet ID format"
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: (Input Validation) throws error for non-numeric amountToSpend", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");

      await assertRejects(
        async () => { await tokenWalletService.checkBalance(userWallet.walletId, "not-a-number"); },
        Error,
        "Amount to spend must be a non-negative integer string"
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: (Input Validation) throws error for negative amountToSpend", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");

      await assertRejects(
        async () => { await tokenWalletService.checkBalance(userWallet.walletId, "-10"); },
        Error,
        "Amount to spend must be a non-negative integer string"
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });
  
  await t.step("checkBalance: (Input Validation) returns true for amountToSpend '0'", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");

      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '0');
      assertEquals(canSpend, true);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: handles large numbers correctly - sufficient balance", async () => {
    try {
      const largeAmount = '9999999999999999999';
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created for large number test.");
      
      const { error: rpcError } = await adminClient.rpc('record_token_transaction', {
        p_wallet_id: userWallet.walletId,
        p_transaction_type: 'CREDIT_ADJUSTMENT',
        p_input_amount_text: largeAmount,
        p_recorded_by_user_id: primaryUserId,
        p_notes: 'Test credit of very large amount',
        p_idempotency_key: `idem-large-check-${crypto.randomUUID()}`
      });
      assertEquals(rpcError, null, `RPC call for large credit failed: ${rpcError?.message}`);

      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, largeAmount);
      assertEquals(canSpend, true);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("checkBalance: handles large numbers correctly - insufficient balance", async () => {
    try {
      const currentBalance = '9999999999999999990'; 
      const amountToSpend =  '9999999999999999999';
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created for large number insufficient test.");
        
      const { error: rpcError } = await adminClient.rpc('record_token_transaction', {
        p_wallet_id: userWallet.walletId,
        p_transaction_type: 'CREDIT_ADJUSTMENT',
        p_input_amount_text: currentBalance,
        p_recorded_by_user_id: primaryUserId,
        p_notes: 'Test credit of large amount for insufficient check',
        p_idempotency_key: `idem-large-check-insufficient-${crypto.randomUUID()}`
      });
      assertEquals(rpcError, null, `RPC call for large credit failed: ${rpcError?.message}`);
        
      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, amountToSpend);
      assertEquals(canSpend, false);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  // --- End of tests for checkBalance ---

  // --- Tests for getTransactionHistory ---
  await t.step("getTransactionHistory: successfully retrieves transactions for a user wallet", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");
      const userWalletId = userWallet.walletId;

      const paymentTxId1 = crypto.randomUUID();
      await adminClient.from('payment_transactions').insert({ id: paymentTxId1, target_wallet_id: userWalletId, payment_gateway_id: 'GTH_USER1', tokens_to_award: 100, status: 'COMPLETED', user_id: primaryUserId });
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'payment_transactions', criteria: { id: paymentTxId1 }, scope: 'local' });
      await tokenWalletService.recordTransaction({ walletId: userWalletId, type: 'CREDIT_PURCHASE', amount: '100', recordedByUserId: primaryUserId, idempotencyKey: `history-credit1-${Date.now()}`, paymentTransactionId: paymentTxId1, notes: "First credit" });

      await tokenWalletService.recordTransaction({ walletId: userWalletId, type: 'DEBIT_USAGE', amount: '30', recordedByUserId: primaryUserId, idempotencyKey: `history-debit-${Date.now()}`, relatedEntityId: 'some-usage-id', relatedEntityType: 'test_usage', notes: "First debit" });

      const paymentTxId3 = crypto.randomUUID();
      await adminClient.from('payment_transactions').insert({ id: paymentTxId3, target_wallet_id: userWalletId, payment_gateway_id: 'GTH_USER2', tokens_to_award: 50, status: 'COMPLETED', user_id: primaryUserId });
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'payment_transactions', criteria: { id: paymentTxId3 }, scope: 'local' });
      await tokenWalletService.recordTransaction({ walletId: userWalletId, type: 'CREDIT_PURCHASE', amount: '50', recordedByUserId: primaryUserId, idempotencyKey: `history-credit2-${Date.now()}`, paymentTransactionId: paymentTxId3, notes: "Second credit" });

      const history = await tokenWalletService.getTransactionHistory(userWalletId);
      // The initial creation transaction + 3 explicit transactions = 4
      assertEquals(history.transactions.length, 4, "Should return all transactions, including the initial one.");
      assertEquals(history.totalCount, 4, "Total count should be 4.");
      assertEquals(history.transactions[0].notes, "Second credit");
      assertEquals(history.transactions[1].notes, "First debit");
      assertEquals(history.transactions[2].notes, "First credit");
      assertEquals(history.transactions[3].type, "CREDIT_INITIAL_FREE_ALLOCATION");
    } finally {
      await coreCleanupTestResources('local');
    }
  });
  
  await t.step("getTransactionHistory: successfully retrieves transactions for an org wallet (user is admin)", async () => {
    try {
      const orgName = `TxHistoryOrg_${crypto.randomUUID()}`;
      const config: TestSetupConfig = {
        resources: [
          { 
            tableName: 'subscription_plans', 
            identifier: { name: 'Free' }, 
            desiredState: { name: 'Free', tokens_to_award: 5000 } 
          },
          { 
            tableName: 'organizations', 
            identifier: { name: orgName }, 
            desiredState: { name: orgName }, 
            exportId: 'org' 
          },
          { 
            tableName: 'organization_members', 
            identifier: { organization_id: { $ref: 'org' } }, 
            desiredState: { role: 'admin', status: 'active' }, 
            linkUserId: true 
          }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);
      
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, org.id);
      assertExists(orgWallet, "Org wallet should be created/fetched.");
      const orgWalletId = orgWallet.walletId;

      // Establish a baseline transaction count to make the test resilient to pre-existing data.
      const initialHistory = await tokenWalletService.getTransactionHistory(orgWalletId);
      const baselineCount = initialHistory.totalCount;

      // Manually add the initial allocation transaction to satisfy the test condition,
      // as orgs don't get one automatically via trigger like users do.
      await tokenWalletService.recordTransaction({
        walletId: orgWalletId,
        type: 'CREDIT_INITIAL_FREE_ALLOCATION',
        amount: '5000', // Align with the 'Free' plan defined in the test config
        recordedByUserId: primaryUserId, // Use the admin user for this test record
        notes: 'Initial token allocation for new organization.',
        idempotencyKey: `org-initial-alloc-${org.id}`
      });
      
      const paymentTxIdOrg1 = crypto.randomUUID();
      await adminClient.from('payment_transactions').insert({ id: paymentTxIdOrg1, target_wallet_id: orgWalletId, payment_gateway_id: 'GTH_ORG1', tokens_to_award: 200, status: 'COMPLETED', user_id: primaryUserId, organization_id: org.id });
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'payment_transactions', criteria: { id: paymentTxIdOrg1 }, scope: 'local' });
      await tokenWalletService.recordTransaction({ walletId: orgWalletId, type: 'CREDIT_PURCHASE', amount: '200', recordedByUserId: primaryUserId, notes: 'Org first credit', idempotencyKey: `org-history-credit1-${Date.now()}`, paymentTransactionId: paymentTxIdOrg1 });

      await tokenWalletService.recordTransaction({ walletId: orgWalletId, type: 'DEBIT_USAGE', amount: '75', recordedByUserId: primaryUserId, notes: 'Org first debit', idempotencyKey: `org-history-debit1-${Date.now()}` });

      const paymentTxIdOrg3 = crypto.randomUUID();
      await adminClient.from('payment_transactions').insert({ id: paymentTxIdOrg3, target_wallet_id: orgWalletId, payment_gateway_id: 'GTH_ORG2', tokens_to_award: 120, status: 'COMPLETED', user_id: primaryUserId, organization_id: org.id });
      registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'payment_transactions', criteria: { id: paymentTxIdOrg3 }, scope: 'local' });
      await tokenWalletService.recordTransaction({ walletId: orgWalletId, type: 'CREDIT_PURCHASE', amount: '120', recordedByUserId: primaryUserId, notes: 'Org second credit', idempotencyKey: `org-history-credit2-${Date.now()}`, paymentTransactionId: paymentTxIdOrg3 });

      const history = await tokenWalletService.getTransactionHistory(orgWalletId);
      // Org wallets are created by a trigger, which also creates an initial transaction.
      assertEquals(history.transactions.length, 4, "Should return all org transactions.");
      assertEquals(history.totalCount, 4, "Total count for org should be 4.");
      
      const notes = history.transactions.map(t => t.notes);
      assert(notes.includes('Org second credit'), "History should contain 'Org second credit'");
      assert(notes.includes('Org first debit'), "History should contain 'Org first debit'");
      assert(notes.includes('Org first credit'), "History should contain 'Org first credit'");

      const types = history.transactions.map(t => t.type);
      assert(types.includes('CREDIT_INITIAL_FREE_ALLOCATION'), "History should contain initial allocation credit");

    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getTransactionHistory: respects pagination parameters", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");
      const userWalletId = userWallet.walletId;

      for (let i = 1; i <= 5; i++) {
        const paymentTxId = crypto.randomUUID();
        await adminClient.from('payment_transactions').insert({ id: paymentTxId, target_wallet_id: userWalletId, payment_gateway_id: `GTH_PAGINATION_${i}`, tokens_to_award: i * 10, status: 'COMPLETED', user_id: primaryUserId });
        registerUndoAction({ type: 'DELETE_CREATED_ROW', tableName: 'payment_transactions', criteria: { id: paymentTxId }, scope: 'local' });
        await tokenWalletService.recordTransaction({ walletId: userWalletId, type: 'CREDIT_PURCHASE', amount: (i * 10).toString(), recordedByUserId: primaryUserId, notes: `Transaction ${i}`, idempotencyKey: `pagination-tx-${i}-${Date.now()}`, paymentTransactionId: paymentTxId });
        if (i < 5) await new Promise(resolve => setTimeout(resolve, 20));
      }

      // Total is 6 (5 created + 1 initial)
      const limitedHistory = await tokenWalletService.getTransactionHistory(userWalletId, { limit: 2 });
      assertEquals(limitedHistory.transactions.length, 2);
      assertEquals(limitedHistory.totalCount, 6);
      assertEquals(limitedHistory.transactions[0].notes, "Transaction 5");

      const offsetHistory = await tokenWalletService.getTransactionHistory(userWalletId, { limit: 2, offset: 2 });
      assertEquals(offsetHistory.transactions.length, 2);
      assertEquals(offsetHistory.transactions[0].notes, "Transaction 3");
      
      const offsetHistory2 = await tokenWalletService.getTransactionHistory(userWalletId, { limit: 2, offset: 4 });
      assertEquals(offsetHistory2.transactions.length, 2); // Now expecting 2: Txn 1 and initial
      assertEquals(offsetHistory2.transactions[0].notes, "Transaction 1");
      assertEquals(offsetHistory2.transactions[1].type, "CREDIT_INITIAL_FREE_ALLOCATION");
    } finally {
      await coreCleanupTestResources('local');
    }
  });
      
  await t.step("getTransactionHistory: returns array with one initial transaction for a new wallet", async () => {
    try {
      // The default setup creates a user, which triggers wallet creation with an initial balance.
      // The default is 100,000 tokens from the 'Free' plan seeded in the DB.
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');

      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created.");

      const history = await tokenWalletService.getTransactionHistory(userWallet.walletId);
      
      assertEquals(history.transactions.length, 1, "History should contain one initial transaction.");
      assertEquals(history.totalCount, 1, "Total count should be 1 for a new wallet.");
      assertEquals(history.transactions[0].type, 'CREDIT_INITIAL_FREE_ALLOCATION');
      assertEquals(history.transactions[0].amount, '100000'); // Adjusted to reflect the actual default.
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getTransactionHistory: (RLS) returns empty array for another user's wallet", async () => {
    try {
      // Setup user one with a wallet and a transaction
      const {
        primaryUserId: userOneId,
        primaryUserClient: userOneClient,
        adminClient
      } = await coreInitializeTestStep({ initialWalletBalance: 100 }, 'local');
      
      const tokenWalletServiceOne = new TokenWalletService(userOneClient, adminClient);
      const userOneWallet = await tokenWalletServiceOne.getWalletForContext(userOneId);
      assertExists(userOneWallet);

      await tokenWalletServiceOne.recordTransaction({
        walletId: userOneWallet.walletId,
        type: 'DEBIT_USAGE',
        amount: '10',
        recordedByUserId: userOneId,
        idempotencyKey: `rls-debit-${crypto.randomUUID()}`
      });

      // Setup user two, who will attempt to access user one's wallet
      const { userClient: userTwoClient } = await coreCreateAndSetupTestUser({}, 'local');
      const tokenWalletServiceTwo = new TokenWalletService(userTwoClient, adminClient);

      // User two tries to get history for user one's wallet
      const history = await tokenWalletServiceTwo.getTransactionHistory(userOneWallet.walletId);

      // RLS should prevent access, resulting in an empty history for user two
      assertEquals(history.transactions.length, 0);
      assertEquals(history.totalCount, 0);
    } finally {
      // coreInitializeTestStep and coreCreateAndSetupTestUser automatically register cleanup
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getTransactionHistory: (RLS) returns empty array for an org wallet if user is not a member", async () => {
    try {
      // 1. Setup an org with a primary user as admin
      const {
        primaryUserId,
        primaryUserClient,
        adminClient,
        processedResources
      } = await coreInitializeTestStep({
        resources: [{
          tableName: 'organizations',
          identifier: { name: 'TxHistoryRLSOrg' },
          desiredState: { name: 'TxHistoryRLSOrg' },
          exportId: 'org'
        }, {
          tableName: 'organization_members',
          identifier: { organization_id: { $ref: 'org' } },
          desiredState: {
            role: 'admin',
            status: 'active'
          },
          linkUserId: true
        }]
      }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);

      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, org.id);
      assertExists(orgWallet, "Org wallet should have been created automatically.");

      // 2. Create a second user who is NOT a member of the org
      const { userClient: secondUserClient } = await coreCreateAndSetupTestUser({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);

      // 3. Second user tries to get history of the org wallet
      const history = await secondUserService.getTransactionHistory(orgWallet.walletId);
      assertEquals(history.transactions.length, 0, "Should return empty transaction array due to RLS on org wallet");
      assertEquals(history.totalCount, 0, "Total count should be 0 due to RLS on org wallet.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getTransactionHistory: throws error for invalid wallet ID", async () => {
    try {
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const invalidWalletId = "not-a-valid-uuid";
      await assertRejects(
          async () => {
              await tokenWalletService.getTransactionHistory(invalidWalletId);
          },
          Error,
          "Invalid input: walletId must be a valid UUID."
      );
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  // --- Tests for getWalletByIdAndUser ---
  // This is a special method used internally for RLS checks, so tests should reflect that.
  await t.step("getWalletByIdAndUser: successfully retrieves a user wallet for the correct user", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should exist.");

      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(userWallet.walletId, primaryUserId);
      assertExists(fetchedWallet, "Fetched wallet should exist when walletId and correct userId are provided.");
      assertEquals(fetchedWallet.walletId, userWallet.walletId);
      assertEquals(fetchedWallet.userId, primaryUserId);
      assertEquals(fetchedWallet.organizationId, undefined);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletByIdAndUser: successfully retrieves an org wallet for an admin user", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'GWBUOrgAdmin' }, desiredState: {name: 'GWBUOrgAdmin'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);
      
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, org.id); // Get the auto-created org wallet
      assertExists(orgWallet, "Org wallet should be created/fetched.");

      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(orgWallet.walletId, primaryUserId);
      assertExists(fetchedWallet, "Fetched org wallet should exist for admin user.");
      assertEquals(fetchedWallet.organizationId, org.id);
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletByIdAndUser: returns null when trying to fetch another user's wallet", async () => {
    try {
      // 1. Create original user and their wallet
      const { primaryUserId: originalUserId, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 }, 'local');
      const adminService = new TokenWalletService(adminClient, adminClient);
      const otherUserWallet = await adminService.getWalletForContext(originalUserId);
      assertExists(otherUserWallet, "Other user's wallet should be created/fetched.");

      // 2. Create the 'main' user who will attempt the fetch
      const { primaryUserId, primaryUserClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      // 3. Main user (via tokenWalletService) tries to fetch another user's wallet using a different user ID
      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(otherUserWallet.walletId, originalUserId);
      assertEquals(fetchedWallet, null, "Should return null when fetching another user's wallet ID with their user ID.");
      
      // 4. Main user tries to fetch another user's wallet using THEIR OWN user ID (should also fail)
      const fetchedWalletAttempt2 = await tokenWalletService.getWalletByIdAndUser(otherUserWallet.walletId, primaryUserId);
      assertEquals(fetchedWalletAttempt2, null, "Should return null when fetching another user's wallet ID with self user ID.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletByIdAndUser: (RLS) returns null for an org wallet if user is not admin", async () => {
    try {
      const config: TestSetupConfig = {
        resources: [
          { tableName: 'organizations', identifier: { name: 'GWBUOrgNotAdmin' }, desiredState: {name: 'GWBUOrgNotAdmin'}, exportId: 'org' },
          { tableName: 'organization_members', identifier: { organization_id: { $ref: 'org' } }, desiredState: { role: 'admin', status: 'active' }, linkUserId: true }
        ]
      };
      const { primaryUserId: adminId, adminClient, processedResources } = await coreInitializeTestStep(config, 'local');
      const org = findProcessedResource(processedResources, 'organizations', 'org');
      assertExists(org?.id);

      const adminService = new TokenWalletService(adminClient, adminClient);
      const orgWallet = await adminService.getWalletForContext(adminId, org.id); // Admin fetches/creates it
      assertExists(orgWallet, "Org wallet should be created/fetched.");

      // Create a second user and make them a non-admin member
      const { primaryUserId: memberId, primaryUserClient: memberClient } = await coreInitializeTestStep({}, 'local');
      await adminClient.from('organization_members').insert({ organization_id: org.id, user_id: memberId, role: 'member', status: 'active' });
      
      const memberService = new TokenWalletService(memberClient, adminClient);
      const fetchedWallet = await memberService.getWalletByIdAndUser(orgWallet.walletId, memberId);
      assertEquals(fetchedWallet, null, "Should return null for org wallet if user is member but not admin.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });

  await t.step("getWalletByIdAndUser: returns null for a non-existent wallet ID", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const nonExistentWalletId = crypto.randomUUID();
      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(nonExistentWalletId, primaryUserId);
      assertEquals(fetchedWallet, null, "Should return null for a non-existent wallet ID.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });
  
  await t.step("getWalletByIdAndUser: returns null for an invalid wallet ID", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({}, 'local');
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const invalidWalletId = "this-is-not-a-uuid";
      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(invalidWalletId, primaryUserId);
      assertEquals(fetchedWallet, null, "Should return null for an invalid wallet ID format.");
    } finally {
      await coreCleanupTestResources('local');
    }
  });
}); 