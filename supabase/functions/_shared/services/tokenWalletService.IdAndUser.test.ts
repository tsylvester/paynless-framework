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



  // --- Tests for getWalletByIdAndUser ---

  await t.step("getWalletByIdAndUser: successfully retrieves current user's own wallet by ID", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let userWallet: TokenWallet | null = null;
    const stepName = "getWalletByIdAndUser_self";
    try {
      userWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(userWallet, "User wallet should be created for setup.");
      walletsToCleanup.push(userWallet.walletId);

      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(userWallet.walletId, testUserProfileId!);
      assertExists(fetchedWallet, "Fetched wallet should exist.");
      assertEquals(fetchedWallet.walletId, userWallet.walletId);
      assertEquals(fetchedWallet.userId, testUserProfileId);
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getWalletByIdAndUser: successfully retrieves an org wallet by ID if user is admin", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    const stepName = "getWalletByIdAndUser_org_admin";
    const orgId = await createOrgAndMakeUserAdmin("GWBUOrgAdmin", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
    try {
      orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId); // Get the auto-created org wallet
      assertExists(orgWallet, "Org wallet should be created/fetched for setup.");
      walletsToCleanup.push(orgWallet.walletId);

      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(orgWallet.walletId, testUserProfileId!);
      assertExists(fetchedWallet, "Fetched org wallet should exist for admin.");
      assertEquals(fetchedWallet.walletId, orgWallet.walletId);
      assertEquals(fetchedWallet.organizationId, orgId);
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getWalletByIdAndUser: (RLS) returns null for another user's personal wallet", async () => {
    assertExists(testUserProfileId, "Original test user profile ID must exist.");
    let otherUserWallet: TokenWallet | null = null;
    let secondUserFullCtx: SecondUserFullContext | null = null;
    const stepName = "getWalletByIdAndUser_RLS_other_user_personal";

    try {
      // 1. Create another user and their wallet
      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);
      assertExists(secondUserFullCtx.user.id, "Second user ID must exist.");
      // Fetch the second user's auto-created personal wallet
      otherUserWallet = await secondUserFullCtx.service.getWalletForContext(secondUserFullCtx.user.id, undefined);
      assertExists(otherUserWallet, "Second user's personal wallet should be auto-created and fetched.");
      walletsToCleanup.push(otherUserWallet.walletId); // Add to cleanup

      // 2. Original authenticated user (tokenWalletService) tries to fetch otherUser\'s wallet
      const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(otherUserWallet.walletId, testUserProfileId!);
      assertEquals(fetchedWallet, null, "Should return null when fetching another user's personal wallet by ID.");
      
      // 2.1 Original authenticated user (tokenWalletService) tries to fetch otherUser\'s wallet using *other user's ID in call*
      const fetchedWalletAttempt2 = await tokenWalletService.getWalletByIdAndUser(otherUserWallet.walletId, secondUserFullCtx.user.id);
      assertEquals(fetchedWalletAttempt2, null, "Should return null when fetching another user's personal wallet by ID, even if their ID is passed.");

    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
      await cleanupStepData(stepName);
    }
  });

  await t.step("getWalletByIdAndUser: (RLS) returns null for org wallet if user is member but not admin", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    let secondUserFullCtx: SecondUserFullContext | null = null; // This will be the non-admin member
    const stepName = "getWalletByIdAndUser_RLS_org_member_not_admin";
    
    // 1. Create org, add original testUser as ADMIN
    const orgId = await createOrgAndMakeUserAdmin("GWBUOrgNotAdmin", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
    orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId); // Admin fetches/creates it
    assertExists(orgWallet, "Org wallet for RLS test should be fetched/created by admin.");
    walletsToCleanup.push(orgWallet.walletId);

    try {
      // 2. Create a second user and add them as a non-admin 'member' to the org
      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);
      await supabaseAdminClient.from('organization_members').insert({
        organization_id: orgId,
        user_id: secondUserFullCtx.user.id,
        role: 'member', // Non-admin role
        status: 'active',
      });

      // 3. Second user (non-admin member) attempts to get org wallet using *their* service and *their* ID
      const fetchedWallet = await secondUserFullCtx.service.getWalletByIdAndUser(orgWallet.walletId, secondUserFullCtx.user.id);
      assertEquals(fetchedWallet, null, "Should return null for org wallet when user is member but not admin.");
    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
      await cleanupStepData(stepName);
    }
  });
  
  await t.step("getWalletByIdAndUser: (RLS) returns null for org wallet if user is not a member", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    let secondUserFullCtx: SecondUserFullContext | null = null; // This user will NOT be a member
    const stepName = "getWalletByIdAndUser_RLS_org_not_member";

    // 1. Create org, add original testUser as ADMIN
    const orgId = await createOrgAndMakeUserAdmin("GWBUOrgNotMember", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
    orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId); // Admin fetches/creates it
    assertExists(orgWallet, "Org wallet for RLS test (not member) should be fetched/created by admin.");
    walletsToCleanup.push(orgWallet.walletId);
    
    try {
      // 2. Create a second user (who will NOT be added to the org)
      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);

      // 3. Second user (not a member) attempts to get org wallet using *their* service and *their* ID
      const fetchedWallet = await secondUserFullCtx.service.getWalletByIdAndUser(orgWallet.walletId, secondUserFullCtx.user.id);
      assertEquals(fetchedWallet, null, "Should return null for org wallet when user is not a member.");
    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
      await cleanupStepData(stepName);
    }
  });

  await t.step("getWalletByIdAndUser: returns null for non-existent (valid UUID) wallet ID", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    const nonExistentWalletId = crypto.randomUUID();
    const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(nonExistentWalletId, testUserProfileId!);
    assertEquals(fetchedWallet, null, "Should return null for a non-existent wallet ID.");
  });

  await t.step("getWalletByIdAndUser: returns null for invalidly formatted wallet ID string", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    const invalidWalletId = "this-is-not-a-uuid";
    const fetchedWallet = await tokenWalletService.getWalletByIdAndUser(invalidWalletId, testUserProfileId!);
    assertEquals(fetchedWallet, null, "Should return null for an invalidly formatted wallet ID.");
  });

  // --- End of tests for getWalletByIdAndUser ---

  // --- Tests for getBalance ---
  await t.step("getBalance: successfully retrieves the balance for an existing user wallet", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let userWallet: TokenWallet | null = null;
    const stepName = "getBalance_user_existing";
    try {
      userWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(userWallet, "User wallet should be created for setup.");
      walletsToCleanup.push(userWallet.walletId);

      const generatedPaymentTxId = crypto.randomUUID();
      const creditAmount = '12345';

      // Insert a dummy payment_transactions record
      const { error: paymentTxError } = await supabaseAdminClient // Changed to supabaseAdminClient
        .from('payment_transactions')
        .insert({
          id: generatedPaymentTxId,
          target_wallet_id: userWallet.walletId,
          payment_gateway_id: 'TEST_GATEWAY_GETBALANCE_USER',
          tokens_to_award: parseInt(creditAmount),
          status: 'COMPLETED', // Changed to uppercase
          user_id: testUserProfileId!,
        });
      assertEquals(paymentTxError, null, `Failed to insert dummy payment transaction: ${paymentTxError?.message}`);

      await tokenWalletService.recordTransaction({
        walletId: userWallet.walletId,
        type: 'CREDIT_PURCHASE',
        amount: creditAmount,
        recordedByUserId: testUserProfileId!,
        notes: "Initial credit for getBalance test",
        idempotencyKey: crypto.randomUUID(),
        paymentTransactionId: generatedPaymentTxId, // Use the same UUID
      });

      // This will initially fail as getBalance is not implemented
      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, creditAmount);
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getBalance: successfully retrieves the balance for an existing organization wallet (user is admin)", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    const stepName = "getBalance_org_existing";
    const orgId = await createOrgAndMakeUserAdmin("GetBalanceOrg", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
    try {
      orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId);
      assertExists(orgWallet, "Org wallet should be created/fetched for setup.");
      walletsToCleanup.push(orgWallet.walletId);

      const generatedPaymentTxId = crypto.randomUUID();
      const creditAmount = '54321';

      // Insert a dummy payment_transactions record
      const { error: paymentTxError } = await supabaseAdminClient // Changed to supabaseAdminClient
        .from('payment_transactions')
        .insert({
          id: generatedPaymentTxId,
          target_wallet_id: orgWallet.walletId,
          payment_gateway_id: 'TEST_GATEWAY_GETBALANCE_ORG',
          tokens_to_award: parseInt(creditAmount),
          status: 'COMPLETED', // Changed to uppercase
          user_id: testUserProfileId!, // Assuming the admin user initiates this for the org
          organization_id: orgId, // Link to the organization
        });
      assertEquals(paymentTxError, null, `Failed to insert dummy payment transaction for org: ${paymentTxError?.message}`);

      await tokenWalletService.recordTransaction({
        walletId: orgWallet.walletId,
        type: 'CREDIT_PURCHASE',
        amount: creditAmount,
        recordedByUserId: testUserProfileId!, // Assuming admin performs this for the org
        notes: "Initial credit for org getBalance test",
        idempotencyKey: crypto.randomUUID(),
        paymentTransactionId: generatedPaymentTxId, // Use the same UUID
      });

      const balance = await tokenWalletService.getBalance(orgWallet.walletId);
      assertEquals(balance, creditAmount);
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getBalance: returns '0' for a newly created user wallet", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let userWallet: TokenWallet | null = null;
    const stepName = "getBalance_user_new";
    try {
      userWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(userWallet, "User wallet should be created for setup.");
      walletsToCleanup.push(userWallet.walletId);

      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, '0');
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getBalance: returns '0' for a newly created organization wallet", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    const stepName = "getBalance_org_new";
    const orgId = await createOrgAndMakeUserAdmin("GetBalanceOrgNew", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
    try {
      orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId);
      assertExists(orgWallet, "Org wallet should be created/fetched for setup.");
      walletsToCleanup.push(orgWallet.walletId);

      const balance = await tokenWalletService.getBalance(orgWallet.walletId);
      assertEquals(balance, '0');
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getBalance: returns an error if the wallet ID does not exist", async () => {
    const nonExistentWalletId = crypto.randomUUID();
    // Expecting getBalance to throw an error for a non-existent wallet
    await assertRejects(
      async () => { await tokenWalletService.getBalance(nonExistentWalletId); },
      Error, // Or a more specific error type if defined later
      "Wallet not found" // Or similar error message
    );
  });

  await t.step("getBalance: (RLS) fails to retrieve/returns error for another user's wallet", async () => {
    assertExists(testUserProfileId, "Original test user profile ID must exist.");
    let originalUserWallet: TokenWallet | null = null;
    let secondUserFullCtx: SecondUserFullContext | null = null;
    const stepName = "getBalance_RLS_other_user";

    try {
      originalUserWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(originalUserWallet, "Original user's wallet should be created.");
      walletsToCleanup.push(originalUserWallet.walletId);

      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);
      
      await assertRejects(
        async () => { await secondUserFullCtx!.service.getBalance(originalUserWallet!.walletId); },
        Error, // Or specific error due to RLS / not found
        "Wallet not found" // RLS might make it appear as 'not found' to the other user
      );
    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
      await cleanupStepData(stepName);
    }
  });

  await t.step("getBalance: (RLS) fails/error for an org wallet if user is not admin", async () => {
    assertExists(testUserProfileId, "Original test user profile ID must exist.");
    let orgWallet: TokenWallet | null = null;
    let secondUserFullCtx: SecondUserFullContext | null = null;
    const stepName = "getBalance_RLS_org_not_admin";

    // 1. Main user (admin) creates an org and its wallet
    const orgId = await createOrgAndMakeUserAdmin("GetBalanceOrgRLS", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
    orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId);
    assertExists(orgWallet, "Org wallet should be created/fetched by admin.");
    walletsToCleanup.push(orgWallet.walletId);

    try {
      // 2. Create a second user (who will not be an admin of this org)
      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);
      
      // 3. Second user attempts to get balance (should fail due to RLS)
      await assertRejects(
        async () => { await secondUserFullCtx!.service.getBalance(orgWallet!.walletId); },
        Error,
        "Wallet not found" // RLS denial should appear as not found
      );
    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
      await cleanupStepData(stepName);
    }
  });

  await t.step("getBalance: (Input Validation) returns an error if wallet ID is invalid format", async () => {
    const invalidWalletId = "this-is-not-a-uuid";
    await assertRejects(
      async () => { await tokenWalletService.getBalance(invalidWalletId); },
      Error, // Or a specific input validation error type
      "Invalid wallet ID format"
    );
  });

  await t.step("getBalance: successfully retrieves a very large balance correctly as a string", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    let userWallet: TokenWallet | null = null;
    const stepName = "getBalance_large_amount";
    const veryLargeAmount = '9999999999999999999'; // Max 19 digits for NUMERIC(19,0)
    try {
      userWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(userWallet, "User wallet should be created for setup.");
      walletsToCleanup.push(userWallet.walletId);
      
      // Use admin client to directly call the RPC for a large credit adjustment.
      const { error: rpcError } = await supabaseAdminClient.rpc('record_token_transaction', {
        p_wallet_id: userWallet.walletId,
        p_transaction_type: 'CREDIT_ADJUSTMENT',
        p_input_amount_text: veryLargeAmount,
        p_recorded_by_user_id: testUserProfileId!, 
        p_notes: 'Test credit of very large amount',
        p_idempotency_key: `idem-large-${crypto.randomUUID()}`,
        p_payment_transaction_id: undefined
      });
      assertEquals(rpcError, null, `RPC call for large credit failed: ${rpcError?.message}`);

      const balance = await tokenWalletService.getBalance(userWallet.walletId);
      assertEquals(balance, veryLargeAmount);
    } finally {
      await cleanupStepData(stepName);
    }
  });
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
  // --- End of tests for getBalance ---
}); 