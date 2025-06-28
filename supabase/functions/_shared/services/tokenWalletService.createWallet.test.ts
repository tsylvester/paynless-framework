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

  await t.step("createWallet: successfully creates a new user wallet", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let createdWallet: TokenWallet | null = null;
    const stepName = "createWallet_user";
    try {
      createdWallet = await tokenWalletService.createWallet(testUserProfileId!, undefined);
      assertExists(createdWallet, "Wallet object should be returned.");
      walletsToCleanup.push(createdWallet.walletId);

      assertEquals(createdWallet.userId, testUserProfileId);
      assertEquals(createdWallet.organizationId, undefined);
      assertEquals(createdWallet.balance, '0');
      assertEquals(createdWallet.currency, 'AI_TOKEN');
      assertExists(createdWallet.walletId, "Wallet ID should be present.");
      assertExists(createdWallet.createdAt, "createdAt should be present.");
      assertExists(createdWallet.updatedAt, "updatedAt should be present.");

      const { data: dbWallet, error } = await supabaseTestClient
        .from('token_wallets')
        .select('*')
        .eq('wallet_id', createdWallet.walletId)
        .single();

      assertEquals(error, null, `Error fetching wallet from DB: ${error?.message}`);
      assertExists(dbWallet, "Wallet should be in the database.");
      assertEquals(dbWallet.user_id, testUserProfileId);
      assertEquals(dbWallet.organization_id, null);
      assertEquals(dbWallet.balance?.toString(), '0');
      assertEquals(dbWallet.currency, 'AI_TOKEN');
    } finally {
      await cleanupStepData(stepName);
    }
  });

  await t.step("createWallet: successfully creates a new organization wallet", async () => {
    const newOrgId = crypto.randomUUID();
    // Setup: Create a dummy organization using admin client
    const { data: orgData, error: orgInsertError } = await supabaseAdminClient
        .from('organizations') 
        .insert({ id: newOrgId, name: `Test Org CWSNOW ${newOrgId.substring(0,5)}` }) // CWSNOW = Create Wallet Successfully New Org Wallet
        .select('id')
        .single();

    if (orgInsertError) {
        throw new Error(`Failed to insert dummy organization for createWallet org test: ${orgInsertError.message}`);
    }
    assertExists(orgData, "Dummy organization data should exist after insert for createWallet org test.");
    orgsToCleanup.push(orgData.id); // Ensure org is cleaned up
    const actualNewOrgId = orgData.id; // Use the ID from the insert result

    // Add the test user as an active admin member of this organization
    assertExists(testUserProfileId, "testUserProfileId must exist to add as org member.");
    const { error: memberInsertError } = await supabaseAdminClient
      .from('organization_members')
      .insert({
        organization_id: actualNewOrgId,
        user_id: testUserProfileId,
        role: 'admin',
        status: 'active',
      });
    if (memberInsertError) {
      throw new Error(`Failed to insert test user into organization_members for createWallet org test: ${memberInsertError.message}`);
    }
    console.log(`[Test Debug CreateWalletOrg] User ${testUserProfileId} made admin of org ${actualNewOrgId}`);

    let fetchedOrgWallet: TokenWallet | null = null;
    const stepName = "createWallet_org_fetch_auto_created"; // Renamed stepName for clarity
    try {
      // Fetch the auto-created wallet using getWalletForContext
      assertExists(testUserProfileId, "testUserProfileId must be defined for fetching org wallet context in createWallet org test");
      fetchedOrgWallet = await tokenWalletService.getWalletForContext(testUserProfileId, actualNewOrgId);
      
      assertExists(fetchedOrgWallet, "Organization wallet should be auto-created by trigger and retrievable by service.");
      if (fetchedOrgWallet && fetchedOrgWallet.walletId) { // Check before pushing to cleanup
          walletsToCleanup.push(fetchedOrgWallet.walletId);
      }
      console.log("[Test Debug CreateWalletOrg] Fetched auto-created Org Wallet:", JSON.stringify(fetchedOrgWallet));

      assertEquals(fetchedOrgWallet.organizationId, actualNewOrgId);
      // For an org wallet, userId field on the wallet object itself is typically null/undefined.
      // The association is via organization_id.
      assertEquals(fetchedOrgWallet.userId, undefined, "User ID on an org wallet should be undefined."); 
      assertEquals(fetchedOrgWallet.balance, '0');
      assertEquals(fetchedOrgWallet.currency, 'AI_TOKEN');
      assertExists(fetchedOrgWallet.walletId, "Fetched wallet ID should be present.");
      assertExists(fetchedOrgWallet.createdAt, "Fetched wallet createdAt should be present.");
      assertExists(fetchedOrgWallet.updatedAt, "Fetched wallet updatedAt should be present.");

      // Optionally, verify directly in DB if needed, though getWalletForContext should be reliable if RLS allows
      const { data: dbWallet, error: dbError } = await supabaseAdminClient
        .from('token_wallets')
        .select('*')
        .eq('organization_id', actualNewOrgId)
        .maybeSingle(); // Use maybeSingle as there should be at most one
      
      assertEquals(dbError, null, `DB error fetching org wallet: ${dbError?.message}`);
      assertExists(dbWallet, "Wallet for organization should exist in DB.");
      assertEquals(dbWallet.wallet_id, fetchedOrgWallet.walletId, "DB wallet_id should match fetched walletId.");

    } finally {
      // Cleanup of orgs and wallets is handled by the main cleanupStepData
      // We don't need a specific cleanupStepData(stepName) here unless this test step creates unique resources not in the main arrays.
    }
  });

  await t.step("createWallet: throws error if neither userId nor organizationId is provided", async () => {
    await assertRejects(
      async () => { await tokenWalletService.createWallet(undefined, undefined); },
      Error,
      'Cannot create wallet: userId or organizationId must be provided.'
    );
  });

  await t.step("recordTransaction: successful CREDIT_PURCHASE", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let testUserWalletId: string | null = null; // This will store the ID of the wallet created for this test step
    const stepName = "recordTransaction_credit";
    try {
      const newWallet = await tokenWalletService.createWallet(testUserProfileId);
      assertExists(newWallet, "A new wallet should be created for the test user.");
      testUserWalletId = newWallet.walletId;
      walletsToCleanup.push(testUserWalletId);

      const generatedPaymentTxId = crypto.randomUUID(); // Store the generated UUID

      const params = {
        walletId: testUserWalletId, // Use the walletId from the newly created wallet
        type: 'CREDIT_PURCHASE' as TokenWalletTransactionType,
        amount: '1000',
        recordedByUserId: testUserProfileId, 
        idempotencyKey: crypto.randomUUID(),
        relatedEntityId: `payment-${Date.now()}`,
        relatedEntityType: 'payment_transaction',
        paymentTransactionId: generatedPaymentTxId, // Use the stored UUID
        notes: 'Test credit purchase via service-created wallet',
      };

      // Insert a dummy payment_transactions record
      const { error: paymentTxError } = await supabaseAdminClient // Changed to supabaseAdminClient
        .from('payment_transactions')
        .insert({
          id: generatedPaymentTxId, // Use the same UUID
          target_wallet_id: testUserWalletId,
          payment_gateway_id: 'TEST_GATEWAY',
          tokens_to_award: parseInt(params.amount),
          status: 'COMPLETED', // Changed to uppercase
          user_id: testUserProfileId, 
        });
      assertEquals(paymentTxError, null, `Failed to insert dummy payment transaction: ${paymentTxError?.message}`);

      const transactionResult = await tokenWalletService.recordTransaction(params);

      assertExists(transactionResult, "Transaction result should exist.");
      assertEquals(transactionResult.walletId, params.walletId);
      assertEquals(transactionResult.type, params.type);
      assertEquals(transactionResult.amount, params.amount);
      assertExists(transactionResult.transactionId, "Transaction ID should be present.");

      const { data: dbTxn, error: dbTxnError } = await supabaseTestClient
        .from('token_wallet_transactions')
        .select('*')
        .eq('transaction_id', transactionResult.transactionId)
        .single();

      let dbTxnErrorMessage = "Error fetching transaction from DB: Unknown error";
      if (dbTxnError && typeof dbTxnError.message === 'string') {
        dbTxnErrorMessage = `Error fetching transaction from DB: ${dbTxnError.message}`;
      }
      assertEquals(dbTxnError, null, dbTxnErrorMessage);
      assertExists(dbTxn, "Transaction should be in the database.");
      assertEquals(dbTxn.wallet_id, params.walletId);
      assertEquals(dbTxn.transaction_type, params.type);
      assertEquals(dbTxn.amount.toString(), params.amount);
      assertEquals(dbTxn.notes, params.notes);

      const { data: updatedWallet, error: fetchWalletError } = await supabaseTestClient
        .from('token_wallets')
        .select('balance')
        .eq('wallet_id', testUserWalletId) // Verify the correct wallet
        .single();
      
      let fetchWalletErrorMessage = "Error fetching updated wallet: Unknown error";
      if (fetchWalletError && typeof fetchWalletError.message === 'string') {
        fetchWalletErrorMessage = `Error fetching updated wallet: ${fetchWalletError.message}`;
      }
      assertEquals(fetchWalletError, null, fetchWalletErrorMessage);
      assertExists(updatedWallet, "Updated wallet data should exist.");
      assertEquals(updatedWallet.balance.toString(), params.amount, "Wallet balance should be updated by the amount of credit.");
      assertEquals(dbTxn.balance_after_txn.toString(), params.amount, "Ledger balance_after_txn should match new wallet balance.");

    } finally {
      await cleanupStepData(stepName); // This will clean up testUserWalletId and any others
    }
  });

  await t.step("recordTransaction: successful DEBIT_USAGE from wallet with sufficient balance", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let testUserWalletId: string | null = null;
    const initialCreditAmount = '100';
    const debitAmount = '30';
    const expectedBalanceAfterDebit = (parseInt(initialCreditAmount) - parseInt(debitAmount)).toString();

    const stepName = "recordTransaction_debit";
    try {
      // 1. Setup: Create a wallet and credit it with initial balance
      const newWallet = await tokenWalletService.createWallet(testUserProfileId);
      assertExists(newWallet, "A new wallet should be created.");
      testUserWalletId = newWallet.walletId;
      walletsToCleanup.push(testUserWalletId);

      const generatedCreditPaymentTxId = crypto.randomUUID(); // New UUID for the credit part

      // Insert a dummy payment_transactions record for the credit FIRST
      const { error: creditPaymentTxError } = await supabaseAdminClient // Use admin client for setup
        .from('payment_transactions')
        .insert({
          id: generatedCreditPaymentTxId, // Explicitly set the ID to match what will be used in token_wallet_transactions
          target_wallet_id: testUserWalletId,
          payment_gateway_id: 'TEST_GATEWAY_CREDIT_SETUP',
          tokens_to_award: parseInt(initialCreditAmount),
          status: 'COMPLETED', // Changed to uppercase
          user_id: testUserProfileId,
        });
      assertEquals(creditPaymentTxError, null, `Failed to insert dummy payment transaction for credit setup: ${creditPaymentTxError?.message}`);

      const creditParams = {
        walletId: testUserWalletId,
        type: 'CREDIT_PURCHASE' as TokenWalletTransactionType,
        amount: initialCreditAmount,
        recordedByUserId: testUserProfileId,
        idempotencyKey: `credit-idempotency-${Date.now()}`,
        paymentTransactionId: generatedCreditPaymentTxId, // Use the same UUID used in the payment_transactions insert
        notes: 'Initial credit for debit test',
      };
      
      const creditResult = await tokenWalletService.recordTransaction(creditParams);
      assertExists(creditResult, "Initial credit transaction should succeed.");
      assertEquals(creditResult.balanceAfterTxn, initialCreditAmount, "Balance after initial credit should be correct.");

      // 2. Action: Perform the DEBIT_USAGE transaction
      const debitParams = {
        walletId: testUserWalletId,
        type: 'DEBIT_USAGE' as TokenWalletTransactionType,
        amount: debitAmount,
        recordedByUserId: testUserProfileId,
        idempotencyKey: `debit-idempotency-${crypto.randomUUID()}`,
        relatedEntityId: `usage-${crypto.randomUUID()}`,
        relatedEntityType: 'ai_service_usage',
        paymentTransactionId: undefined, // DEBIT_USAGE should not create a new payment_transaction
        notes: 'Test debit usage',
      };
      const debitResult = await tokenWalletService.recordTransaction(debitParams);

      // 3. Verification of debit transaction
      assertExists(debitResult, "Debit transaction result should exist.");
      assertEquals(debitResult.walletId, testUserWalletId);
      assertEquals(debitResult.type, debitParams.type);
      assertEquals(debitResult.amount, debitParams.amount);
      assertEquals(debitResult.balanceAfterTxn, expectedBalanceAfterDebit, "Balance after debit in transaction should be correct.");
      assertExists(debitResult.transactionId, "Debit transaction ID should be present.");

      // Verify in DB: transaction details
      const { data: dbTxn, error: dbTxnError } = await supabaseAdminClient
        .from('token_wallet_transactions')
        .select('*')
        .eq('transaction_id', debitResult.transactionId)
        .single();
      assertEquals(dbTxnError, null, `Error fetching debit transaction from DB: ${dbTxnError?.message}`);
      assertExists(dbTxn, "Debit transaction should be in the database.");
      assertEquals(dbTxn.amount.toString(), debitAmount);
      assertEquals(dbTxn.balance_after_txn.toString(), expectedBalanceAfterDebit);

      // Verify in DB: wallet balance
      const { data: updatedWallet, error: fetchWalletError } = await supabaseAdminClient
        .from('token_wallets')
        .select('balance')
        .eq('wallet_id', testUserWalletId)
        .single();
      assertEquals(fetchWalletError, null, `Error fetching updated wallet: ${fetchWalletError?.message}`);
      assertExists(updatedWallet, "Updated wallet data should exist.");
      assertEquals(updatedWallet.balance.toString(), expectedBalanceAfterDebit, "Wallet balance in DB should be correctly debited.");

    } finally {
      // cleanupStepData will handle walletsToCleanup which includes testUserWalletId and its transactions
      await cleanupStepData(stepName); 
    }
  });

  await t.step("recordTransaction: fails if wallet does not exist", async () => {
    const nonExistentWalletId = "00000000-0000-0000-0000-000000000001"; // Use a valid UUID format
    const params = {
      walletId: nonExistentWalletId,
      type: 'DEBIT_USAGE' as TokenWalletTransactionType,
      amount: '50',
      recordedByUserId: PRE_EXISTING_TEST_AUTH_USER_ID, // Use a valid existing user ID
      idempotencyKey: crypto.randomUUID(),
      notes: 'Test debit from non-existent wallet',
    };

    await assertRejects(
      async () => { await tokenWalletService.recordTransaction(params); },
      Error,
      "Failed to record token transaction"
    );
  });

  await t.step("recordTransaction: fails if recordedByUserId is missing (via direct RPC call)", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let testUserWalletId: string | null = null;

    const stepName = "recordTransaction_null_recordedByUserId";
    try {
      // 1. Setup: Create a wallet
      const newWallet = await tokenWalletService.createWallet(testUserProfileId);
      assertExists(newWallet, "A new wallet should be created for the test.");
      testUserWalletId = newWallet.walletId;
      walletsToCleanup.push(testUserWalletId);

      // 2. Action & Verification: Attempt to call RPC with p_recorded_by_user_id as null
      await assertRejects(
        async () => {
          const { error } = await supabaseAdminClient.rpc('record_token_transaction', {
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

}); 