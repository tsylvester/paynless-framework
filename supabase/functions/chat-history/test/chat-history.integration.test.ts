import {
    assertEquals,
    assertExists,
    assert,
} from "jsr:@std/assert";
import { SupabaseClient, createClient, type User as SupabaseUser } from 'npm:@supabase/supabase-js';
import type { Database } from '../../types_db.ts';
// import type { ChatHistoryItem } from '../../../functions/chat-history/index.ts'; // Assuming type is exported from function

// Define ChatHistoryItem locally if not easily importable or to avoid circular deps for tests
interface ChatHistoryItem {
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string;
    user_id: string | null;
    organization_id: string | null;
    // Add any other fields that are expected in the chat history items
}


// --- Manually Load Environment Variables ---
const envPath = new URL('../../.env.local', import.meta.url).pathname;
try {
    const dotEnvText = await Deno.readTextFile(Deno.build.os === 'windows' ? envPath.substring(1) : envPath);
    for (const line of dotEnvText.split('\n')) {
        if (line.trim() === '' || line.startsWith('#')) continue;
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
            let finalValue = value;
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                finalValue = value.substring(1, value.length - 1);
            }
            Deno.env.set(key.trim(), finalValue);
        }
    }
} catch (error) {
    console.warn(`DEBUG: Could not load .env.local for chat-history tests:`, error);
}
// --- End Manual Load ---

// --- Test Configuration ---
const TEST_PASSWORD = 'password';
const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Essential Supabase environment variables are missing for chat-history integration tests.');
}

const chatHistoryEndpoint = `${supabaseUrl}/functions/v1/chat-history`;

// --- Helper Functions (Ported and adapted) ---
async function createTestUser(adminClient: SupabaseClient<Database>, email: string, password = TEST_PASSWORD): Promise<SupabaseUser> {
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Failed to create test user ${email}: ${error.message}`);
  if (!data.user) throw new Error('No user data returned for createTestUser.');
  await new Promise(resolve => setTimeout(resolve, 500)); // For triggers
  return data.user;
}

async function createTestOrg(adminClient: SupabaseClient<Database>, name: string, ownerId: string): Promise<{ id: string; name: string }> {
    const { data: orgData, error: orgError } = await adminClient.from('organizations').insert({ name }).select('id, name').single();
    if (orgError) throw new Error(`Failed to create test org "${name}": ${orgError.message}`);
    if (!orgData) throw new Error('No data returned for createTestOrg.');
    const { error: memberError } = await adminClient.from('organization_members').insert({ organization_id: orgData.id, user_id: ownerId, role: 'admin', status: 'active' });
    if (memberError) {
        await adminClient.from('organizations').delete().eq('id', orgData.id);
        throw new Error(`Failed to add owner ${ownerId} to org ${orgData.id}: ${memberError.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 200)); 
    return orgData;
}

async function createTestChat(adminClient: SupabaseClient<Database>, userId: string | null, orgId: string | null, title: string): Promise<{id: string; title: string}> {
    const { data, error } = await adminClient.from('chats').insert({ user_id: userId, organization_id: orgId, title: title }).select('id, title').single();
    if (error) throw new Error(`Failed to create test chat "${title}": ${error.message}`);
    if (!data || data.title === null) throw new Error('No data or null title returned for createTestChat.');
    return data as {id: string; title: string};
}

async function cleanupTestData(adminClient: SupabaseClient<Database>, usersToDelete: string[], orgsToDelete: string[] = []) {
  for (const userId of usersToDelete) {
     const { error } = await adminClient.auth.admin.deleteUser(userId, true);
     if (error && !error.message.includes('User not found')) {
       console.error(`Failed to delete user ${userId}:`, error.message);
     }
  }
  for (const orgId of orgsToDelete) {
    const { error } = await adminClient.from('organizations').delete().eq('id', orgId);
    if (error) {
        console.warn(`Could not clean up org ${orgId}: ${error.message}`);
    }
  }
}

async function safeSignOut(client: SupabaseClient | null, clientName = "client") {
    if (client && client.auth) {
        const { error } = await client.auth.signOut();
        if (error) console.warn(`Error signing out ${clientName}: ${error.message}`);
    }
}

