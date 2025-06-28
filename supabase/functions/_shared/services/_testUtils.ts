import {
  SupabaseClient,
  createClient,
} from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import {
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TokenWalletService } from './tokenWalletService.ts'; // May not be needed here directly, but helpers might use its types implicitly
import type { ITokenWalletService } from '../types/tokenWallet.types.ts';

// Configuration for Supabase client - get from environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error(
    'Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY environment variables.'
  );
  throw new Error('Supabase environment variables for tests are not set.');
}

// Admin client for setup/teardown tasks that require bypassing RLS
export const adminClient = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

// Function to create a new user-specific Supabase client
export function createServiceClient(userAccessToken?: string): SupabaseClient<Database> {
  const headers: { [key: string]: string } = {};
  if (userAccessToken) {
    headers['Authorization'] = `Bearer ${userAccessToken}`;
  }
  return createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: { headers }, // Apply the access token if provided
  });
}

// Define TestUserContext for helper function
export interface TestUserContext {
  id: string;
  email: string;
  // accessToken?: string; // Optional: if we want to store and reuse access tokens
}

// Helper function to create a test user
export async function createTestUserUtil(
  options: { email: string; password?: string; email_confirm?: boolean }
): Promise<TestUserContext> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: options.email,
    password: options.password || 'password123',
    email_confirm: options.email_confirm === undefined ? true : options.email_confirm,
  });
  if (error) {
    throw new Error(
      `Failed to create test user ${options.email}: ${error.message}`
    );
  }
  assertExists(data.user, `User data missing for ${options.email}`);
  // Ensure a profile is created by waiting a bit, can be made more robust if needed
  await new Promise((resolve) => setTimeout(resolve, 500));
  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('id')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile) {
    console.warn(
      `Profile not found immediately for ${data.user.id}, ensure triggers are working or manually create if tests fail.`
    );
  }
  return { id: data.user.id, email: data.user.email as string };
}

// Helper function to set up an organization and make the primary test user an admin
export async function createOrgAndMakeUserAdminUtil(
  orgNamePrefix: string,
  currentTestUserProfileId: string,
  orgsToCleanupArray: string[] // Pass the array by reference to modify it
): Promise<string> {
  const orgId = crypto.randomUUID();
  const orgName = `${orgNamePrefix}-${orgId.substring(0, 8)}`;
  const { data: orgData, error: orgInsertError } = await adminClient
    .from('organizations')
    .insert({ id: orgId, name: orgName })
    .select('id')
    .single();

  if (orgInsertError) {
    throw new Error(
      `Failed to insert dummy organization for test (${orgName}): ${orgInsertError.message}`
    );
  }
  assertExists(orgData, 'Dummy organization data should exist after insert.');
  orgsToCleanupArray.push(orgData.id);

  assertExists(
    currentTestUserProfileId,
    'Test user profile ID must exist to make them an org admin.'
  );
  const { error: memberInsertError } = await adminClient
    .from('organization_members')
    .insert({
      organization_id: orgData.id,
      user_id: currentTestUserProfileId,
      role: 'admin',
      status: 'active',
    });
  if (memberInsertError) {
    await adminClient.from('organizations').delete().eq('id', orgData.id);
    const index = orgsToCleanupArray.indexOf(orgData.id);
    if (index > -1) {
      orgsToCleanupArray.splice(index, 1);
    }
    throw new Error(
      `Failed to insert test user into organization_members for org ${orgName}: ${memberInsertError.message}`
    );
  }
  return orgData.id;
}

// Helper function to set up a complete secondary user context (auth user, client, service)
export interface SecondUserFullContext {
  user: TestUserContext;
  client: SupabaseClient<Database>;
  service: ITokenWalletService;
}
export async function setupSecondUserContextUtil(): Promise<SecondUserFullContext> {
  const secondUserEmail = `second-user-${Date.now()}@example.com`;
  const user = await createTestUserUtil({ email: secondUserEmail });
  assertExists(user, 'Second test user should be created by helper.');
  assertExists(user.id, 'Second test user ID should exist.');

  const client = createServiceClient(); // Creates a client with anon key
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
    email: secondUserEmail,
    password: 'password123',
  });
  if (signInError) {
    await adminClient.auth.admin.deleteUser(user.id);
    throw new Error(
      `Failed to sign in second test user (${secondUserEmail}): ${signInError.message}`
    );
  }
  assertExists(signInData.session, 'Second user session data missing after sign in.');
  client.auth.setSession(signInData.session);

  const service = new TokenWalletService(client);
  return { user, client, service };
}

