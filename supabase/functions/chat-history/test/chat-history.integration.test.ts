import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
// Potentially load env vars for testing if needed (e.g., using dotenv)
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../../../.env' }); // Adjust path relative to this file
import type { Database } from '../../../functions/types_db'; // Adjust path as needed
import type { ChatHistoryItem } from '../../../functions/chat-history'; // Adjust path as needed
// Import User type from gotrue-js
import type { User } from '@supabase/gotrue-js'; 

// --- Test Configuration ---
// Read directly from process.env, expecting dotenv to have loaded them
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Check if essential variables are loaded
if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error('Supabase URL:', supabaseUrl);
  console.error('Supabase Anon Key:', supabaseAnonKey);
  console.error('Supabase Service Role Key:', supabaseServiceRoleKey);
  throw new Error('Essential Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY) are missing. Ensure .env file is present at the root and correctly configured, and the dotenv path is correct.');
}

const functionsUrl = `${supabaseUrl}/functions/v1`;
const chatHistoryEndpoint = `${functionsUrl}/chat-history`;

// --- Helper Functions (Placeholder - Implement as needed) ---
// Function to create a test user
async function createTestUser(adminClient: SupabaseClient<Database>, email: string, password = 'password'): Promise<User> {
  // Cast to any to bypass linter error for admin methods
  const { data, error } = await (adminClient.auth as any).admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm user for testing
  });
  if (error) throw new Error(`Failed to create test user ${email}: ${error.message}`);
  if (!data.user) throw new Error('Failed to create test user: No user data returned.');
  // Trigger should create profile automatically via handle_new_user
  // Wait a moment for the trigger to potentially complete (can be improved with polling/checking profile)
  await new Promise(resolve => setTimeout(resolve, 500)); 
  return data.user;
}

// Function to create a test organization and add the owner as admin member
async function createTestOrg(adminClient: SupabaseClient<Database>, name: string, ownerId: string): Promise<{ id: string; name: string }> {
    // 1. Create the organization
    const { data: orgData, error: orgError } = await adminClient
        .from('organizations')
        .insert({ name: name })
        .select('id, name')
        .single();

    if (orgError) throw new Error(`Failed to create test org "${name}": ${orgError.message}`);
    if (!orgData) throw new Error('Failed to create test org: No data returned.');

    console.log(`Created organization: ${orgData.id} (${orgData.name})`);

    // 2. Add the owner as an admin member with active status
    const { error: memberError } = await adminClient
        .from('organization_members')
        .insert({
            organization_id: orgData.id,
            user_id: ownerId,
            role: 'admin',
            status: 'active' // Explicitly set status to active
        });

    if (memberError) {
        // Attempt to clean up the created org if member insertion fails
        await adminClient.from('organizations').delete().eq('id', orgData.id);
        throw new Error(`Failed to add owner ${ownerId} to org ${orgData.id}: ${memberError.message}`);
    }
     console.log(`Added owner ${ownerId} as admin to organization: ${orgData.id}`);

    // Wait a moment for potential async operations/triggers
    await new Promise(resolve => setTimeout(resolve, 200)); 

    return orgData;
}

// Function to create a test chat
async function createTestChat(adminClient: SupabaseClient<Database>, userId: string | null, orgId: string | null, title: string): Promise<{id: string; title: string}> {
    const { data, error } = await adminClient.from('chats').insert({
        user_id: userId,
        organization_id: orgId,
        title: title,
    }).select('id, title').single();

    if (error) throw new Error(`Failed to create test chat "${title}": ${error.message}`);
    if (!data) throw new Error('Failed to create test chat: No data returned.');
    
    return data; // Return the data object { id, title }
}

// Function to clean up test data
async function cleanupTestData(adminClient: SupabaseClient<Database>, usersToDelete: string[]) {
  console.warn('cleanupTestData: Deleting users...');
  for (const userId of usersToDelete) {
     console.log(`Attempting to delete user: ${userId}`);
     // Cast to any to bypass linter error for admin methods
     const { error } = await (adminClient.auth as any).admin.deleteUser(userId);
     if (error) {
       console.error(`Failed to delete user ${userId}:`, error.message);
     } else {
       console.log(`Successfully deleted user: ${userId}`);
     }
     // Associated profile/chats should cascade delete based on schema
  }
}

