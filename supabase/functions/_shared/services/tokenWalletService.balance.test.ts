import {
  assertEquals,
  assertRejects,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { TokenWalletService } from './tokenWalletService.ts';
import {
  type ITokenWalletService,
} from '../types/tokenWallet.types.ts';
import type { Database } from '../../types_db.ts';
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  type TestSetupConfig,
  type ProcessedResourceInfo,
} from '../_integration.test.utils.ts';

Deno.test("TokenWalletService Balance/Check (Integration)", async (t) => {
  let primaryUserId: string;
  let primaryUserClient: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let tokenWalletService: ITokenWalletService;
  let processedResources: ProcessedResourceInfo[] = [];

  const setup = async (config: TestSetupConfig = {}) => {
    const setupResult = await coreInitializeTestStep(config, 'local');
    primaryUserId = setupResult.primaryUserId;
    primaryUserClient = setupResult.primaryUserClient;
    adminClient = setupResult.adminClient;
    processedResources = setupResult.processedResources;
    tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
    return setupResult;
  };

  try {
    // --- Tests for getBalance ---
    await t.step("getBalance: successfully retrieves the balance for an existing user wallet", async () => {
      await setup({ initialWalletBalance: 12345 });
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created by default setup.");

      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, '12345');
    });

    await t.step("getBalance: successfully retrieves the balance for an existing organization wallet (user is admin)", async () => {
      const orgExportId = 'testOrg';
      await setup({
        resources: [{
          tableName: 'organizations',
          identifier: { id: crypto.randomUUID() },
          desiredState: { name: `Test Org ${Date.now()}` },
          exportId: orgExportId,
        }, {
          tableName: 'organization_members',
          identifier: { organization_id: { $ref: orgExportId } },
          desiredState: { role: 'admin', status: 'active' },
          linkUserId: true,
        }],
      });

      const orgResource = processedResources.find(r => r.exportId === orgExportId);
      assertExists(orgResource, "Organization resource should have been processed.");
      const orgId = (orgResource.resource as any)?.id;
      assertExists(orgId, "Organization ID should exist after creation.");

      // A wallet for the organization is created automatically. We retrieve it here.
      // The `tokenWalletService` is initialized with the user's client, and this user is an org admin.
      const orgWallet = await tokenWalletService.getWalletForContext(undefined, orgId);
      assertExists(orgWallet, "Org wallet should have been automatically created and be retrievable.");
      
      // Credit the wallet
      await adminClient.rpc('record_token_transaction', {
        p_wallet_id: orgWallet.walletId,
        p_transaction_type: 'CREDIT_ADJUSTMENT',
        p_input_amount_text: '54321',
        p_recorded_by_user_id: primaryUserId,
        p_notes: 'Test credit for org getBalance',
        p_idempotency_key: crypto.randomUUID(),
      });

      const balance = await tokenWalletService.getBalance(orgWallet.walletId);
      assertEquals(balance, '54321');
    });

    await t.step("getBalance: returns '0' for a newly created user wallet", async () => {
      await setup({ initialWalletBalance: 0 }); // Explicitly set to 0
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should be created for setup.");
      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, '0');
    });

    await t.step("getBalance: returns an error if the wallet ID does not exist", async () => {
      await setup();
      const nonExistentWalletId = crypto.randomUUID();
      await assertRejects(
        () => tokenWalletService.getBalance(nonExistentWalletId),
        Error,
        "Wallet not found"
      );
    });

    await t.step("getBalance: (RLS) fails for another user's wallet", async () => {
      const { primaryUserClient: firstUserClient, primaryUserId: firstUserId } = await setup();
      const firstUserService = new TokenWalletService(firstUserClient, adminClient);
      const firstUserWallet = await firstUserService.getWalletForContext(firstUserId);
      assertExists(firstUserWallet);

      const { userClient: secondUserClient } = await coreCreateAndSetupTestUser({}, 'local');
      const secondUserService = new TokenWalletService(secondUserClient, adminClient);
      
      await assertRejects(
        () => secondUserService.getBalance(firstUserWallet.walletId),
        Error,
        "Wallet not found"
      );
    });

    await t.step("getBalance: (Input Validation) returns an error if wallet ID is invalid format", async () => {
      await setup();
      await assertRejects(
        () => tokenWalletService.getBalance("not-a-valid-uuid"),
        Error,
        "Invalid wallet ID format"
      );
    });

    // --- Tests for checkBalance ---
    await t.step("checkBalance: returns true when balance is sufficient", async () => {
      await setup({ initialWalletBalance: 100 });
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);
      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '50');
      assertEquals(canSpend, true);
    });

    await t.step("checkBalance: returns true when balance is exactly equal to amount", async () => {
      await setup({ initialWalletBalance: 100 });
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);
      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '100');
      assertEquals(canSpend, true);
    });

    await t.step("checkBalance: returns false when balance is insufficient", async () => {
      await setup({ initialWalletBalance: 100 });
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);
      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '101');
      assertEquals(canSpend, false);
    });

    await t.step("checkBalance: throws error for a non-existent wallet ID", async () => {
      await setup();
      const nonExistentWalletId = crypto.randomUUID();
      await assertRejects(
        () => tokenWalletService.checkBalance(nonExistentWalletId, '10'),
        Error,
        "Wallet not found"
      );
    });

    await t.step("checkBalance: (Input Validation) throws error for invalid walletId format", async () => {
      await setup();
      await assertRejects(
        () => tokenWalletService.checkBalance("not-a-uuid", '10'),
        Error,
        "Invalid wallet ID format"
      );
    });

    await t.step("checkBalance: (Input Validation) throws error for non-numeric amountToSpend", async () => {
      await setup({ initialWalletBalance: 100 });
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);
      await assertRejects(
        () => tokenWalletService.checkBalance(userWallet.walletId, "not-a-number"),
        Error,
        "Amount to spend must be a non-negative integer string"
      );
    });

    await t.step("checkBalance: (Input Validation) throws error for negative amountToSpend", async () => {
      await setup({ initialWalletBalance: 100 });
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);
      await assertRejects(
        () => tokenWalletService.checkBalance(userWallet.walletId, "-10"),
        Error,
        "Amount to spend must be a non-negative integer string"
      );
    });

    await t.step("checkBalance: (Input Validation) returns true for amountToSpend '0'", async () => {
      await setup({ initialWalletBalance: 100 });
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);
      const canSpend = await tokenWalletService.checkBalance(userWallet.walletId, '0');
      assertEquals(canSpend, true);
    });
  } finally {
    await coreCleanupTestResources('all');
  }
}); 