export async function performTestResourceCleanup(
  walletsToCleanup: string[],
  orgsToCleanup: string[],
  stepName?: string
): Promise<void> {
  console.log(
    `[Test Cleanup - ${stepName || 'General'}] Cleaning up data. Wallets to clean: ${walletsToCleanup.length}, Orgs to clean: ${orgsToCleanup.length}`
  );
  // console.log(`[Test Cleanup - ${stepName || 'General'}] Wallet IDs: ${JSON.stringify(walletsToCleanup)}`);
  // console.log(`[Test Cleanup - ${stepName || 'General'}] Org IDs: ${JSON.stringify(orgsToCleanup)}`);

  for (const walletId of walletsToCleanup) {
    // console.log(`[Test Cleanup - ${stepName || 'General'}] Attempting to delete transactions for wallet ${walletId}`);
    const { error: txnError } = await adminClient
      .from('token_wallet_transactions')
      .delete()
      .eq('wallet_id', walletId);
    if (txnError) {
      console.error(
        `[Test Cleanup - ${stepName || 'General'}] Error cleaning transactions for wallet ${walletId}:`,
        txnError
      );
    } else {
      // console.log(`[Test Cleanup - ${stepName || 'General'}] Successfully deleted transactions for wallet ${walletId}`);
    }

    // console.log(`[Test Cleanup - ${stepName || 'General'}] Attempting to delete wallet ${walletId}`);
    const { error: walletError } = await adminClient
      .from('token_wallets')
      .delete()
      .eq('wallet_id', walletId);
    if (walletError) {
      console.error(
        `[Test Cleanup - ${stepName || 'General'}] Error cleaning wallet ${walletId}:`,
        walletError
      );
    } else {
      // console.log(`[Test Cleanup - ${stepName || 'General'}] Successfully deleted wallet ${walletId}`);
    }
  }
  walletsToCleanup.length = 0; // Clear the array after processing

  for (const orgId of orgsToCleanup) {
    // console.log(`[Test Cleanup - ${stepName || 'General'}] Attempting to delete members for organization ${orgId}`);
    const { error: memberDeleteError } = await adminClient
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId);
    if (memberDeleteError) {
      console.warn(
        `[Test Cleanup - ${stepName || 'General'}] Warning cleaning members for organization ${orgId}:`,
        memberDeleteError
      );
    } else {
      // console.log(`[Test Cleanup - ${stepName || 'General'}] Successfully deleted members for org ${orgId}`);
    }

    // console.log(`[Test Cleanup - ${stepName || 'General'}] Attempting to delete organization ${orgId}`);
    const { error: orgError } = await adminClient
      .from('organizations')
      .delete()
      .eq('id', orgId);
    if (orgError) {
      console.error(
        `[Test Cleanup - ${stepName || 'General'}] Error cleaning organization ${orgId}:`,
        orgError
      );
    } else {
      // console.log(`[Test Cleanup - ${stepName || 'General'}] Successfully deleted org ${orgId}`);
    }
  }
  orgsToCleanup.length = 0; // Clear the array after processing
}

export interface PrimaryTestUserContext {
  userId: string;
  email: string;
  serviceClient: SupabaseClient<Database>;
  serviceInstance: ITokenWalletService;
}

export async function setupPrimaryTestUserAndClient(): Promise<PrimaryTestUserContext> {
  const testUserEmail = `primary-test-user-${Date.now()}@example.com`;
  const testUserPassword = 'password123';
  
  const { data: adminUserData, error: adminUserError } = await adminClient.auth.admin.createUser({
    email: testUserEmail,
    password: testUserPassword,
    email_confirm: true,
  });

  if (adminUserError) {
    throw new Error(
      `Failed to create primary test auth user with admin client: ${adminUserError.message}`
    );
  }
  assertExists(adminUserData.user, 'Primary test auth user data missing after admin creation.');
  const primaryUserId = adminUserData.user.id;
  // console.log(`[Test Setup Util] Created primary test auth user: ${primaryUserId}`);

  // Delete pre-existing personal wallet for this user
  await adminClient
    .from('token_wallets')
    .delete()
    .eq('user_id', primaryUserId)
    .is('organization_id', null);
  // console.log(`[Test Setup Util] Ensured no pre-existing personal wallet for user: ${primaryUserId}`);

  const serviceClient = createServiceClient(); // Anon client initially
  const { data: signInData, error: signInError } = await serviceClient.auth.signInWithPassword({
    email: testUserEmail,
    password: testUserPassword,
  });
  if (signInError) {
    await adminClient.auth.admin.deleteUser(primaryUserId); // cleanup auth user
    throw new Error(`Failed to sign in primary test user: ${signInError.message}`);
  }
  assertExists(signInData.session, 'Session data missing after primary user sign in.');
  serviceClient.auth.setSession(signInData.session);
  // console.log(`[Test Setup Util] Set session for serviceClient for user: ${primaryUserId}`);

  // Verify user_profile creation
  await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay for trigger
  const { data: userProfile, error: profileFetchError } = await serviceClient
    .from('user_profiles')
    .select('id')
    .eq('id', primaryUserId)
    .single();

  if (profileFetchError) {
    await adminClient.auth.admin.deleteUser(primaryUserId);
    throw new Error(
      `Failed to fetch user profile for primary user: ${profileFetchError.message}.`
    );
  }
  assertExists(userProfile, 'Primary test user profile should exist.');

  const serviceInstance = new TokenWalletService(serviceClient);

  return {
    userId: primaryUserId,
    email: testUserEmail,
    serviceClient,
    serviceInstance,
  };
}

export async function teardownPrimaryTestUser(userId: string | null): Promise<void> {
  // console.log(`[Test Teardown Util] Attempting to sign out and clean up user ${userId}`);
  if (!userId) return;

  // It's good practice to sign out if a client instance was used, 
  // but the client itself might be scoped to the test file and not passed here.
  // If client is available: await client.auth.signOut();

  const { error: authUserDeleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (authUserDeleteError) {
    console.error(
      `[Test Teardown Util] Error deleting auth user ${userId}:`,
      authUserDeleteError.message
    );
  } else {
    // console.log(`[Test Teardown Util] Successfully deleted auth user ${userId}`);
  }
  // user_profiles are deleted by cascade from auth.users
} 