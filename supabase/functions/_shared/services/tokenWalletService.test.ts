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
      // First, explicitly delete members of this org to avoid last admin issues
      const { error: memberDeleteError } = await supabaseAdminClient
        .from('organization_members')
        .delete()
        .eq('organization_id', orgId);
      if (memberDeleteError) {
        console.warn(`[Test Cleanup] Warning cleaning members for organization ${orgId}:`, memberDeleteError.message);
      }

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

    // Add the test user as an active admin member of this organization
    assertExists(testUserProfileId, "testUserProfileId must exist to add as org member.");
    const { error: memberInsertError } = await supabaseAdminClient
      .from('organization_members')
      .insert({
        organization_id: orgData.id,
        user_id: testUserProfileId,
        role: 'admin',
        status: 'active',
      });
    if (memberInsertError) {
      throw new Error(`Failed to insert test user into organization_members: ${memberInsertError.message}`);
    }

    // Debug: Directly test is_org_member with the user's client
    const { data: isMemberData, error: isMemberError } = await supabaseTestClient.rpc('is_org_member', {
      p_org_id: orgData.id,
      p_user_id: testUserProfileId, // or use auth.uid() if confident it resolves correctly here via RPC
      required_status: 'active',
      required_role: 'admin'
    });
    console.log(`[Test Debug] is_org_member direct call for org ${orgData.id}, user ${testUserProfileId} (admin):`, { isMemberData, isMemberError });
    if (isMemberError) console.error("[Test Debug] Error calling is_org_member:", isMemberError.message);
    assertEquals(isMemberData, true, "is_org_member should return true for the admin user and org.");

    let createdOrgWallet: TokenWallet | null = null;
    try {
      createdOrgWallet = await tokenWalletService.createWallet(undefined, orgData.id);
      assertExists(createdOrgWallet, "Organization wallet should be created for setup.");
      walletsToCleanup.push(createdOrgWallet.walletId);
      console.log("[Test Debug] Created Org Wallet:", JSON.stringify(createdOrgWallet));

      // DEBUG: Call the RLS helper function directly via RPC to check its output
      if (createdOrgWallet && createdOrgWallet.organizationId) {
        console.log(`[Test Debug Admin] Calling is_admin_of_org_for_wallet with p_organization_id: ${createdOrgWallet.organizationId}`);
        const { data: rpcCheckData, error: rpcCheckError } = await supabaseTestClient.rpc(
          'is_admin_of_org_for_wallet' as any, 
          { p_organization_id: createdOrgWallet.organizationId } // Pass organizationId directly
        );
        console.log('[Test Debug Admin] RPC is_admin_of_org_for_wallet result:', { rpcCheckData, rpcCheckError });
        
        assertEquals(rpcCheckError, null, `RPC call to is_admin_of_org_for_wallet errored: ${rpcCheckError?.message}`);
        assertEquals(rpcCheckData, true, "is_admin_of_org_for_wallet RPC call should return true for admin.");
      }

      const fetchedWallet = await tokenWalletService.getWallet(createdOrgWallet.walletId);
      assertExists(fetchedWallet, "Fetched org wallet should exist.");
      assertEquals(fetchedWallet.walletId, createdOrgWallet.walletId);
      assertEquals(fetchedWallet.userId, undefined);
      assertEquals(fetchedWallet.organizationId, orgData.id);
      assertEquals(fetchedWallet.balance, '0');
      assertEquals(fetchedWallet.currency, 'AI_TOKEN');
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

  await t.step("recordTransaction: successful DEBIT_USAGE from wallet with sufficient balance", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let testUserWalletId: string | null = null;
    const initialCreditAmount = '100';
    const debitAmount = '30';
    const expectedBalanceAfterDebit = (parseInt(initialCreditAmount) - parseInt(debitAmount)).toString();

    try {
      // 1. Setup: Create a wallet and credit it with initial balance
      const newWallet = await tokenWalletService.createWallet(testUserProfileId);
      assertExists(newWallet, "A new wallet should be created.");
      testUserWalletId = newWallet.walletId;
      walletsToCleanup.push(testUserWalletId);

      const creditParams = {
        walletId: testUserWalletId,
        type: 'CREDIT_PURCHASE' as TokenWalletTransactionType,
        amount: initialCreditAmount,
        recordedByUserId: testUserProfileId,
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
        relatedEntityId: `usage-${crypto.randomUUID()}`,
        relatedEntityType: 'ai_service_usage',
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
      await cleanupStepData(); 
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

  await t.step("recordTransaction: fails if recordedByUserId is missing (via direct RPC call)", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let testUserWalletId: string | null = null;

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
            p_notes: 'Test attempt with null recordedByUserId for RPC direct call'
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
      await cleanupStepData();
    }
  });

  // --- Tests for getWallet --- 

  await t.step("getWallet: successfully retrieves an existing user wallet", async () => {
    assertExists(testUserProfileId, "Test user profile ID must exist for this test.");
    let createdWallet: TokenWallet | null = null;
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
      await cleanupStepData();
    }
  });

  await t.step("getWallet: successfully retrieves an existing organization wallet", async (t) => {
    const step = t.step;
    let testOrgId: string | undefined;
    let orgWalletId: string | undefined;
    // let dummyAdminForOrgMemberTest: TestUserContext | undefined; // This variable is not used in this test

    await step("Setup: Create dummy organization and admin member", async () => {
      testOrgId = crypto.randomUUID();
      await supabaseAdminClient.from("organizations").insert({ id: testOrgId, name: "Test Org for Wallet" });
      assertExists(testUserProfileId, "testUserProfileId should be defined for org membership");
      await supabaseAdminClient.from("organization_members").insert({
        organization_id: testOrgId,
        user_id: testUserProfileId, // Corrected from testAuthUser.id
        role: "admin",
        status: "active",
      });
      console.log(`[Test Debug] Setup: Org ID: ${testOrgId}, User ID: ${testUserProfileId} made admin.`); // Corrected
    });

    await step("Create organization wallet using service", async () => {
      assertExists(testOrgId, "testOrgId should be defined for wallet creation");
      const wallet = await tokenWalletService.createWallet(undefined, testOrgId);
      assertExists(wallet, "Organization wallet should be created");
      orgWalletId = wallet.walletId;
      assertEquals(wallet.organizationId, testOrgId);
      assertEquals(wallet.currency, "AI_TOKEN");
      console.log(`[Test Debug] Wallet created by service: ${JSON.stringify(wallet)}`);

      // Verify with admin client
      const { data: adminFetchedWallet, error: adminFetchError } = await supabaseAdminClient
        .from("token_wallets")
        .select("*")
        .eq("wallet_id", orgWalletId)
        .single();
      assertNotEquals(adminFetchedWallet, null, "Admin client should fetch created org wallet.");
      assertEquals(adminFetchError, null, "Admin client fetch should have no error.");
      console.log(`[Test Debug] Wallet fetched by ADMIN client: ${JSON.stringify(adminFetchedWallet)}`);

      // Verify member status with admin client
      assertExists(testUserProfileId, "testUserProfileId should be defined for org membership check");
      const { data: memberStatus, error: memberError } = await supabaseAdminClient
        .from("organization_members")
        .select("*")
        .eq("organization_id", testOrgId)
        .eq("user_id", testUserProfileId) // Corrected from testAuthUser.id
        .eq("role", "admin")
        .eq("status", "active")
        .single();
      assertNotEquals(memberStatus, null, "Admin client should find active admin membership.");
      assertEquals(memberError, null, "Admin client membership check should have no error.");
      console.log(`[Test Debug] User admin status in org by ADMIN client: ${JSON.stringify(memberStatus)}`);

    });

    await step("Fetch organization wallet using service (as authenticated user)", async () => {
      assertExists(orgWalletId, "orgWalletId should be defined for fetching");
      assertExists(testOrgId, "testOrgId should be defined for RPC check");

      // Debug RPC call to is_admin_of_org_for_wallet
      console.log(`[Test Debug] Pre-getWallet: Calling is_admin_of_org_for_wallet with orgId: ${testOrgId} using supabaseTestClient (auth.uid() perspective)`);
      const { data: rpcCheckData, error: rpcCheckError } = await supabaseTestClient.rpc(
        "is_admin_of_org_for_wallet" as any, // Added 'as any' to bypass type error
        { p_organization_id: testOrgId }
      );
      console.log(`[Test Debug] Pre-getWallet: RPC is_admin_of_org_for_wallet result: data=${JSON.stringify(rpcCheckData)}, error=${JSON.stringify(rpcCheckError)}`);

      const fetchedWallet = await tokenWalletService.getWallet(orgWalletId);
      console.log(`[Test Debug] Wallet fetched by SERVICE (test client): ${JSON.stringify(fetchedWallet)}`);
      assertExists(fetchedWallet, "Fetched org wallet should exist.");
      assertEquals(fetchedWallet.walletId, orgWalletId);
      assertEquals(fetchedWallet.organizationId, testOrgId);
    });
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
        // Create wallet using admin/service context as it's just for setup
        const wallet = await tokenWalletService.createWallet(undefined, testNonAdminOrgId);
        assertExists(wallet, "Organization wallet for non-admin test should be created");
        orgWalletNonAdminId = wallet.walletId;
        walletsToCleanup.push(orgWalletNonAdminId); // Ensure it's cleaned up
        console.log(`[Test Debug NonAdmin] Wallet created for non-admin scenario: ${JSON.stringify(wallet)}`);
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
    let secondTestUser: TestUserContext | null = null;
    let secondUserService: ITokenWalletService | null = null;
    let secondUserClient: SupabaseClient<Database> | null = null;

    try {
      // 1. Original user creates a wallet
      originalUserWallet = await tokenWalletService.createWallet(testUserProfileId);
      assertExists(originalUserWallet, "Original user's wallet should be created.");
      walletsToCleanup.push(originalUserWallet.walletId);

      // 2. Create a second test user and their own Supabase client + service
      const secondUserEmail = `second-test-user-${Date.now()}@example.com`;
      secondTestUser = await createTestUser(supabaseAdminClient, { email: secondUserEmail });
      assertExists(secondTestUser, "Second test user should be created.");
      assertExists(secondTestUser.id, "Second test user ID should exist.");

      // Sign in the second user to get a new session for them
      secondUserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: signInData, error: signInError } = await secondUserClient.auth.signInWithPassword({
        email: secondUserEmail,
        password: "password123",
      });
      if (signInError) throw new Error(`Failed to sign in second test user: ${signInError.message}`);
      assertExists(signInData.session, "Second user session data missing.");
      secondUserClient.auth.setSession(signInData.session);
      
      secondUserService = new TokenWalletService(secondUserClient);

      // 3. Second user attempts to fetch the original user's wallet
      const fetchedWalletBySecondUser = await secondUserService.getWallet(originalUserWallet.walletId);
      assertEquals(fetchedWalletBySecondUser, null, "Second user should not be able to fetch original user's wallet.");

    } finally {
      // Cleanup: Delete the second test user
      if (secondTestUser && secondTestUser.id) {
        const { error: deleteError } = await supabaseAdminClient.auth.admin.deleteUser(secondTestUser.id);
        if (deleteError) console.error(`[Test Cleanup] Error deleting second test user ${secondTestUser.id}:`, deleteError.message);
      }
      // Wallets are cleaned up by the existing global cleanup
    }
  });

  // --- End of tests for getWallet --- 

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
  //     if (createdWalletId) await cleanupWallet(createdWalletId); // Assumes a specific cleanupWallet helper
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