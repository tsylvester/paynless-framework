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

  // --- Tests for getTransactionHistory ---
  await t.step("getTransactionHistory: successfully retrieves transactions for a user wallet", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    const stepName = "getTransactionHistory_user";
    let userWalletId: string | undefined;
    try {
      const userWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(userWallet, "User wallet should be created.");
      userWalletId = userWallet.walletId;
      walletsToCleanup.push(userWalletId!);

      // Transaction 1: CREDIT_PURCHASE
      const paymentTxId1 = crypto.randomUUID();
      const creditAmount1 = '100';
      const { error: ptxError1 } = await supabaseAdminClient.from('payment_transactions').insert({ // Changed to supabaseAdminClient
        id: paymentTxId1, target_wallet_id: userWalletId, payment_gateway_id: 'GTH_USER1', tokens_to_award: parseInt(creditAmount1), status: 'COMPLETED', user_id: testUserProfileId!, // Changed to uppercase
      });
      assertEquals(ptxError1, null, `Failed to insert dummy payment transaction 1: ${ptxError1?.message}`);
      const tx1 = await tokenWalletService.recordTransaction({
        walletId: userWalletId!,
        type: 'CREDIT_PURCHASE',
        amount: creditAmount1,
        recordedByUserId: testUserProfileId!,
        idempotencyKey: `history-credit1-${Date.now()}`,
        paymentTransactionId: paymentTxId1,
        notes: "First credit"
      });
      assertExists(tx1, "First transaction should be recorded.");

      // Transaction 2: DEBIT_USAGE
      const debitAmount = '30';
      const tx2 = await tokenWalletService.recordTransaction({
        walletId: userWalletId!,
        type: 'DEBIT_USAGE',
        amount: debitAmount,
        recordedByUserId: testUserProfileId!,
        idempotencyKey: `history-debit-${Date.now()}`,
        relatedEntityId: 'some-usage-id',
        relatedEntityType: 'test_usage',
        notes: "First debit"
      });
      assertExists(tx2, "Second transaction should be recorded.");

      // Transaction 3: CREDIT_PURCHASE
      const paymentTxId3 = crypto.randomUUID();
      const creditAmount2 = '50';
      const { error: ptxError3 } = await supabaseAdminClient.from('payment_transactions').insert({ // Changed to supabaseAdminClient
        id: paymentTxId3, target_wallet_id: userWalletId, payment_gateway_id: 'GTH_USER2', tokens_to_award: parseInt(creditAmount2), status: 'COMPLETED', user_id: testUserProfileId!, // Changed to uppercase
      });
      assertEquals(ptxError3, null, `Failed to insert dummy payment transaction 3: ${ptxError3?.message}`);
      const tx3 = await tokenWalletService.recordTransaction({
        walletId: userWalletId!,
        type: 'CREDIT_PURCHASE',
        amount: creditAmount2,
        recordedByUserId: testUserProfileId!,
        idempotencyKey: `history-credit2-${Date.now()}`,
        paymentTransactionId: paymentTxId3,
        notes: "Second credit"
      });
      assertExists(tx3, "Third transaction should be recorded.");

      const history = await tokenWalletService.getTransactionHistory(userWalletId!); // Default: page 1, limit 10
      assertExists(history, "Transaction history should exist.");
      assertEquals(history.transactions.length, 3, "Should return all transactions.");
      assertEquals(history.totalCount, 3, "Total count should be 3.");
      
      const sortedByTimestamp = [...history.transactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      assertEquals(history.transactions, sortedByTimestamp, "History should be sorted by timestamp descending by default.");

      assertEquals(history.transactions[0].notes, "Second credit");
      assertEquals(history.transactions[1].notes, "First debit");
      assertEquals(history.transactions[2].notes, "First credit");

    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getTransactionHistory: successfully retrieves transactions for an org wallet (user is admin)", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    const stepName = "getTransactionHistory_org";
    let orgWalletId: string | undefined;

    try {
      // Setup: Create a dummy organization and add the test user as an admin
      const orgId = await createOrgAndMakeUserAdmin("TxHistoryOrg", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
      
      // Create/fetch org wallet
      const orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId);
      assertExists(orgWallet, "Org wallet should be created/fetched.");
      orgWalletId = orgWallet.walletId;
      walletsToCleanup.push(orgWalletId);

      // Transaction 1: CREDIT_PURCHASE for org
      const paymentTxIdOrg1 = crypto.randomUUID();
      const creditAmountOrg1 = '200';
      const { error: ptxErrorOrg1 } = await supabaseAdminClient.from('payment_transactions').insert({ // Changed to supabaseAdminClient
        id: paymentTxIdOrg1, target_wallet_id: orgWalletId, payment_gateway_id: 'GTH_ORG1', tokens_to_award: parseInt(creditAmountOrg1), status: 'COMPLETED', user_id: testUserProfileId!, organization_id: orgId, // Changed to uppercase
      });
      assertEquals(ptxErrorOrg1, null, `Failed to insert dummy payment transaction for org 1: ${ptxErrorOrg1?.message}`);
      await tokenWalletService.recordTransaction({
        walletId: orgWalletId,
        type: 'CREDIT_PURCHASE',
        amount: creditAmountOrg1,
        recordedByUserId: testUserProfileId!,
        notes: 'Org first credit',
        idempotencyKey: `org-history-credit1-${Date.now()}`,
        paymentTransactionId: paymentTxIdOrg1,
      });

      // Transaction 2: DEBIT_USAGE for org
      await tokenWalletService.recordTransaction({
        walletId: orgWalletId,
        type: 'DEBIT_USAGE',
        amount: '75',
        recordedByUserId: testUserProfileId!,
        notes: 'Org first debit',
        idempotencyKey: `org-history-debit1-${Date.now()}`,
      });

      // Transaction 3: CREDIT_PURCHASE for org
      const paymentTxIdOrg3 = crypto.randomUUID();
      const creditAmountOrg2 = '120';
      const { error: ptxErrorOrg3 } = await supabaseAdminClient.from('payment_transactions').insert({ // Changed to supabaseAdminClient
        id: paymentTxIdOrg3, target_wallet_id: orgWalletId, payment_gateway_id: 'GTH_ORG2', tokens_to_award: parseInt(creditAmountOrg2), status: 'COMPLETED', user_id: testUserProfileId!, organization_id: orgId, // Changed to uppercase
      });
      assertEquals(ptxErrorOrg3, null, `Failed to insert dummy payment transaction for org 3: ${ptxErrorOrg3?.message}`);
      await tokenWalletService.recordTransaction({
        walletId: orgWalletId,
        type: 'CREDIT_PURCHASE',
        amount: creditAmountOrg2,
        recordedByUserId: testUserProfileId!,
        notes: 'Org second credit',
        idempotencyKey: `org-history-credit2-${Date.now()}`,
        paymentTransactionId: paymentTxIdOrg3,
      });

      const history = await tokenWalletService.getTransactionHistory(orgWalletId);
      assertExists(history, "Transaction history should exist.");
      assertEquals(history.transactions.length, 3, "Should return all org transactions.");
      assertEquals(history.totalCount, 3, "Total count for org should be 3.");

      const sortedByTimestamp = [...history.transactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      assertEquals(history.transactions, sortedByTimestamp, "History should be sorted by timestamp descending by default.");

      assertEquals(history.transactions[0].notes, "Org second credit");
      assertEquals(history.transactions[1].notes, "Org first debit");
      assertEquals(history.transactions[2].notes, "Org first credit");

    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getTransactionHistory: respects pagination parameters", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    const stepName = "getTransactionHistory_pagination";
    let userWalletId: string | undefined;
    try {
      // Create wallet and add multiple transactions
      const userWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(userWallet, "User wallet should be created.");
      userWalletId = userWallet.walletId;
      walletsToCleanup.push(userWalletId);

      const transactionsToCreate = 5;
      for (let i = 1; i <= transactionsToCreate; i++) {
        const paymentTxId = crypto.randomUUID();
        const amount = (i * 10).toString();
        const { error: ptxError } = await supabaseAdminClient.from('payment_transactions').insert({ // Changed to supabaseAdminClient
          id: paymentTxId, target_wallet_id: userWalletId, payment_gateway_id: `GTH_PAGINATION_${i}`,
          tokens_to_award: parseInt(amount), status: 'COMPLETED', user_id: testUserProfileId!, // Changed to uppercase
        });
        assertEquals(ptxError, null, `Failed to insert dummy payment transaction for pagination test ${i}: ${ptxError?.message}`);
        await tokenWalletService.recordTransaction({
          walletId: userWalletId!,
          type: 'CREDIT_PURCHASE',
          amount,
          recordedByUserId: testUserProfileId!,
          notes: `Transaction ${i}`,
          idempotencyKey: `pagination-tx-${i}-${Date.now()}`,
          paymentTransactionId: paymentTxId,
        });
        if (i < transactionsToCreate) await new Promise(resolve => setTimeout(resolve, 20)); // Ensure distinct timestamps for reliable sorting
      }

      // Test Case 1: Get first page, limit 2
      const limitedHistory = await tokenWalletService.getTransactionHistory(userWalletId, { limit: 2 });
      assertEquals(limitedHistory.transactions.length, 2, "Should respect limit parameter");
      assertEquals(limitedHistory.totalCount, 5, "Total count should be 5 for limited query.");
      assertEquals(limitedHistory.transactions[0].notes, "Transaction 5", "Should return newest transactions first");
      assertEquals(limitedHistory.transactions[1].notes, "Transaction 4", "Should return newest transactions first");

      // Test Case 2: Get second page, limit 2
      const offsetHistory = await tokenWalletService.getTransactionHistory(userWalletId, { limit: 2, offset: 2 }); // page 2, limit 2 means offset 2
      assertEquals(offsetHistory.transactions.length, 2, "Should respect offset parameter");
      assertEquals(offsetHistory.totalCount, 5, "Total count should be 5 for offset query.");
      assertEquals(offsetHistory.transactions[0].notes, "Transaction 3", "Should skip first two newest transactions");
      assertEquals(offsetHistory.transactions[1].notes, "Transaction 2", "Should return third and fourth newest transactions");

      // Test Case 3: Get third page, limit 2
      const offsetHistory2 = await tokenWalletService.getTransactionHistory(userWalletId, { limit: 2, offset: 4 }); // page 3, limit 2 means offset 4
      assertEquals(offsetHistory2.transactions.length, 1, "Should respect offset parameter for last page");
      assertEquals(offsetHistory2.totalCount, 5, "Total count should be 5 for last page offset query.");
      assertEquals(offsetHistory2.transactions[0].notes, "Transaction 1", "Should return oldest transaction");
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getTransactionHistory: returns empty array for wallet with no transactions", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist.");
    const stepName = "getTransactionHistory_empty";
    let userWalletId: string | undefined;
    try {
      const userWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(userWallet, "User wallet should be created.");
      userWalletId = userWallet.walletId;
      walletsToCleanup.push(userWalletId);

      const history = await tokenWalletService.getTransactionHistory(userWalletId);
      assertEquals(history.transactions.length, 0, "Should return empty transaction array for new wallet");
      assertEquals(history.totalCount, 0, "Total count should be 0 for new wallet.");
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("getTransactionHistory: (RLS) returns empty array for another user's wallet", async () => {
    assertExists(testUserProfileId, "Original test user profile ID must exist.");
    const stepName = "getTransactionHistory_RLS_other_user";
    let originalUserWalletId: string | undefined;
    let secondUserFullCtx: SecondUserFullContext | null = null;

    try {
      // Create wallet for original user
      const originalUserWallet = await tokenWalletService.createWallet(testUserProfileId!);
      assertExists(originalUserWallet, "Original user's wallet should be created.");
      originalUserWalletId = originalUserWallet.walletId;
      walletsToCleanup.push(originalUserWallet.walletId);

      // Add a transaction
      const paymentTxIdRlsUserFixed = crypto.randomUUID();
      const { error: ptxErrorRlsUserFixed } = await supabaseAdminClient.from('payment_transactions').insert({
        id: paymentTxIdRlsUserFixed,
        target_wallet_id: originalUserWalletId,
        payment_gateway_id: 'GTH_RLS_USER_FIXED',
        tokens_to_award: 100,
        status: 'COMPLETED',
        user_id: testUserProfileId!,
      });
      assertEquals(ptxErrorRlsUserFixed, null, `Failed to insert payment_transaction for RLS user test (FIXED): ${ptxErrorRlsUserFixed?.message}`);

      await tokenWalletService.recordTransaction({
        walletId: originalUserWalletId,
        type: 'CREDIT_PURCHASE',
        amount: '100',
        recordedByUserId: testUserProfileId!,
        notes: 'Test transaction',
        idempotencyKey: crypto.randomUUID(),
        paymentTransactionId: paymentTxIdRlsUserFixed, // <<< Ensure this uses the new const
      });

      // Create second user
      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);
      
      // Second user attempts to get history
      const history = await secondUserFullCtx.service.getTransactionHistory(originalUserWalletId);
      assertEquals(history.transactions.length, 0, "Should return empty transaction array for another user's wallet due to RLS");
      assertEquals(history.totalCount, 0, "Total count should be 0 for another user's wallet due to RLS.");
    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
      await cleanupStepData(stepName);
    }
  });

  await t.step("getTransactionHistory: (RLS) returns empty array for org wallet if user is not admin", async () => {
    assertExists(testUserProfileId, "Original test user profile ID must exist.");
    const stepName = "getTransactionHistory_RLS_org_not_admin";
    let orgWalletId: string | undefined;
    let secondUserFullCtx: SecondUserFullContext | null = null;

    try {
      // Create org and make original user admin
      const orgId = await createOrgAndMakeUserAdmin("TxHistoryRLSOrg", supabaseAdminClient, testUserProfileId!, orgsToCleanup);
      
      // Create/fetch org wallet
      const orgWallet = await tokenWalletService.getWalletForContext(testUserProfileId!, orgId);
      assertExists(orgWallet, "Org wallet should be created/fetched.");
      orgWalletId = orgWallet.walletId;
      walletsToCleanup.push(orgWalletId);

      // Add a transaction
      const paymentTxIdRlsOrgFixed = crypto.randomUUID();
      const { error: ptxErrorRlsOrgFixed } = await supabaseAdminClient.from('payment_transactions').insert({
        id: paymentTxIdRlsOrgFixed,
        target_wallet_id: orgWalletId,
        payment_gateway_id: 'GTH_RLS_ORG_FIXED',
        tokens_to_award: 100,
        status: 'COMPLETED',
        user_id: testUserProfileId!,
        organization_id: orgId // Important: Link to the org
      });
      assertEquals(ptxErrorRlsOrgFixed, null, `Failed to insert payment_transaction for RLS org test (FIXED): ${ptxErrorRlsOrgFixed?.message}`);

      await tokenWalletService.recordTransaction({
        walletId: orgWalletId,
        type: 'CREDIT_PURCHASE',
        amount: '100',
        recordedByUserId: testUserProfileId!,
        notes: 'Org test transaction',
        idempotencyKey: crypto.randomUUID(),
        paymentTransactionId: paymentTxIdRlsOrgFixed, // <<< Ensure this uses the new const
      });
      
      // Create second user (not admin of org)
      secondUserFullCtx = await setupSecondUserContext(supabaseAdminClient);
      
      // Second user attempts to get history
      const history = await secondUserFullCtx.service.getTransactionHistory(orgWalletId);
      assertEquals(history.transactions.length, 0, "Should return empty transaction array for org wallet when user is not admin due to RLS");
      assertEquals(history.totalCount, 0, "Total count should be 0 for org wallet when user is not admin due to RLS.");
    } finally {
      if (secondUserFullCtx?.user.id) {
        await supabaseAdminClient.auth.admin.deleteUser(secondUserFullCtx.user.id);
      }
      await cleanupStepData(stepName);
    }
  });

  await t.step("getTransactionHistory: throws error for invalid wallet ID format", async () => {
    const invalidWalletId = "not-a-uuid";
    // The service method itself should handle invalid UUIDs and return PaginatedTransactions with empty results or throw
    // For consistency with other RLS/not found cases, let's assume it returns an empty PaginatedTransactions object.
    // If it's expected to throw, the test should be assertRejects.
    // Based on the service code, it will likely proceed with an invalid UUID to the DB which might error or return empty.
    // Let's assume it returns empty PaginatedTransactions.
    const history = await tokenWalletService.getTransactionHistory(invalidWalletId);
    assertExists(history, "History object should still be returned for invalid walletId format.");
    assertEquals(history.transactions.length, 0, "Transactions array should be empty for invalid walletId format.");
    assertEquals(history.totalCount, 0, "Total count should be 0 for invalid walletId format.");
  });

  // --- End of tests for getTransactionHistory ---

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