// --- Test Suite ---
Deno.test("Edge Function Integration Tests: GET /chat-history", async (t) => {
  let supabaseAdmin: SupabaseClient<Database>;
  let testUser: SupabaseUser | null = null;
  const usersToDelete: string[] = [];
  const orgsToDelete: string[] = []; // Keep track of orgs to delete

  // BeforeAll equivalent
  supabaseAdmin = createClient<Database>(supabaseUrl!, supabaseServiceRoleKey!);

  try {
    const userEmail = `test-user-hist-${Date.now()}@integration.test`;
    testUser = await createTestUser(supabaseAdmin, userEmail);
    usersToDelete.push(testUser.id);

    // --- Test Steps ---
    await t.step('should return 401 Unauthorized if no auth token is provided', async () => {
        const response = await fetch(chatHistoryEndpoint, {
            method: 'GET',
            headers: { 'apikey': supabaseAnonKey! },
        });
        assertEquals(response.status, 401);
        let bodyParsed = false;
        try {
            const body = await response.json();
            bodyParsed = true;
            assertEquals(body.error, "Missing Authorization header");
        } catch (e) {
            if (!bodyParsed) {
                const textBody = await response.text(); 
                console.warn("401 test could not parse JSON response. Text body:", textBody);
                assert(textBody.includes("Missing Authorization header") || textBody.includes("Unauthorized"), "Body should indicate auth error even if not JSON");
            } else {
                throw e;
            }
        }
    });

    await t.step('should return personal chats for authenticated user with no organizationId', async () => {
        if (!testUser || !testUser.email) throw new Error('Test user not available for personal chats test');

        let userClientForStep: SupabaseClient<Database> | null = null;
        try {
            // 1. Get auth token for testUser
            userClientForStep = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
            const { data: signInData, error: signInError } = await userClientForStep.auth.signInWithPassword({
                email: testUser.email,
                password: TEST_PASSWORD,
            });
            assertEquals(signInError, null, `Sign-in error: ${signInError?.message}`);
            const authToken = signInData!.session!.access_token;

            // 2. Create some personal chats for testUser using admin client
            const personalChat1 = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Chat 1');
            const personalChat2 = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Chat 2');
            // Ensure these are cleaned up if the test fails before the main cleanup
            // However, user deletion should cascade to their personal chats if FKs are set up correctly.

            // 3. Fetch chatHistoryEndpoint with auth token
            const response = await fetch(chatHistoryEndpoint, {
                method: 'GET',
                headers: {
                    'apikey': supabaseAnonKey!,
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            assertEquals(response.status, 200);
            const body: ChatHistoryItem[] = await response.json();
            assert(Array.isArray(body), "Response body should be an array of chat history items");
            
            // Filter out any other chats that might exist from other tests if run concurrently or if cleanup failed
            const userPersonalChats = body.filter(chat => chat.user_id === testUser?.id && !chat.organization_id);

            assertEquals(userPersonalChats.length, 2, "Expected 2 personal chats for the user");
            assert(userPersonalChats.some(chat => chat.id === personalChat1.id && chat.title === personalChat1.title),
                   "Personal Chat 1 not found or title mismatch");
            assert(userPersonalChats.some(chat => chat.id === personalChat2.id && chat.title === personalChat2.title),
                   "Personal Chat 2 not found or title mismatch");

        } finally {
            await safeSignOut(userClientForStep, 'userClient_personal_chats');
        }
    });

    await t.step('should return organization chats for authenticated user with valid organizationId', async () => {
        if (!testUser || !testUser.email) throw new Error('Test user not available for org chats test');

        let userClientForStep: SupabaseClient<Database> | null = null;
        let testOrg: { id: string; name: string } | null = null;
        try {
            // 1. Get auth token for testUser
            userClientForStep = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
            const { data: signInData, error: signInError } = await userClientForStep.auth.signInWithPassword({
                email: testUser.email,
                password: TEST_PASSWORD,
            });
            assertEquals(signInError, null, `Sign-in error: ${signInError?.message}`);
            const authToken = signInData!.session!.access_token;

            // 2. Create an org and make testUser the owner/admin
            testOrg = await createTestOrg(supabaseAdmin, `Test Org Hist ${Date.now()}`, testUser.id);
            orgsToDelete.push(testOrg.id); // Add to cleanup list

            // 3. Create chats: one personal, two for the org
            const personalChat = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Chat For Org Test');
            const orgChat1 = await createTestChat(supabaseAdmin, testUser.id, testOrg.id, 'Org Chat 1 Hist');
            const orgChat2 = await createTestChat(supabaseAdmin, testUser.id, testOrg.id, 'Org Chat 2 Hist');

            // 4. Fetch chatHistoryEndpoint with auth token and organizationId query param
            const url = `${chatHistoryEndpoint}?organizationId=${testOrg.id}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': supabaseAnonKey!,
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            assertEquals(response.status, 200);
            const body: ChatHistoryItem[] = await response.json();
            assert(Array.isArray(body), "Response body should be an array of org chat history items");

            assertEquals(body.length, 2, "Expected 2 organization chats");
            assert(body.every(chat => chat.organization_id === testOrg!.id), "All returned chats should belong to the specified organization");
            assert(body.some(chat => chat.id === orgChat1.id && chat.title === orgChat1.title),
                   "Org Chat 1 not found or title mismatch");
            assert(body.some(chat => chat.id === orgChat2.id && chat.title === orgChat2.title),
                   "Org Chat 2 not found or title mismatch");
            assert(!body.some(chat => chat.id === personalChat.id),
                   "Personal chat should not be included in organization history");

        } finally {
            await safeSignOut(userClientForStep, 'userClient_org_chats');
            // Org cleanup is handled by the main finally block using orgsToDelete array
        }
    });

    await t.step('should return empty list if user requests org chats they are not part of', async () => {
        if (!testUser || !testUser.email) throw new Error('Primary testUser not available for this test');

        let userClientForStep: SupabaseClient<Database> | null = null;
        let secondTestUser: SupabaseUser | null = null;
        let secondOrg: { id: string; name: string } | null = null;

        try {
            // 1. Create a second user and an organization for them
            const secondUserEmail = `second-user-hist-${Date.now()}@integration.test`;
            secondTestUser = await createTestUser(supabaseAdmin, secondUserEmail);
            usersToDelete.push(secondTestUser.id); // Add for cleanup

            secondOrg = await createTestOrg(supabaseAdmin, `Second Org Hist ${Date.now()}`, secondTestUser.id);
            orgsToDelete.push(secondOrg.id); // Add for cleanup

            // Create a chat in the second org to ensure it's not empty
            await createTestChat(supabaseAdmin, secondTestUser.id, secondOrg.id, 'Chat in Second Org');

            // 2. Get auth token for the *primary* testUser
            userClientForStep = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
            const { data: signInData, error: signInError } = await userClientForStep.auth.signInWithPassword({
                email: testUser.email, // Primary testUser
                password: TEST_PASSWORD,
            });
            assertEquals(signInError, null, `Sign-in error for primary user: ${signInError?.message}`);
            const authToken = signInData!.session!.access_token;

            // 3. Primary testUser attempts to fetch chat history for secondOrg.id
            const url = `${chatHistoryEndpoint}?organizationId=${secondOrg.id}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': supabaseAnonKey!,
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            assertEquals(response.status, 200, "Expected 200 OK even for inaccessible org (RLS filters)");
            const body: ChatHistoryItem[] = await response.json();
            assert(Array.isArray(body), "Response body should be an array");
            assertEquals(body.length, 0, "Expected empty array for chats of an org the user is not part of");

        } finally {
            await safeSignOut(userClientForStep, 'userClient_inaccessible_org_chats');
            // secondTestUser and secondOrg are cleaned up by the main finally block
        }
    });

    // More tests to be added here...

  } finally {
    // AfterAll equivalent
    await cleanupTestData(supabaseAdmin, usersToDelete, orgsToDelete);
    await safeSignOut(supabaseAdmin, 'supabaseAdmin_chat_history');
  }
}); 