import {
  assertEquals,
  assertRejects,
  assertExists,
  assertNotEquals,
  // assertIsNull, // Removed as it's not a standard Deno assertion
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  stub,
  type Stub,
  assertSpyCall,
} from "https://deno.land/std@0.224.0/testing/mock.ts";

// Ensure SupabaseClient is imported correctly for Deno (npm specifier if not using import map)
import { SupabaseClient, createClient } from 'npm:@supabase/supabase-js@2'; // Specify version for stability
import { TokenWalletService } from './tokenWalletService.ts';
import {
  type ITokenWalletService,
  type TokenWallet,
  type TokenWalletTransaction,
  type TokenWalletTransactionType,
} from '../types/tokenWallet.types.ts'; // Corrected import path
import type { Database } from '../../types_db.ts';

// Configuration for Supabase client - get from environment variables
const supabaseUrl = Deno.env.get('SB_URL');
const supabaseAnonKey = Deno.env.get('SB_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SB_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  throw new Error("Supabase environment variables for tests are not set.");
}

// Create a single Supabase client for all tests in this file
// The service itself will receive this client, or one derived from it.
const supabaseTestClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { 
        persistSession: false, // Recommended for test environments
        autoRefreshToken: false // Disable auto-refresh to prevent leaks in tests
    } 
});

// Admin client for setup/teardown tasks that require bypassing RLS
const supabaseAdminClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// Define TestUserContext for helper function
interface TestUserContext {
  id: string;
  email: string;
}

// Helper function to create a test user
async function createTestUser(
  adminClient: SupabaseClient<Database>,
  options: { email: string; password?: string; email_confirm?: boolean }
): Promise<TestUserContext> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: options.email,
    password: options.password || "password123",
    email_confirm: options.email_confirm === undefined ? true : options.email_confirm,
  });
  if (error) {
    throw new Error(`Failed to create test user ${options.email}: ${error.message}`);
  }
  assertExists(data.user, `User data missing for ${options.email}`);
  // Ensure a profile is created by waiting a bit, can be made more robust if needed
  await new Promise(resolve => setTimeout(resolve, 500)); 
  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('id')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile) {
    console.warn(`Profile not found immediately for ${data.user.id}, ensure triggers are working or manually create if tests fail.`);
  }
  return { id: data.user.id, email: data.user.email as string };
}

// Helper function to set up an organization and make the primary test user an admin
async function createOrgAndMakeUserAdmin(
  orgNamePrefix: string,
  adminClient: SupabaseClient<Database>,
  currentTestUserProfileId: string,
  orgsToCleanupArray: string[]
): Promise<string> {
  const orgId = crypto.randomUUID();
  const orgName = `${orgNamePrefix}-${orgId.substring(0, 8)}`; // Add part of UUID for uniqueness
  const { data: orgData, error: orgInsertError } = await adminClient
    .from('organizations')
    .insert({ id: orgId, name: orgName })
    .select('id')
    .single();

  if (orgInsertError) {
    throw new Error(`Failed to insert dummy organization for test (${orgName}): ${orgInsertError.message}`);
  }
  assertExists(orgData, "Dummy organization data should exist after insert.");
  orgsToCleanupArray.push(orgData.id);

  assertExists(currentTestUserProfileId, "Test user profile ID must exist to make them an org admin.");
  const { error: memberInsertError } = await adminClient
    .from('organization_members')
    .insert({
      organization_id: orgData.id,
      user_id: currentTestUserProfileId,
      role: 'admin',
      status: 'active',
    });
  if (memberInsertError) {
    // Attempt to clean up the org if member insertion fails
    await adminClient.from('organizations').delete().eq('id', orgData.id);
    orgsToCleanupArray.pop(); // Remove if it was added
    throw new Error(`Failed to insert test user into organization_members for org ${orgName}: ${memberInsertError.message}`);
  }
  return orgData.id;
}

// Helper function to set up a complete secondary user context (auth user, client, service)
interface SecondUserFullContext {
  user: TestUserContext;
  client: SupabaseClient<Database>;
  service: ITokenWalletService;
}
async function setupSecondUserContext(
  adminClient: SupabaseClient<Database>,
  // No need to pass supabaseUrl, supabaseAnonKey here as they are module-scoped
): Promise<SecondUserFullContext> {
  const secondUserEmail = `second-user-${Date.now()}@example.com`;
  const user = await createTestUser(adminClient, { email: secondUserEmail });
  assertExists(user, "Second test user should be created by helper.");
  assertExists(user.id, "Second test user ID should exist.");

  const client = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
    email: secondUserEmail,
    password: "password123", // Standard password from createTestUser helper
  });
  if (signInError) {
    // Attempt to clean up the created auth user if sign-in fails
    await adminClient.auth.admin.deleteUser(user.id);
    throw new Error(`Failed to sign in second test user (${secondUserEmail}): ${signInError.message}`);
  }
  assertExists(signInData.session, "Second user session data missing after sign in.");
  client.auth.setSession(signInData.session);
  
  const service = new TokenWalletService(client);
  return { user, client, service };
}

