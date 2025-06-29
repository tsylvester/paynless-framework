import {
  assertEquals,
  assertRejects,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  findProcessedResource,
  registerUndoAction,
} from "../_integration.test.utils.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { TokenWalletService } from "./tokenWalletService.ts";
import {
  type ITokenWalletService,
  type TokenWallet,
} from "../types/tokenWallet.types.ts";
import type { Database } from "../../types_db.ts";

Deno.test("TokenWalletService (Refactored using Test Utility)", async (t) => {
  // --- Helper to set up a secondary user with a wallet ---
  async function setupSecondUserWithWallet(adminClient: SupabaseClient<Database>) {
    // scope 'local' ensures these resources are cleaned up by the test step's teardown
    const { userId, userClient } = await coreCreateAndSetupTestUser({}, "local");
    await coreEnsureTestUserAndWallet(userId, 0, "local");
    const service = new TokenWalletService(userClient, adminClient);
    const wallet = await service.getWalletForContext(userId);
    assertExists(wallet, "Secondary user's wallet should be created and found.");
    return { userId, userClient, service, wallet };
  }

  // --- Tests for getWalletByIdAndUser ---
  await t.step("getWalletByIdAndUser: successfully retrieves current user's own wallet by ID", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 });
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet, "User wallet should exist after setup.");

      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(userWallet.walletId, primaryUserId);
      assertExists(fetchedWallet, "Fetched wallet should exist.");
      assertEquals(fetchedWallet.walletId, userWallet.walletId);
      assertEquals(fetchedWallet.userId, primaryUserId);
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getWalletByIdAndUser: successfully retrieves an org wallet by ID if user is admin", async () => {
    try {
      const orgName = `org-admin-test-${crypto.randomUUID()}`;
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep({
        resources: [{
          tableName: "organizations",
          identifier: { name: orgName },
          desiredState: { name: orgName },
          exportId: "testOrg",
        }, {
          tableName: "organization_members",
          identifier: { organization_id: { $ref: "testOrg_id" } }, // `user_id` is added by `linkUserId`
          desiredState: { role: "admin", status: "active" },
          linkUserId: true,
        }],
        initialWalletBalance: 0,
      });

      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const orgResource = findProcessedResource(processedResources, "testOrg");
      assertExists(orgResource, "Organization resource should be processed.");
      const orgId = orgResource.id;
      assertExists(orgId, "Organization ID should exist.");

      // Wallet for org is created on-demand, let's fetch it.
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, orgId);
      assertExists(orgWallet, "Org wallet should be created/fetched for setup.");

      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(orgWallet.walletId, primaryUserId);
      assertExists(fetchedWallet, "Fetched org wallet should exist for admin.");
      assertEquals(fetchedWallet.walletId, orgWallet.walletId);
      assertEquals(fetchedWallet.organizationId, orgId);
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getWalletByIdAndUser: (RLS) returns null for another user's personal wallet", async () => {
    try {
      // 1. Setup User A (the one trying to access)
      const { primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 });
      const userAService = new TokenWalletService(primaryUserClient, adminClient);
      
      // 2. Setup User B (the owner of the wallet)
      const userB = await setupSecondUserWithWallet(adminClient);

      // 3. User A attempts to fetch User B's wallet
      const fetchedWallet = await userAService.getWalletByIdAndUser(userB.wallet.walletId, userB.userId);
      assertEquals(fetchedWallet, null, "Should return null when fetching another user's personal wallet by ID.");
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getWalletByIdAndUser: (RLS) returns null for org wallet if user is member but not admin", async () => {
    try {
      const orgName = `org-member-test-${crypto.randomUUID()}`;
      // 1. Setup User A (admin) and the organization
      const { adminClient, processedResources } = await coreInitializeTestStep({
        resources: [{
          tableName: "organizations",
          identifier: { name: orgName },
          desiredState: {},
          exportId: "testOrg",
        }, {
          tableName: "organization_members",
          identifier: { organization_id: { $ref: "testOrg_id" } },
          desiredState: { role: "admin", status: "active" },
          linkUserId: true,
        }],
      });

      const orgResource = findProcessedResource(processedResources, "testOrg");
      const orgId = orgResource!.id!;

      // 2. Setup User B (non-admin member)
      const userB = await setupSecondUserWithWallet(adminClient);

      // 3. Add User B to the org as a 'member'
      const {data: member, error} = await adminClient.from("organization_members").insert({
        organization_id: orgId,
        user_id: userB.userId,
        role: "member",
        status: "active",
      }).select().single();
      assertExists(member, `Failed to insert member: ${error?.message}`);

      // Register this manual insertion for cleanup
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'organization_members',
        criteria: { id: member.id },
        scope: 'local'
      });
      
      // 4. Get the org wallet ID (must be fetched by an admin, User A can't do it)
      // We can use the admin client for this setup task.
      const { data: orgWallet } = await adminClient.from('token_wallets').select('wallet_id').eq('organization_id', orgId).single();
      assertExists(orgWallet, "Org wallet must exist for test setup.");

      // 5. User B attempts to get the org wallet
      const fetchedWallet = await userB.service.getWalletByIdAndUser(orgWallet.wallet_id, userB.userId);
      assertEquals(fetchedWallet, null, "Should return null for org wallet when user is member but not admin.");
    } finally {
      await coreCleanupTestResources("local");
    }
  });
  
  await t.step("getWalletByIdAndUser: (RLS) returns null for org wallet if user is not a member", async () => {
    try {
      const orgName = `org-not-member-test-${crypto.randomUUID()}`;
      // 1. Setup User A (admin) and the organization
      const { adminClient, processedResources } = await coreInitializeTestStep({
        resources: [{
          tableName: "organizations",
          identifier: { name: orgName },
          desiredState: { },
          exportId: "testOrg",
        }, {
          tableName: "organization_members",
          identifier: { organization_id: { $ref: "testOrg_id" } },
          desiredState: { role: "admin", status: "active" },
          linkUserId: true,
        }],
      });
      const orgResource = findProcessedResource(processedResources, "testOrg");
      const orgId = orgResource!.id!;

      // 2. Setup User B (the non-member)
      const userB = await setupSecondUserWithWallet(adminClient);

      // 3. Get the org wallet ID
      const { data: orgWallet } = await adminClient.from('token_wallets').select('wallet_id').eq('organization_id', orgId).single();
      assertExists(orgWallet, "Org wallet must exist for test setup.");

      // 4. User B attempts to get the org wallet
      const fetchedWallet = await userB.service.getWalletByIdAndUser(orgWallet.wallet_id, userB.userId);
      assertEquals(fetchedWallet, null, "Should return null for org wallet when user is not a member.");
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getWalletByIdAndUser: returns null for non-existent (valid UUID) wallet ID", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({});
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const nonExistentWalletId = crypto.randomUUID();
      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(nonExistentWalletId, primaryUserId);
      assertEquals(fetchedWallet, null, "Should return null for a non-existent wallet ID.");
    } finally {
        await coreCleanupTestResources("local");
    }
  });

  await t.step("getWalletByIdAndUser: returns null for invalidly formatted wallet ID string", async () => {
    try {
        const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({});
        const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
        const invalidWalletId = "this-is-not-a-uuid";
        const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(invalidWalletId, primaryUserId);
        assertEquals(fetchedWallet, null, "Should return null for an invalidly formatted wallet ID.");
    } finally {
        await coreCleanupTestResources("local");
    }
  });

  // --- Tests for getBalance ---
  await t.step("getBalance: successfully retrieves the balance for an existing user wallet", async () => {
    try {
      const creditAmount = '12345';
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: Number(creditAmount) });
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);

      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, creditAmount);
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: successfully retrieves the balance for an existing organization wallet (user is admin)", async () => {
    try {
      const creditAmount = 54321;
      const orgName = `org-getbalance-test-${crypto.randomUUID()}`;
      const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep({
        resources: [{
          tableName: "organizations",
          identifier: { name: orgName },
          desiredState: {},
          exportId: "testOrg",
        }, {
          tableName: "organization_members",
          identifier: { organization_id: { $ref: "testOrg_id" } },
          desiredState: { role: "admin", status: "active" },
          linkUserId: true,
        }],
      });
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      const orgId = findProcessedResource(processedResources, "testOrg")!.id!;

      // Get the org wallet and credit it using the admin client for setup
      const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, orgId);
      assertExists(orgWallet);
      await adminClient.from('token_wallets').update({ balance: creditAmount }).eq('wallet_id', orgWallet.walletId);

      const balance = await tokenWalletService.getBalance(orgWallet.walletId);
      assertEquals(balance, String(creditAmount));
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: returns '0' for a newly created user wallet", async () => {
    try {
      const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 });
      const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
      
      const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
      assertExists(userWallet);

      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, '0');
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: returns '0' for a newly created organization wallet", async () => {
    try {
        const orgName = `org-new-balance-test-${crypto.randomUUID()}`;
        const { primaryUserId, primaryUserClient, adminClient, processedResources } = await coreInitializeTestStep({
            resources: [{
                tableName: "organizations",
                identifier: { name: orgName },
                desiredState: {},
                exportId: "testOrg",
            }, {
                tableName: "organization_members",
                identifier: { organization_id: { $ref: "testOrg_id" } },
                desiredState: { role: "admin", status: "active" },
                linkUserId: true,
            }],
        });
        const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
        const orgId = findProcessedResource(processedResources, "testOrg")!.id!;

        const orgWallet = await tokenWalletService.getWalletForContext(primaryUserId, orgId);
        assertExists(orgWallet);

        const balance = await tokenWalletService.getBalance(orgWallet.walletId);
        assertEquals(balance, '0');
    } finally {
        await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: returns an error if the wallet ID does not exist", async () => {
    try {
        const { primaryUserClient, adminClient } = await coreInitializeTestStep({});
        const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
        const nonExistentWalletId = crypto.randomUUID();
        await assertRejects(
            async () => { await tokenWalletService.getBalance(nonExistentWalletId); },
            Error,
            "Wallet not found"
        );
    } finally {
        await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: (RLS) fails to retrieve/returns error for another user's wallet", async () => {
    try {
      // 1. Setup User A (the wallet owner) with a known balance.
      const { adminClient, primaryUserId } = await coreInitializeTestStep({ initialWalletBalance: 100 });
      const userAWallet = await new TokenWalletService(adminClient, adminClient).getWalletForContext(primaryUserId);
      assertExists(userAWallet, "User A's wallet should exist.");
      
      // 2. Setup User B (the one trying to access)
      const userB = await setupSecondUserWithWallet(adminClient);
      
      // 3. User B attempts to get User A's wallet balance
      await assertRejects(
        async () => { await userB.service.getBalance(userAWallet.walletId); },
        Error,
        "Wallet not found"
      );
    } finally {
      await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: (RLS) fails/error for an org wallet if user is not admin", async () => {
    try {
        const orgName = `org-rls-balance-test-${crypto.randomUUID()}`;
        const { adminClient, processedResources } = await coreInitializeTestStep({
            resources: [{
                tableName: "organizations",
                identifier: { name: orgName },
                desiredState: {},
                exportId: "testOrg",
            }, {
                tableName: "organization_members",
                identifier: { organization_id: { $ref: "testOrg_id" } },
                desiredState: { role: "admin", status: "active" },
                linkUserId: true,
            }],
        });
        const orgId = findProcessedResource(processedResources, "testOrg")!.id!;

        const userB = await setupSecondUserWithWallet(adminClient);
        const {data: member, error} = await adminClient.from("organization_members").insert({
            organization_id: orgId,
            user_id: userB.userId,
            role: "member", status: "active"
        }).select().single();
        assertExists(member, `Failed to insert member: ${error?.message}`);

        registerUndoAction({
            type: 'DELETE_CREATED_ROW',
            tableName: 'organization_members',
            criteria: { id: member.id },
            scope: 'local'
        });
        
        const { data: orgWallet } = await adminClient.from('token_wallets').select('wallet_id').eq('organization_id', orgId).single();
        assertExists(orgWallet, "Org wallet must exist for test setup.");

        await assertRejects(
            async () => { await userB.service.getBalance(orgWallet.wallet_id); },
            Error,
            "Wallet not found"
        );
    } finally {
        await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: (Input Validation) returns an error if wallet ID is invalid format", async () => {
    try {
        const { primaryUserClient, adminClient } = await coreInitializeTestStep({});
        const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);
        const invalidWalletId = "this-is-not-a-uuid";
        await assertRejects(
            async () => { await tokenWalletService.getBalance(invalidWalletId); },
            Error,
            "Invalid wallet ID format"
        );
    } finally {
        await coreCleanupTestResources("local");
    }
  });

  await t.step("getBalance: successfully retrieves a very large balance correctly as a string", async () => {
    try {
        const veryLargeAmount = '9999999999999999999';
        const { primaryUserId, primaryUserClient, adminClient } = await coreInitializeTestStep({ initialWalletBalance: 0 });
        const tokenWalletService = new TokenWalletService(primaryUserClient, adminClient);

        const userWallet = await tokenWalletService.getWalletForContext(primaryUserId);
        assertExists(userWallet);
        
        // We use `as any` here as a deliberate exception. The DB `balance` column is
        // `numeric` and can handle large numbers, but the auto-generated type is `number`,
        // which loses precision in JS. To test our service's string-based handling of
        // large balances, we must bypass the TS type-check to set the value correctly.
        const { error: updateError } = await adminClient
          .from('token_wallets')
          .update({ balance: veryLargeAmount as any })
          .eq('wallet_id', userWallet.walletId);
        
        if (updateError) {
          throw new Error(`Failed to update balance for test setup: ${updateError.message}`);
        }
        
        const balance = await tokenWalletService.getBalance(userWallet.walletId);
        assertEquals(balance, veryLargeAmount);
    } finally {
        await coreCleanupTestResources("local");
    }
  });
});