// --- Test Suite ---
describe('Edge Function Integration Tests: GET /chat-history', () => {
  let supabaseAdmin: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>; // Client for signing in as test user
  let testUser: User | null = null;
  const usersToDelete: string[] = []; // Keep track of users to delete

  beforeAll(async () => {
    // Re-check essential variables loaded by dotenv
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
       throw new Error('Supabase test config missing from environment.'); // Simplified error
    }
    supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
    userClient = createClient<Database>(supabaseUrl, supabaseAnonKey); // Standard client for user actions

    // Clean up any potential leftover data from previous runs (optional but recommended)
    // await cleanupTestData(supabaseAdmin, []); // Need a way to find old test users if not tracked

    // Create necessary test data (e.g., a user)
    try {
      const userEmail = `test-user-${Date.now()}@integration.test`;
      testUser = await createTestUser(supabaseAdmin, userEmail);
      usersToDelete.push(testUser.id); // Add user to cleanup list
      console.log('Created test user:', testUser.id, testUser.email);
    } catch (error) { 
      console.error("Error during test setup (creating user):", error);
      throw error; // Fail fast if setup fails
    }
  });

  afterAll(async () => {
    // Cleanup test data created during the suite
    if (usersToDelete.length > 0) {
      await cleanupTestData(supabaseAdmin, usersToDelete);
    }
  });

  it('STEP-1.4.5 [GREEN]: should return 401 Unauthorized if no auth token is provided', async () => {
    const response = await fetch(chatHistoryEndpoint, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey, // Still need anon key even without auth
      },
    });

    expect(response.status).toBe(401);
    // Optional: Check response body for specific error message
    // const body = await response.json();
    // expect(body.error).toContain('Missing Authorization header');
  });

  // --- Add more tests here based on checklist Step 1.4.5 ---

  it('[GREEN]: should return personal chats for authenticated user with no organizationId', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created in beforeAll');

    // 1. Get auth token for testUser
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
      email: testUser.email,
      password: 'password', // Default password used in createTestUser
    });
    expect(signInError).toBeNull();
    expect(signInData?.session?.access_token).toBeDefined();
    const authToken = signInData!.session!.access_token;

    // 2. Create some personal chats for testUser using admin client
    const personalChat1 = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Chat 1');
    const personalChat2 = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Chat 2');
    // Create a chat for another user (or org) to ensure it's filtered out - requires another user/org setup later
    // const otherChat = await createTestChat(supabaseAdmin, 'other-user-id', null, 'Other User Chat');

    // 3. Fetch chatHistoryEndpoint with auth token
    const response = await fetch(chatHistoryEndpoint, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    // 4. Expect response.status === 200 
    expect(response.status).toBe(200);

    // 5. Expect response body to contain only the personal chats created
    const body: ChatHistoryItem[] = await response.json();
    expect(Array.isArray(body)).toBe(true);
    // This assertion currently passes because RLS handles the filtering correctly
    expect(body).toHaveLength(2); 
    expect(body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: personalChat1.id, title: personalChat1.title }),
      expect.objectContaining({ id: personalChat2.id, title: personalChat2.title }),
    ]));
    // Add negative assertion later: expect not to contain otherChat.id
  });

  it('STEP-1.4.5 [GREEN]: should return organization chats for authenticated user with valid organizationId', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created in beforeAll');

    // 1. Get auth token for testUser (same as previous test)
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
      email: testUser.email,
      password: 'password',
    });
    expect(signInError).toBeNull();
    const authToken = signInData!.session!.access_token;

    // 2. Create an org and make testUser the owner/admin
    const testOrg = await createTestOrg(supabaseAdmin, `Test Org ${Date.now()}`, testUser.id);
    const testOrgId = testOrg.id;

    // 3. Create chats: some personal (re-use from previous test is tricky due to isolation needs), some for the org
    // Let's create fresh ones for clarity
    const personalChat = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Chat For Org Test');
    const orgChat1 = await createTestChat(supabaseAdmin, testUser.id, testOrgId, 'Org Chat 1');
    const orgChat2 = await createTestChat(supabaseAdmin, testUser.id, testOrgId, 'Org Chat 2');
    // TODO: Create another org and chat for negative testing later

    // 4. Fetch chatHistoryEndpoint with auth token and organizationId query param
    const url = `${chatHistoryEndpoint}?organizationId=${testOrgId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    // 5. Expect response.status === 200 (Function might return 200 but incorrect data)
    expect(response.status).toBe(200);

    // 6. Expect response body to contain only the org chats created
    const body: ChatHistoryItem[] = await response.json();
    expect(Array.isArray(body)).toBe(true);

    // THIS IS THE ASSERTION EXPECTED TO FAIL (RED STATE)
    // The current function ignores organizationId and likely returns personal chats (or all chats pre-RLS)
    expect(body).toHaveLength(2); 
    expect(body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: orgChat1.id, title: orgChat1.title }),
      expect.objectContaining({ id: orgChat2.id, title: orgChat2.title }),
    ]));
    // Negative assertion: Should not contain the personal chat
    expect(body).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: personalChat.id })
    ]));
    
    // TODO: Add cleanup for the created org if not handled by cascade delete?
  });

   // it('should return empty list/403 if user requests org chats they are not part of', async () => {
   //   // ... setup user, another org ...
   //   // Fetch chatHistoryEndpoint with auth token and the *other* org's ID
   //   // Expect response.status === 200 (RLS filters) or 403 (if explicitly denied)
   //   // Expect response body to be an empty array or specific error
   // });

});