// !!! IMPORTANT: For tests to pass, this ID must correspond to an existing user in your `auth.users` table !!!
// Replace with a real UUID from your development auth.users table, dedicated for testing.
const PRE_EXISTING_TEST_AUTH_USER_ID = Deno.env.get('PRE_EXISTING_TEST_AUTH_USER_ID') || "00000000-0000-0000-0000-000000000000"; 
// Fallback to a nil UUID if not set, which will likely cause profile creation to fail if user doesn't exist, but makes intent clear.

if (PRE_EXISTING_TEST_AUTH_USER_ID === "00000000-0000-0000-0000-000000000000" && Deno.env.get('CI') !== 'true') {
    console.warn("PRE_EXISTING_TEST_AUTH_USER_ID is not set in environment. Tests may fail if the nil UUID doesn't correspond to a user.");
}

// This function creates the mock implementation for rpc.
// It will return a function that itself returns a Promise resolving to the desired structure.
const createRpcMock = (resolveValue: { data: unknown; error: unknown | null }) => {
  return () => Promise.resolve(resolveValue);
};

Deno.test("TokenWalletService (Integration with Dev Server)", async (t) => {
  const tokenWalletService: ITokenWalletService = new TokenWalletService(supabaseTestClient);
  let testUserProfileId: string | null = null; // To store created profile ID for cleanup
  const walletsToCleanup: string[] = []; // Store all created wallet IDs for cleanup
  const orgsToCleanup: string[] = []; // For cleaning up dummy organizations

  const cleanupStepData = async (stepName?: string) => {
    console.log(`[Test Cleanup - ${stepName || 'Global'}] Cleaning up data. Wallets to clean: ${walletsToCleanup.length}, Orgs to clean: ${orgsToCleanup.length}`);
    console.log(`[Test Cleanup - ${stepName || 'Global'}] Wallet IDs: ${JSON.stringify(walletsToCleanup)}`);
    console.log(`[Test Cleanup - ${stepName || 'Global'}] Org IDs: ${JSON.stringify(orgsToCleanup)}`);

    // --- BEGINNING OF CRITICAL CHANGES: Delete payment_transactions first ---

    // 1. Delete payment_transactions linked to the main testUserProfileId
    if (testUserProfileId) {
        console.log(`[Test Cleanup - ${stepName || 'Global'}] Attempting to delete payment_transactions by user_id: ${testUserProfileId}`);
        const { error: ptxUserError } = await supabaseAdminClient
            .from('payment_transactions')
            .delete()
            .eq('user_id', testUserProfileId); // Match the main test user
        if (ptxUserError) {
            // Log error but continue cleanup, as some transactions might not be user-linked but wallet/org linked
            console.error(`[Test Cleanup - ${stepName || 'Global'}] Error cleaning payment_transactions by user_id ${testUserProfileId}:`, ptxUserError);
        } else {
            console.log(`[Test Cleanup - ${stepName || 'Global'}] Successfully deleted payment_transactions by user_id ${testUserProfileId}.`);
        }
    }

    // 2. Delete payment_transactions linked to wallets marked for cleanup
    if (walletsToCleanup.length > 0) {
        console.log(`[Test Cleanup - ${stepName || 'Global'}] Attempting to delete payment_transactions by target_wallet_id(s): ${JSON.stringify(walletsToCleanup)}`);
        const { error: ptxWalletError } = await supabaseAdminClient
            .from('payment_transactions')
            .delete()
            .in('target_wallet_id', walletsToCleanup);
        if (ptxWalletError) {
            console.error(`[Test Cleanup - ${stepName || 'Global'}] Error cleaning payment_transactions by target_wallet_id:`, ptxWalletError);
        } else {
            console.log(`[Test Cleanup - ${stepName || 'Global'}] Successfully deleted payment_transactions by target_wallet_id.`);
        }
    }

    // 3. Delete payment_transactions linked to orgs marked for cleanup
    // This might overlap with user/wallet deletions but ensures org-specific ones are caught.
    if (orgsToCleanup.length > 0) {
        console.log(`[Test Cleanup - ${stepName || 'Global'}] Attempting to delete payment_transactions by organization_id(s): ${JSON.stringify(orgsToCleanup)}`);
        const { error: ptxOrgError } = await supabaseAdminClient
            .from('payment_transactions')
            .delete()
            .in('organization_id', orgsToCleanup);
        if (ptxOrgError) {
            console.error(`[Test Cleanup - ${stepName || 'Global'}] Error cleaning payment_transactions by organization_id:`, ptxOrgError);
        } else {
            console.log(`[Test Cleanup - ${stepName || 'Global'}] Successfully deleted payment_transactions by organization_id.`);
        }
    }
    // --- END OF CRITICAL CHANGES ---

    for (const walletId of walletsToCleanup) {
      console.log(`[Test Cleanup - ${stepName || 'Global'}] Attempting to delete transactions for wallet ${walletId}`);
      const { error: txnError } = await supabaseAdminClient // Use admin client for cleanup
        .from('token_wallet_transactions')
        .delete()
        .eq('wallet_id', walletId);
      if (txnError) {
        console.error(`[Test Cleanup - ${stepName || 'Global'}] Error cleaning transactions for wallet ${walletId}:`, txnError);
      } else {
        console.log(`[Test Cleanup - ${stepName || 'Global'}] Successfully deleted transactions for wallet ${walletId}`);
      }
      
      console.log(`[Test Cleanup - ${stepName || 'Global'}] Attempting to delete wallet ${walletId}`);
      const { error: walletError } = await supabaseAdminClient // Use admin client for cleanup
        .from('token_wallets')
        .delete()
        .eq('wallet_id', walletId);
      if (walletError) {
        console.error(`[Test Cleanup - ${stepName || 'Global'}] Error cleaning wallet ${walletId}:`, walletError);
      } else {
        console.log(`[Test Cleanup - ${stepName || 'Global'}] Successfully deleted wallet ${walletId}`);
      }
    }
    walletsToCleanup.length = 0; // Clear the array after processing

    for (const orgId of orgsToCleanup) {
      console.log(`[Test Cleanup - ${stepName || 'Global'}] Attempting to delete members for organization ${orgId}`);
      const { error: memberDeleteError } = await supabaseAdminClient
        .from('organization_members')
        .delete()
        .eq('organization_id', orgId);
      if (memberDeleteError) {
        console.warn(`[Test Cleanup - ${stepName || 'Global'}] Warning cleaning members for organization ${orgId}:`, memberDeleteError);
      } else {
        console.log(`[Test Cleanup - ${stepName || 'Global'}] Successfully deleted members for org ${orgId}`);
      }

      console.log(`[Test Cleanup - ${stepName || 'Global'}] Attempting to delete organization ${orgId}`);
      const { error: orgError } = await supabaseAdminClient // Use admin client for cleanup
        .from('organizations') 
        .delete()
        .eq('id', orgId);
      if (orgError) {
        console.error(`[Test Cleanup - ${stepName || 'Global'}] Error cleaning organization ${orgId}:`, orgError);
      } else {
        console.log(`[Test Cleanup - ${stepName || 'Global'}] Successfully deleted org ${orgId}`);
      }
    }
    orgsToCleanup.length = 0; // Clear the array after processing
  };

  // Global test setup for auth user (runs once before all steps in this test block)
  await t.step("Global Setup: Create Test Auth User and Set Session", async () => {
    const testUserEmail = `test-wallet-user-${Date.now()}@example.com`;
    const testUserPassword = "password123";
    // Use admin client to create the user to ensure it can be done even if signups are disabled
    const { data: adminUserData, error: adminUserError } = await supabaseAdminClient.auth.admin.createUser({
        email: testUserEmail,
        password: testUserPassword,
        email_confirm: true, // Auto-confirm user for testing
    });

    if (adminUserError) {
        console.error("Failed to create test auth user with admin client:", adminUserError);
        throw new Error(`Failed to create test auth user with admin client: ${adminUserError.message}`);
    }
    assertExists(adminUserData.user, "Test auth user data missing after admin creation.");
    testUserProfileId = adminUserData.user.id;
    console.log(`[Test Setup] Created test auth user with admin client: ${testUserProfileId}`);

    console.log(`[Test Setup] Attempting to delete pre-existing personal wallet for user: ${testUserProfileId}`);
    const { error: preDeleteError, count: preDeleteCount } = await supabaseAdminClient
      .from('token_wallets')
      .delete()
      .eq('user_id', testUserProfileId!)
      .is('organization_id', null);
    if (preDeleteError) {
      console.error(`[Test Setup] Error deleting pre-existing personal wallet for ${testUserProfileId}:`, preDeleteError);
    } else {
      console.log(`[Test Setup] Ensured no pre-existing personal wallet for user: ${testUserProfileId}. Wallets deleted: ${preDeleteCount}`);
    }

    // Manually create a session for the supabaseTestClient (anon key client)
    // This simulates user login for RLS testing against user-specific policies.
    // Note: This doesn't use the adminUserData.session directly as that's for admin.
    // We need to sign in as the user with the anon client.
    const { data: signInData, error: signInError } = await supabaseTestClient.auth.signInWithPassword({
        email: testUserEmail,
        password: testUserPassword,
    });
    if (signInError) {
        console.error(`[Test Setup] Failed to sign in test user ${testUserProfileId}:`, signInError);
        await supabaseAdminClient.auth.admin.deleteUser(testUserProfileId); // cleanup auth user
        throw new Error(`Failed to sign in test user: ${signInError.message}`);
    }
    assertExists(signInData.session, "Session data missing after sign in.");
    supabaseTestClient.auth.setSession(signInData.session); // Set session for the user-context client
    console.log(`[Test Setup] Set session for supabaseTestClient for user: ${testUserProfileId}`);

    // Verify user_profile creation (trigger should handle this)
    await new Promise(resolve => setTimeout(resolve, 1000));
    const { data: userProfile, error: profileFetchError } = await supabaseTestClient
      .from('user_profiles')
      .select('id')
      .eq('id', testUserProfileId)
      .single();

    if (profileFetchError) {
      console.error(`[Test Setup] Error fetching user profile for ${testUserProfileId}: ${profileFetchError.message}`);
      await supabaseAdminClient.auth.admin.deleteUser(testUserProfileId); // cleanup auth user
      throw new Error(`Failed to fetch user profile: ${profileFetchError.message}.`);
    }
    assertExists(userProfile, "Test user profile should exist.");
    assertEquals(userProfile.id, testUserProfileId);
    console.log(`[Test Setup] Verified user_profile exists for ${testUserProfileId}`);
  });

  // --- Tests for getWallet --- 

  await t.step("getWallet: successfully retrieves an existing user wallet", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let createdWallet: TokenWallet | null = null;
    const stepName = "getWallet_user";
    try {
      createdWallet = await tokenWalletService.createWallet(testUserProfileId, undefined);
      assertExists(createdWallet, "User wallet should be created for setup.");
      walletsToCleanup.push(createdWallet.walletId);
      const fetchedWallet = await tokenWalletService.getWallet(createdWallet.walletId);
      assertExists(fetchedWallet, "Fetched wallet should exist.");
      assertEquals(fetchedWallet.walletId, createdWallet.walletId);
      assertEquals(fetchedWallet.userId, testUserProfileId);
      assertEquals(fetchedWallet.organizationId, undefined);
      assertEquals(fetchedWallet.balance, '0');
      assertEquals(fetchedWallet.currency, 'AI_TOKEN');
      assertExists(fetchedWallet.createdAt, "createdAt should be present.");
      assertExists(fetchedWallet.updatedAt, "updatedAt should be present.");
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getWallet: successfully retrieves an existing organization wallet", async (t) => {
    const step = t.step;
    let testOrgId: string | undefined;
    let orgWalletId: string | undefined;

    await step("Setup: Create dummy organization and admin member", async () => {
      testOrgId = crypto.randomUUID();
      // Ensure the organization is added to orgsToCleanup
      const { data: orgData, error: orgInsertError } = await supabaseAdminClient
        .from("organizations")
        .insert({ id: testOrgId, name: "Test Org for Wallet" })
        .select('id')
        .single();
      if (orgInsertError) throw new Error(`Failed to insert org for getWallet test: ${orgInsertError.message}`);
      assertExists(orgData, "Org data should exist after insert for getWallet test.");
      orgsToCleanup.push(orgData.id); // Add to cleanup
      testOrgId = orgData.id; // Use the actual inserted ID

      assertExists(testUserProfileId, "testUserProfileId should be defined for org membership");
      await supabaseAdminClient.from("organization_members").insert({
        organization_id: testOrgId,
        user_id: testUserProfileId, 
        role: "admin",
        status: "active",
      });
      console.log(`[Test Debug] Setup: Org ID: ${testOrgId}, User ID: ${testUserProfileId} made admin.`);
    });

    // REVISED STEP: Fetch the wallet assuming it's auto-created by a trigger
    await step("Fetch auto-created organization wallet (assuming trigger exists)", async () => {
      assertExists(testOrgId, "testOrgId must be defined for fetching its wallet");
      assertExists(testUserProfileId, "testUserProfileId must be defined for fetching org wallet context");
      
      const autoCreatedWallet = await tokenWalletService.getWalletForContext(testUserProfileId, testOrgId);
      
      assertExists(autoCreatedWallet, "Organization wallet should be auto-created by trigger and retrievable by service");
      assertExists(autoCreatedWallet.walletId, "Org wallet ID should exist after retrieval");
      assertEquals(autoCreatedWallet.organizationId, testOrgId, "Fetched wallet's organizationId should match the testOrgId.");
      //assertEquals(autoCreatedWallet.userId, undefined, "User ID should be undefined on an org-specific wallet fetched this way.");
      assertEquals(autoCreatedWallet.balance, '0', "Auto-created org wallet should have zero balance.");
      assertEquals(autoCreatedWallet.currency, 'AI_TOKEN', "Auto-created org wallet should have AI_TOKEN currency.");
      
      orgWalletId = autoCreatedWallet.walletId; // Store for the next step
      if (orgWalletId) { // Add to cleanup only if successfully retrieved
          walletsToCleanup.push(orgWalletId);
      }
      console.log(`[Test Debug] Wallet fetched by getWalletForContext: ${JSON.stringify(autoCreatedWallet)}`);
    });

    await step("Fetch organization wallet using service (as authenticated user)", async () => {
      assertExists(orgWalletId, "orgWalletId should be defined for fetching");
      assertExists(testOrgId, "testOrgId should be defined for RPC check");

      // Debug RPC call to is_admin_of_org_for_wallet (Optional, but good for sanity check)
      console.log(`[Test Debug] Pre-getWallet: Calling is_admin_of_org_for_wallet with orgId: ${testOrgId} using supabaseTestClient (auth.uid() perspective)`);
      const { data: rpcCheckData, error: rpcCheckError } = await supabaseTestClient.rpc(
        "is_admin_of_org_for_wallet" as any, 
        { p_organization_id: testOrgId }
      );
      console.log(`[Test Debug] Pre-getWallet: RPC is_admin_of_org_for_wallet result: data=${JSON.stringify(rpcCheckData)}, error=${JSON.stringify(rpcCheckError)}`);
      assertEquals(rpcCheckError, null, "RPC check for admin status should not error.");
      assertEquals(rpcCheckData, true, "RPC check should confirm user is admin of the org.");

      const fetchedWallet = await tokenWalletService.getWallet(orgWalletId); // Fetch by ID now
      console.log(`[Test Debug] Wallet fetched by getWallet(orgWalletId): ${JSON.stringify(fetchedWallet)}`);
      assertExists(fetchedWallet, "Fetched org wallet should exist when fetching by ID.");
      assertEquals(fetchedWallet.walletId, orgWalletId);
      assertEquals(fetchedWallet.organizationId, testOrgId);
    });
    // Cleanup for orgsToCleanup and walletsToCleanup is handled by the global Deno.test teardown (cleanupStepData)
  });

  await t.step("getWallet: returns null for an organization wallet if the user is a member but not an admin", async (t) => {
    const step = t.step;
    let testNonAdminOrgId: string | undefined;
    let orgWalletNonAdminId: string | undefined;
    let dummyAdminForNonAdminTest: TestUserContext | undefined;

    await step("Setup: Create dummy organization, a dummy admin, and test user as non-admin member", async () => {
      testNonAdminOrgId = crypto.randomUUID();
      await supabaseAdminClient.from("organizations").insert({ id: testNonAdminOrgId, name: "Test Org for Non-Admin Wallet" });

      // Create a separate dummy admin user for this organization
      dummyAdminForNonAdminTest = await createTestUser(supabaseAdminClient, { // Corrected: Using defined helper
          email: `dummy-admin-${Date.now()}@example.com`,
          password: "password123",
      });
      assertExists(dummyAdminForNonAdminTest, "Dummy admin user for non-admin test should be created.");
      assertExists(dummyAdminForNonAdminTest.id, "Dummy admin user ID should exist.");

      await supabaseAdminClient.from("organization_members").insert({
        organization_id: testNonAdminOrgId,
        user_id: dummyAdminForNonAdminTest.id,
        role: "admin",
        status: "active",
      });
      console.log(`[Test Debug NonAdmin] Setup: Org ID: ${testNonAdminOrgId}, Dummy Admin ID: ${dummyAdminForNonAdminTest.id}`);

      // Add the main testAuthUser as a 'member' (not admin)
      assertExists(testUserProfileId, "testUserProfileId should be defined for non-admin org membership");
      await supabaseAdminClient.from("organization_members").insert({
        organization_id: testNonAdminOrgId,
        user_id: testUserProfileId, // Corrected from testAuthUser.id
        role: "member", // Non-admin role
        status: "active",
      });
      console.log(`[Test Debug NonAdmin] Setup: Test User ID: ${testUserProfileId} added as 'member' to org ${testNonAdminOrgId}.`); // Corrected
    });

    await step("Create organization wallet for non-admin test scenario", async () => {
        assertExists(testNonAdminOrgId, "testNonAdminOrgId should be defined for non-admin wallet creation");
        assertExists(dummyAdminForNonAdminTest, "Dummy admin user must exist to fetch org wallet");
        assertExists(dummyAdminForNonAdminTest.id, "Dummy admin user ID must exist");

        // Fetch the auto-created wallet using the dummy admin's context
        // The main tokenWalletService is for the testUserProfileId, who is NOT admin of this org.
        // We need a service instance that can see the org wallet.
        // For simplicity in this test setup, we can assume that if the org exists,
        // and an admin *could* see its wallet, then the wallet exists.
        // Or, create a temporary service for the dummy admin if direct fetch is needed.
        // Let's use getWalletForContext with the main service but provide the dummy admin's ID.
        // This relies on getWalletForContext's RLS allowing an admin to fetch it.
        // If TokenWalletService uses the client it was instantiated with, we'd need a different approach.
        // For now, assuming getWalletForContext can operate with the provided userId if different from the service's client auth.
        // Given previous logs, getWalletForContext uses the client it's instantiated with.
        // So, we fetch using the *admin client's service instance* or expect an admin to be able to see it.
        // Let's re-evaluate: the goal is to get the orgWalletNonAdminId.
        // The trigger should have created it. We can fetch it using an ADMIN client.
        const adminService = new TokenWalletService(supabaseAdminClient); // Use admin client to bypass RLS for setup
        const wallet = await adminService.getWalletForContext(undefined, testNonAdminOrgId);

        assertExists(wallet, "Organization wallet for non-admin test should be auto-created and fetched by admin service");
        orgWalletNonAdminId = wallet.walletId;
        walletsToCleanup.push(orgWalletNonAdminId); // Ensure it's cleaned up
        console.log(`[Test Debug NonAdmin] Wallet fetched for non-admin scenario (by admin): ${JSON.stringify(wallet)}`);
    });

    await step("Fetch organization wallet using service (as non-admin member)", async () => {
      assertExists(orgWalletNonAdminId, "orgWalletNonAdminId should be defined");
      assertExists(testNonAdminOrgId, "testNonAdminOrgId should be defined for RPC check");

      // Optional: Debug RPC call to is_admin_of_org_for_wallet (should be false)
      console.log(`[Test Debug NonAdmin] Pre-getWallet: Calling is_admin_of_org_for_wallet with orgId: ${testNonAdminOrgId} using supabaseTestClient`);
      const { data: rpcCheckData, error: rpcCheckError } = await supabaseTestClient.rpc(
          "is_admin_of_org_for_wallet" as any, // Added 'as any' to bypass type error
          { p_organization_id: testNonAdminOrgId }
      );
      console.log(`[Test Debug NonAdmin] Pre-getWallet: RPC is_admin_of_org_for_wallet result: data=${JSON.stringify(rpcCheckData)}, error=${JSON.stringify(rpcCheckError)}`);


      const fetchedWallet = await tokenWalletService.getWallet(orgWalletNonAdminId);
      console.log(`[Test Debug NonAdmin] Wallet fetched by SERVICE (test client as non-admin): ${JSON.stringify(fetchedWallet)}`);
      assertEquals(fetchedWallet, null, "Fetched org wallet should be null for a non-admin member.");
    });
  });

  await t.step("getWallet: returns null for a non-existent (but valid UUID) wallet ID", async () => {
    const nonExistentWalletId = crypto.randomUUID();
    const fetchedWallet = await tokenWalletService.getWallet(nonExistentWalletId);
    assertEquals(fetchedWallet, null, "Should return null for a non-existent wallet ID.");
  });

  await t.step("getWallet: returns null for an invalidly formatted wallet ID string", async () => {
    const invalidWalletId = "this-is-not-a-uuid";
    const fetchedWallet = await tokenWalletService.getWallet(invalidWalletId);
    assertEquals(fetchedWallet, null, "Should return null for an invalidly formatted wallet ID.");
  });

  await t.step("getWallet: (RLS) returns null when trying to fetch another user's wallet", async () => {
    assertExists(testUserProfileId, "Original test user profile ID must exist.");
    let originalUserWallet: TokenWallet | null = null;
    let secondUserFullCtx: SecondUserFullContext | null = null;

    const stepName = "getWallet_RLS";
    try {
      originalUserWallet = await tokenWalletService.createWallet(testUserProfileId);
      assertExists(originalUserWallet, "Original user's wallet should be created.");
      walletsToCleanup.push(originalUserWallet.walletId);

      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);
      
      const fetchedWalletBySecondUser = await secondUserFullCtx.service.getWallet(originalUserWallet.walletId);
      assertEquals(fetchedWalletBySecondUser, null, "Second user should not be able to fetch original user's wallet.");

    } finally {
      if (secondUserFullCtx?.user.id) {
        const { error: deleteError } = await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
        if (deleteError) console.error(`[Test Cleanup - ${stepName}] Error deleting second test user ${secondUserFullCtx.user.id}:`, deleteError.message);
      }
    }
  });

  // --- End of tests for getWallet --- 

  // --- Tests for getWalletForContext ---
  await t.step("getWalletForContext: successfully retrieves a user wallet given only userId", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let userWallet: TokenWallet | null = null;
    const stepName = "getWalletForContext_user";
    try {
      console.log(`[${stepName}] Attempting to delete personal wallet for ${testUserProfileId!} before creation.`);
      const {error: delError, count: delCount} = await supabaseAdminClient
        .from('token_wallets')
        .delete()
        .eq('user_id', testUserProfileId!)
        .is('organization_id', null);
      if(delError) console.error(`[${stepName}] Error in pre-delete:`, delError);
      console.log(`[${stepName}] Pre-deleted ${delCount} personal wallets for ${testUserProfileId!}.`);

      userWallet = await tokenWalletService.createWallet(testUserProfileId!); 
      assertExists(userWallet, "User wallet should be created for setup.");
      walletsToCleanup.push(userWallet.walletId);

      const fetchedWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, undefined);
      assertExists(fetchedWallet, "Fetched wallet should exist when userId is provided.");
      assertEquals(fetchedWallet.walletId, userWallet.walletId);
      assertEquals(fetchedWallet.userId, testUserProfileId);
      assertEquals(fetchedWallet.organizationId, undefined);
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getWalletForContext: successfully retrieves an org wallet given orgId and admin userId", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    const tempOrgId = await createOrgAndMakeUserAdmin("CtxOrg", supabaseAdminClient, testUserProfileId!, orgsToCleanup);

    try {
      orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, tempOrgId);
      assertExists(orgWallet, "Org wallet should be created/fetched for setup.");
      walletsToCleanup.push(orgWallet.walletId);

      const fetchedWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, tempOrgId);
      assertExists(fetchedWallet, "Fetched org wallet should exist when orgId and admin userId are provided.");
      assertEquals(fetchedWallet.walletId, orgWallet.walletId);
      assertEquals(fetchedWallet.organizationId, tempOrgId);
      // For an org wallet, userId might be undefined or the user's ID depending on desired return structure.
      // Current implementation of _transformDbWalletToTokenWallet sets userId to undefined if dbData.user_id is null.
      assertEquals(fetchedWallet.userId, undefined, "User ID should be undefined on fetched org wallet.");
    } finally {
      // Orgs and wallets are cleaned up by their respective arrays handled by cleanupStepData
      // No need to call cleanupStepData(stepName) here as it's handled globally or by other pushes.
    }
  });

  await t.step("getWalletForContext: returns null if neither userId nor organizationId is provided", async () => {
    const result = await tokenWalletService.getWalletForContext(undefined, undefined);
    assertEquals(result, null, "Should return null if no IDs are provided.");
  });

  await t.step("getWalletForContext: returns null if userId provided but no wallet exists", async () => {
    const nonExistentUserId = crypto.randomUUID();
    const result = await tokenWalletService.getWalletForContext(nonExistentUserId, undefined);
    assertEquals(result, null, "Should return null if userId provided but no wallet exists.");
  });

  await t.step("getWalletForContext: returns null if orgId provided but no wallet exists", async () => {
    const nonExistentOrgId = crypto.randomUUID();
    const result = await tokenWalletService.getWalletForContext(testUserProfileId!, nonExistentOrgId);
    assertEquals(result, null, "Should return null if orgId provided but no wallet exists for that user/org combo.");
  });

  await t.step("getWalletForContext: (RLS) returns null for org wallet if user not admin/member", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    let secondUserFullCtx: SecondUserFullContext | null = null;
    
    // 1. Setup: Create org, add original testUser as admin, create/fetch wallet
    const orgIdForRlsTest = await createOrgAndMakeUserAdmin("RLSOrgNotAdmin", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
    orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgIdForRlsTest);
    assertExists(orgWallet, "Org wallet for RLS test should be created/fetched.");
    walletsToCleanup.push(orgWallet.walletId);

    try {
      // 2. Create a second user who is NOT a member of the org (and thus not an admin)
      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);

      // 3. Second user (non-member) attempts to get org wallet via context
      assertExists(secondUserFullCtx.user, "Second test user must exist for this assertion call.");
      assertExists(secondUserFullCtx.service, "Second user service must exist for this assertion call.");
      const fetchedWallet = await secondUserFullCtx.service.getWalletForContext(secondUserFullCtx.user.id, orgIdForRlsTest); 
      assertEquals(fetchedWallet, null, "Should return null for org wallet when user is not a member/admin.");
    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
    }
  });

  await t.step("getWalletForContext: prioritizes org wallet if both userId and orgId provided", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let userWallet: TokenWallet | null = null;
    let orgWallet: TokenWallet | null = null;
    const stepName = "getWalletForContext_priority";

    // 1. Create an org and make the current test user an admin
    const orgIdForPriorityTest = await createOrgAndMakeUserAdmin("CtxPrioOrg", supabaseAdminClient, testUserProfileId!, orgsToCleanup);

    try {
      console.log(`[${stepName}] Attempting to delete personal wallet for ${testUserProfileId!} before creation.`);
      const {error: delError, count: delCount} = await supabaseAdminClient
        .from('token_wallets')
        .delete()
        .eq('user_id', testUserProfileId!)
        .is('organization_id', null);
      if(delError) console.error(`[${stepName}] Error in pre-delete:`, delError);
      console.log(`[${stepName}] Pre-deleted ${delCount} personal wallets for ${testUserProfileId!}.`);
      
      userWallet = await tokenWalletService.createWallet(testUserProfileId!); 
      assertExists(userWallet, "User wallet for priority test should be created.");
      walletsToCleanup.push(userWallet.walletId);

      // 2. Create an org and its wallet, add user as admin
      await supabaseAdminClient.from('organizations').insert({ id: orgIdForPriorityTest, name: `Priority Test Org ${orgIdForPriorityTest}` });
      orgsToCleanup.push(orgIdForPriorityTest);
      await supabaseAdminClient.from('organization_members').insert({
        organization_id: orgIdForPriorityTest, user_id: testUserProfileId!, role: 'admin', status: 'active'
      });
      orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgIdForPriorityTest);
      assertExists(orgWallet, "Org wallet for priority test should be created/fetched.");
      walletsToCleanup.push(orgWallet.walletId);

      const fetchedWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgIdForPriorityTest);
      assertExists(fetchedWallet, "Wallet should be fetched when both IDs provided.");
      assertEquals(fetchedWallet.walletId, orgWallet.walletId, "Should prioritize and fetch org wallet.");
      assertEquals(fetchedWallet.organizationId, orgIdForPriorityTest);
      // Based on current _transformDbWalletToTokenWallet, userId will be undefined for an org wallet from this query
      assertEquals(fetchedWallet.userId, undefined, "User ID should be undefined on fetched org wallet in this context.");
    } finally {
      await cleanupStepData(stepName);
    }
  });
  
  await t.step("getWalletForContext: (RLS) returns null if called with a different userId than authenticated user", async () => {
    assertExists(testUserProfileId, "Authenticated user ID must exist.");
    let otherUserWallet: TokenWallet | null = null;
    let otherTestUserContext: TestUserContext | null = null; // Renamed to avoid conflict with outer scope

    try {
      // 1. Create another user (but we won't use their client/service, just their ID)
      const tempSecondUser = await createTestUser(supabaseAdminClient, { email: `other-ctx-user-${Date.now()}@example.com` });
      otherTestUserContext = tempSecondUser;
      assertExists(otherTestUserContext, "Other test user context should be created.");
      assertExists(otherTestUserContext.id, "Other test user ID should exist.");
      
      // Create/fetch a wallet for this "other" user using an admin service instance for simplicity in setup
      const adminService = new TokenWalletService(supabaseAdminClient);
      otherUserWallet = await adminService.getWalletForContext(otherTestUserContext.id, undefined);
      assertExists(otherUserWallet, "Other user's wallet should be created/fetched.");
      walletsToCleanup.push(otherUserWallet.walletId);

      // 2. Authenticated user (tokenWalletService for testUserProfileId) tries to fetch otherUser's wallet
      const fetchedWallet = await tokenWalletService.getWalletForContext(otherTestUserContext.id, undefined);
      assertEquals(fetchedWallet, null, "Should not fetch another user's personal wallet by providing their ID due to RLS.");

    } finally {
      if (otherTestUserContext?.id) {
        await supabaseAdminClient.auth.admin.deleteUser(otherTestUserContext.id);
      }
    }
  });

  // --- End of tests for getWalletForContext ---

  // Global Teardown (runs once after all steps in this test block)
  await t.step("Global Teardown: Clean up Auth User and Profile", async () => {
    await cleanupStepData("GlobalTeardown_WalletsOrgs"); // Explicitly call here to ensure it runs before user deletion
    
    // Attempt to sign out the test client's session
    if (supabaseTestClient) {
      console.log("[Global Teardown] Attempting to sign out from supabaseTestClient");
      const { error: signOutError } = await supabaseTestClient.auth.signOut();
      if (signOutError) {
        console.warn("[Global Teardown] Error signing out supabaseTestClient:", signOutError.message);
      } else {
        console.log("[Global Teardown] Successfully signed out from supabaseTestClient");
      }
    }

    if (testUserProfileId) {
        // user_profile should be deleted by cascade when auth user is deleted if FK is set up correctly
        console.log(`[Global Teardown] Cleaning up auth user ${testUserProfileId}`);
        const { error: authUserDeleteError } = await supabaseAdminClient.auth.admin.deleteUser(testUserProfileId);
        if (authUserDeleteError) {
            console.error(`[Global Teardown] Error deleting auth user ${testUserProfileId}:`, authUserDeleteError.message);
        } else {
            console.log(`[Global Teardown] Successfully deleted auth user ${testUserProfileId}`);
        }
        // Attempt to clean profile just in case cascade isn't immediate or set up for user_profiles from auth.users directly
        const { error: profileError } = await supabaseAdminClient
          .from('user_profiles')
          .delete()
          .eq('id', testUserProfileId);
        if (profileError && profileError.code !== 'PGRST204') { // PGRST204 = No Content, means already deleted
             console.warn(`[Global Teardown] Issue cleaning user_profile ${testUserProfileId} (may already be deleted by cascade):`, profileError.message);
        }
        testUserProfileId = null;
    }
  });
}); 