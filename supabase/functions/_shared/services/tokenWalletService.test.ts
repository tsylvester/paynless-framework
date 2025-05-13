import {
  assertEquals,
  assertRejects,
  assertExists,
  assertNotEquals,
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
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  throw new Error("Supabase environment variables for tests are not set.");
}

// Create a single Supabase client for all tests in this file
// The service itself will receive this client, or one derived from it.
const supabaseTestClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false } // Recommended for test environments
});

// Admin client for setup/teardown tasks that require bypassing RLS
const supabaseAdminClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

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

  const cleanupStepData = async () => {
    for (const walletId of walletsToCleanup) {
      const { error: txnError } = await supabaseAdminClient // Use admin client for cleanup
        .from('token_wallet_transactions')
        .delete()
        .eq('wallet_id', walletId);
      if (txnError) console.error(`[Test Cleanup] Error cleaning transactions for wallet ${walletId}:`, txnError.message);
      
      const { error: walletError } = await supabaseAdminClient // Use admin client for cleanup
        .from('token_wallets')
        .delete()
        .eq('wallet_id', walletId);
      if (walletError) console.error(`[Test Cleanup] Error cleaning wallet ${walletId}:`, walletError.message);
    }
    walletsToCleanup.length = 0;

    for (const orgId of orgsToCleanup) {
      const { error: orgError } = await supabaseAdminClient // Use admin client for cleanup
        .from('organizations') // Assuming your table is named 'organizations'
        .delete()
        .eq('id', orgId);
      if (orgError) console.error(`[Test Cleanup] Error cleaning organization ${orgId}:`, orgError.message);
    }
    orgsToCleanup.length = 0;
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
    try {
      createdWallet = await tokenWalletService.createWallet(testUserProfileId, undefined);
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
      await cleanupStepData();
    }
  });

  await t.step("createWallet: successfully creates a new organization wallet", async () => {
    const tempOrgId = crypto.randomUUID();
    // Setup: Create a dummy organization using admin client
    const { data: orgData, error: orgInsertError } = await supabaseAdminClient
        .from('organizations') 
        .insert({ id: tempOrgId, name: `Test Org ${tempOrgId}` }) // Ensure all required fields are provided
        .select('id')
        .single();

    if (orgInsertError) {
        throw new Error(`Failed to insert dummy organization for test: ${orgInsertError.message}`);
    }
    assertExists(orgData, "Dummy organization data should exist after insert.");
    orgsToCleanup.push(orgData.id);

    let createdWallet: TokenWallet | null = null;
    try {
      createdWallet = await tokenWalletService.createWallet(undefined, orgData.id);
      assertExists(createdWallet, "Wallet object should be returned for org wallet.");
      walletsToCleanup.push(createdWallet.walletId);

      assertEquals(createdWallet.userId, undefined);
      assertEquals(createdWallet.organizationId, orgData.id);
      assertEquals(createdWallet.balance, '0');
      assertEquals(createdWallet.currency, 'AI_TOKEN');
      assertExists(createdWallet.walletId, "Org Wallet ID should be present.");

      // Verify in DB using admin client as the user-context client may not have RLS to see it
      const { data: dbWallet, error: dbWalletError } = await supabaseAdminClient // Changed to supabaseAdminClient
        .from('token_wallets')
        .select('*')
        .eq('wallet_id', createdWallet.walletId)
        .single();
      
      assertEquals(dbWalletError, null, `Error fetching org wallet from DB: ${dbWalletError?.message}`);
      assertExists(dbWallet, "Org Wallet should be in the database.");
      assertEquals(dbWallet.user_id, null);
      assertEquals(dbWallet.organization_id, orgData.id);
      assertEquals(dbWallet.balance?.toString(), '0');
      assertEquals(dbWallet.currency, 'AI_TOKEN');
    } finally {
      await cleanupStepData(); // This will now also clean the org from orgsToCleanup
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
    try {
      const newWallet = await tokenWalletService.createWallet(testUserProfileId);
      assertExists(newWallet, "A new wallet should be created for the test user.");
      testUserWalletId = newWallet.walletId;
      walletsToCleanup.push(testUserWalletId);

      const params = {
        walletId: testUserWalletId, // Use the walletId from the newly created wallet
        type: 'CREDIT_PURCHASE' as TokenWalletTransactionType,
        amount: '1000',
        recordedByUserId: testUserProfileId, 
        relatedEntityId: `payment-${Date.now()}`,
        relatedEntityType: 'payment_transaction',
        notes: 'Test credit purchase via service-created wallet',
      };

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
      await cleanupStepData(); // This will clean up testUserWalletId and any others
    }
  });

  await t.step("recordTransaction: fails if wallet does not exist", async () => {
    const nonExistentWalletId = "00000000-0000-0000-0000-000000000001"; // Use a valid UUID format
    const params = {
      walletId: nonExistentWalletId,
      type: 'DEBIT_USAGE' as TokenWalletTransactionType,
      amount: '50',
      recordedByUserId: PRE_EXISTING_TEST_AUTH_USER_ID, // Use a valid existing user ID
      notes: 'Test debit from non-existent wallet',
    };

    await assertRejects(
      async () => { await tokenWalletService.recordTransaction(params); },
      Error,
      "Failed to record token transaction"
    );
  });

  // TODO: Add more test cases for recordTransaction (e.g., DEBIT_USAGE, different amounts, error scenarios from PG function)
  
  // TODO: Write integration tests for other service methods (createWallet, getWallet, etc.)
  // These will also involve direct DB interaction for setup and verification.
  // Example for createWallet:
  // await t.step("createWallet: successfully creates a new user wallet", async () => {
  //   const newUserId = `test-user-create-${Date.now()}`;
  //   let createdWalletId = "";
  //   try {
  //     const newWallet = await tokenWalletService.createWallet(newUserId, undefined);
  //     assertExists(newWallet);
  //     assertEquals(newWallet.userId, newUserId);
  //     createdWalletId = newWallet.walletId;
  //     // Verify in DB
  //     const { data: dbWallet, error } = await supabaseTestClient.from('token_wallets').select('*').eq('wallet_id', createdWalletId).single();
  //     assertNull(error);
  //     assertExists(dbWallet);
  //     assertEquals(dbWallet.user_id, newUserId);
  //   } finally {
  //     if (createdWalletId) await cleanupWallet(createdWalletId);
  //   }
  // });

  // Global Teardown (runs once after all steps in this test block)
  await t.step("Global Teardown: Clean up Auth User and Profile", async () => {
    if (testUserProfileId) {
        // user_profile should be deleted by cascade when auth user is deleted if FK is set up correctly
        // or can be deleted manually first if needed.
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