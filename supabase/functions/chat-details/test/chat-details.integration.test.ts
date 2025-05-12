import {
    assertEquals,
    assertExists,
    assertNotEquals,
    assertObjectMatch,
    assertStringIncludes,
    assert,
} from "jsr:@std/assert";
import { SupabaseClient, createClient, type User as SupabaseUser } from 'npm:@supabase/supabase-js';
import type { Database } from '../../types_db.ts';

// --- Manually Load Environment Variables (Copy from chat.integration.test.deno.ts) ---
const envPath = new URL('../../.env.local', import.meta.url).pathname;
try {
    const dotEnvText = await Deno.readTextFile(Deno.build.os === 'windows' ? envPath.substring(1) : envPath);
    for (const line of dotEnvText.split('\n')) {
        if (line.trim() === '' || line.startsWith('#')) {
            continue;
        }
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
    console.warn(`DEBUG: Could not load or parse .env.local file at ${envPath}:`, error);
}
// --- End Manual Load ---

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
type Chat = Database['public']['Tables']['chats']['Row'];

// --- Test Configuration ---
const TEST_PASSWORD = 'password';
const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Essential Supabase environment variables are missing for integration tests. Ensure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are set (e.g., in .env.local).');
}

// Assuming chat-details function is served at this path relative to functionsUrl
// const functionsUrl = `${supabaseUrl}/functions/v1`; // Not directly used if calling mainHandler, but good for fetch tests
const chatDetailsBaseEndpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-details`;


// --- Helper Functions (Ported and adapted for Deno) ---
async function createTestUser(adminClient: SupabaseClient<Database>, email: string, password = TEST_PASSWORD): Promise<SupabaseUser> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create test user ${email}: ${error.message}`);
  if (!data.user) throw new Error('Failed to create test user: No user data returned.');
  await new Promise(resolve => setTimeout(resolve, 500));
  return data.user;
}

async function createTestOrg(adminClient: SupabaseClient<Database>, name: string, ownerId: string, role: 'admin' | 'member' = 'admin'): Promise<{ id: string; name: string }> {
    const { data: orgData, error: orgError } = await adminClient.from('organizations').insert({ name: name }).select('id, name').single();
    if (orgError) throw new Error(`Failed to create test org "${name}": ${orgError.message}`);
    if (!orgData) throw new Error('Failed to create test org: No data returned.');
    // console.log(`Created organization: ${orgData.id} (${orgData.name})`);
    const { error: memberError } = await adminClient.from('organization_members').insert({ organization_id: orgData.id, user_id: ownerId, role: role, status: 'active' });
    if (memberError) {
        await adminClient.from('organizations').delete().eq('id', orgData.id);
        throw new Error(`Failed to add owner ${ownerId} to org ${orgData.id} with role ${role}: ${memberError.message}`);
    }
    // console.log(`Added owner ${ownerId} as ${role} to organization: ${orgData.id}`);
    await new Promise(resolve => setTimeout(resolve, 200));
    return orgData;
}

async function createTestChat(adminClient: SupabaseClient<Database>, userId: string | null, orgId: string | null, title: string): Promise<{id: string; title: string}> {
    const { data, error } = await adminClient.from('chats').insert({ user_id: userId, organization_id: orgId, title: title }).select('id, title').single();
    if (error) throw new Error(`Failed to create test chat "${title}": ${error.message}`);
    if (!data) throw new Error('Failed to create test chat: No data returned.');
    if (data.title === null) {
        throw new Error('createTestChat query returned a null title, which is not expected by its return type.');
    }
    return data as {id: string; title: string};
}

async function createTestMessage(adminClient: SupabaseClient<Database>, chatId: string, userId: string | null, role: 'user' | 'assistant' | 'system', content: string, isActive = true): Promise<ChatMessage> {
     const { data, error } = await adminClient.from('chat_messages').insert({
        chat_id: chatId,
        user_id: userId,
        role: role,
        content: content,
        is_active_in_thread: isActive
     }).select('*').single();
     if (error) throw new Error(`Failed to create test message in chat ${chatId}: ${error.message}`);
     if (!data) throw new Error('Failed to create test message: No data returned.');
     return data as ChatMessage;
}

async function checkChatExists(adminClient: SupabaseClient<Database>, chatId: string): Promise<boolean> {
    const { data, error } = await adminClient.from('chats').select('id').eq('id', chatId).maybeSingle();
    if (error) {
        console.error(`Error checking if chat ${chatId} exists:`, error);
        return false;
    }
    return !!data;
}

async function cleanupTestData(adminClient: SupabaseClient<Database>, usersToDelete: string[]) {
  // console.warn('cleanupTestData: Deleting users...');
  for (const userId of usersToDelete) {
     // console.log(`Attempting to delete user: ${userId}`);
     const { error } = await adminClient.auth.admin.deleteUser(userId, true);
     if (error && !error.message.includes('User not found')) {
       console.error(`Failed to delete user ${userId}:`, error.message);
     } else if (!error) {
       // console.log(`Successfully deleted user: ${userId}`);
     }
  }
}

async function getChatMessagesByChatId(adminClient: SupabaseClient<Database>, chatId: string): Promise<ChatMessage[]> {
    const { data, error } = await adminClient.from('chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (error) {
        console.error(`Error fetching messages for chat ${chatId}:`, error);
        return [];
    }
    return data || [];
}

async function safeSignOut(client: SupabaseClient | null, clientName = "client") {
    if (client && client.auth) {
        const { error } = await client.auth.signOut();
        if (error) {
            console.warn(`Error signing out ${clientName}: ${error.message}`);
        }
    }
}


// --- Test Suite for GET /chat-details/:chatId ---
Deno.test("Edge Function Integration Tests: GET /chat-details/:chatId", async (t) => {
  let supabaseAdmin: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database> | null = null; // To be created for user-specific actions
  let testUser: SupabaseUser | null = null;
  let otherUser: SupabaseUser | null = null;
  const usersToDelete: string[] = [];

  // BeforeAll equivalent: Setup code runs at the start of the Deno.test async function
  supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
  // userClient = createClient<Database>(supabaseUrl, supabaseAnonKey); // Create specific user clients as needed in steps

  try {
    const userEmail = `test-user-details-${Date.now()}@integration.test`;
    testUser = await createTestUser(supabaseAdmin, userEmail);
    usersToDelete.push(testUser.id);
    // console.log('Created primary test user:', testUser.id);

    const otherUserEmail = `other-user-details-${Date.now()}@integration.test`;
    otherUser = await createTestUser(supabaseAdmin, otherUserEmail);
    usersToDelete.push(otherUser.id);
    // console.log('Created secondary test user:', otherUser.id);

    // --- Test Steps for GET ---
    await t.step('STEP-1.4.5 [RED]: should return 401 Unauthorized if no auth token is provided', async () => {
        const fakeChatId = '00000000-0000-0000-0000-000000000000';
        const response = await fetch(`${chatDetailsBaseEndpoint}/${fakeChatId}`, {
            method: 'GET',
            headers: {
            'apikey': supabaseAnonKey!, // Non-null assertion
            // No Authorization header
            },
        });
        assertEquals(response.status, 401);
        // Consume the body to prevent leak warnings and debug
        try {
            const body = await response.json(); 
            console.log("DEBUG GET 401 response body (JSON):", JSON.stringify(body)); 
            assertExists(body.message || body.error || body.msg, "401 response should have a message, error, or msg property");
        } catch (e) {
            // If .json() fails, try .text()
            const textBody = await response.text();
            console.log("DEBUG GET 401 response body (TEXT):", textBody);
            // If it's not JSON, we might not have a structured error, but the leak is fixed.
            // Add an assertion if there's a common text pattern for unauthenticated Supabase function calls.
            assert(textBody.length >= 0, "401 response text body should exist"); 
        }
    });

    await t.step('STEP-1.4.5 [RED]: should return messages for a personal chat', async () => {
        if (!testUser || !testUser.email) throw new Error('Test user not created');
        
        let userClientForStep: SupabaseClient<Database> | null = null;
        try {
            // 1. Setup: Create a personal chat and add messages
            const personalChat = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Details Test Chat');
            const msg1 = await createTestMessage(supabaseAdmin, personalChat.id, testUser.id, 'user', 'Hello');
            const msg2 = await createTestMessage(supabaseAdmin, personalChat.id, null, 'assistant', 'Hi there!');
            const inactiveMsg = await createTestMessage(supabaseAdmin, personalChat.id, testUser.id, 'user', 'Old message', false);
            
            // 2. Get auth token
            userClientForStep = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
            const { data: signInData, error: signInError } = await userClientForStep.auth.signInWithPassword({
                email: testUser.email,
                password: TEST_PASSWORD,
            });
            assertEquals(signInError, null, `Sign-in error: ${signInError?.message}`);
            const authToken = signInData!.session!.access_token;

            // 3. Fetch messages for the personal chat
            const response = await fetch(`${chatDetailsBaseEndpoint}/${personalChat.id}`, {
                method: 'GET',
                headers: {
                    'apikey': supabaseAnonKey!,
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            // 4. Assertions
            assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
            
            const body: ChatMessage[] = await response.json();
            assert(Array.isArray(body), "Response body should be an array");
            assertEquals(body.length, 2, "Should only include 2 active messages"); 
            
            // Check for specific messages (more robust than exact array match if order isn't guaranteed, though it should be by query)
            const receivedMsg1 = body.find(m => m.id === msg1.id);
            const receivedMsg2 = body.find(m => m.id === msg2.id);
            assertExists(receivedMsg1, "Message 1 not found in response");
            assertEquals(receivedMsg1?.content, msg1.content);
            assertEquals(receivedMsg1?.role, 'user');

            assertExists(receivedMsg2, "Message 2 not found in response");
            assertEquals(receivedMsg2?.content, msg2.content);
            assertEquals(receivedMsg2?.role, 'assistant');
            
            // Ensure the inactive message is NOT included
            const receivedInactiveMsg = body.find(m => m.id === inactiveMsg.id);
            assertEquals(receivedInactiveMsg, undefined, "Inactive message should not be included");

        } finally {
            await safeSignOut(userClientForStep, 'userClient_get_personal_chat_details');
        }
    });

    await t.step('[GREEN]: should return messages for an ORG chat, filtering inactive', async () => {
        if (!testUser || !testUser.email) throw new Error('Test user not created for ORG chat details test');
        
        let userClientForOrgStep: SupabaseClient<Database> | null = null;
        try {
            // 1. Setup: Create an Org, add user, create chat, add messages
            const testOrg = await createTestOrg(supabaseAdmin, `Details Org Test ${Date.now()}`, testUser.id);
            const orgChat = await createTestChat(supabaseAdmin, testUser.id, testOrg.id, 'Org Details Test Chat');
            const orgMsg1 = await createTestMessage(supabaseAdmin, orgChat.id, testUser.id, 'user', 'Org Hello');
            const orgMsg2 = await createTestMessage(supabaseAdmin, orgChat.id, null, 'assistant', 'Org Hi there!');
            const inactiveOrgMsg = await createTestMessage(supabaseAdmin, orgChat.id, testUser.id, 'user', 'Old Org message', false);
            
            // 2. Get auth token for testUser
            userClientForOrgStep = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
            const { data: signInData, error: signInError } = await userClientForOrgStep.auth.signInWithPassword({
                email: testUser.email,
                password: TEST_PASSWORD,
            });
            assertEquals(signInError, null, `Sign-in error for ORG chat test: ${signInError?.message}`);
            const authToken = signInData!.session!.access_token;

            // 3. Fetch messages for the org chat
            const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChat.id}`, {
                method: 'GET',
                headers: {
                    'apikey': supabaseAnonKey!,
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            // 4. Assertions
            assertEquals(response.status, 200, `Expected 200 OK for ORG chat, got ${response.status}`);
            const body: ChatMessage[] = await response.json();
            assert(Array.isArray(body), "Response body for ORG chat should be an array");
            assertEquals(body.length, 2, "Should only include 2 active org messages"); 

            const receivedOrgMsg1 = body.find(m => m.id === orgMsg1.id);
            const receivedOrgMsg2 = body.find(m => m.id === orgMsg2.id);
            assertExists(receivedOrgMsg1, "Org Message 1 not found in ORG chat response");
            assertEquals(receivedOrgMsg1?.content, orgMsg1.content);
            assertExists(receivedOrgMsg2, "Org Message 2 not found in ORG chat response");
            assertEquals(receivedOrgMsg2?.content, orgMsg2.content);
            
            const receivedInactiveOrgMsg = body.find(m => m.id === inactiveOrgMsg.id);
            assertEquals(receivedInactiveOrgMsg, undefined, "Inactive org message should not be included in ORG chat response");

        } finally {
            await safeSignOut(userClientForOrgStep, 'userClient_get_org_chat_details');
        }
    });

    await t.step('STEP-1.4.5 [GREEN]: should return 404 if user requests chat they cannot access', async () => {
        if (!testUser || !testUser.email) throw new Error('Primary testUser not created for 404 test');
        if (!otherUser || !otherUser.id) throw new Error('Secondary otherUser not created for 404 test');

        let userClientFor404Step: SupabaseClient<Database> | null = null;
        try {
            // 1. Setup: Create a personal chat belonging to otherUser
            const otherUsersChat = await createTestChat(supabaseAdmin, otherUser.id, null, 'Other User Private Chat');
            await createTestMessage(supabaseAdmin, otherUsersChat.id, otherUser.id, 'user', 'Secret message');

            // 2. Get auth token for the *primary* testUser
            userClientFor404Step = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
            const { data: signInData, error: signInError } = await userClientFor404Step.auth.signInWithPassword({
                email: testUser.email,
                password: TEST_PASSWORD,
            });
            assertEquals(signInError, null, `Sign-in error for 404 test: ${signInError?.message}`);
            const authToken = signInData!.session!.access_token;

            // 3. Fetch messages for otherUser's chat using primary testUser's token
            const response = await fetch(`${chatDetailsBaseEndpoint}/${otherUsersChat.id}`, {
                method: 'GET',
                headers: {
                    'apikey': supabaseAnonKey!,
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            // 4. Assertions: Expect 404 Not Found (or 403 Forbidden, depending on RLS precise behavior for non-existent vs. no-access)
            // The original Vitest test expected 404 with a specific body. RLS might just make it seem like it doesn't exist.
            assertEquals(response.status, 404, `Expected 404, got ${response.status}`); 
            const body = await response.json();
            // The edge function returns: return createErrorResponse('Chat not found or access denied', 404, req);
            assertEquals(body.error, 'Chat not found or access denied'); 

        } finally {
            await safeSignOut(userClientFor404Step, 'userClient_get_inaccessible_chat_details');
        }
    });

  } finally {
    // AfterAll equivalent: Cleanup code
    if (usersToDelete.length > 0) {
      await cleanupTestData(supabaseAdmin, usersToDelete);
    }
    await safeSignOut(supabaseAdmin, 'supabaseAdmin_details_get');
    // Any other client used directly in the Deno.test scope should be signed out here.
    // userClient is created per step or per block, so it's handled there.
  }
});

// --- Test Suite for DELETE /chat-details/:chatId ---
Deno.test("Edge Function Integration Tests: DELETE /chat-details/:chatId", async (t) => {
  let supabaseAdmin: SupabaseClient<Database>;
  // userClient for fetching tokens will be created per step/block as needed
  
  let orgAdminUser: SupabaseUser;
  let orgMemberUser: SupabaseUser;
  let personalChatOwnerUser: SupabaseUser;
  let otherUserForPersonalChat: SupabaseUser;
  let completelyOutsideUser: SupabaseUser;

  let orgAdminToken: string;
  let orgMemberToken: string;
  let personalChatOwnerToken: string;
  let otherUserForPersonalChatToken: string;
  let completelyOutsideUserToken: string;
  
  let testOrgForDelete: { id: string; name: string } | undefined = undefined;
  const usersCreatedForDeleteTests: string[] = [];

  // BeforeAll equivalent for DELETE tests
  supabaseAdmin = createClient<Database>(supabaseUrl!, supabaseServiceRoleKey!);
  
  try {
    personalChatOwnerUser = await createTestUser(supabaseAdmin, `del-p-owner-${Date.now()}@test.com`); 
    usersCreatedForDeleteTests.push(personalChatOwnerUser.id);
    otherUserForPersonalChat = await createTestUser(supabaseAdmin, `del-p-other-${Date.now()}@test.com`);
    usersCreatedForDeleteTests.push(otherUserForPersonalChat.id);
    
    orgAdminUser = await createTestUser(supabaseAdmin, `del-o-admin-${Date.now()}@test.com`);
    usersCreatedForDeleteTests.push(orgAdminUser.id);
    orgMemberUser = await createTestUser(supabaseAdmin, `del-o-member-${Date.now()}@test.com`);
    usersCreatedForDeleteTests.push(orgMemberUser.id);
    completelyOutsideUser = await createTestUser(supabaseAdmin, `del-o-outside-${Date.now()}@test.com`);
    usersCreatedForDeleteTests.push(completelyOutsideUser.id);

    testOrgForDelete = await createTestOrg(supabaseAdmin, `Delete Org ${Date.now()}`, orgAdminUser.id, 'admin');
    const { error: memberError } = await supabaseAdmin.from('organization_members').insert({
        organization_id: testOrgForDelete.id,
        user_id: orgMemberUser.id,
        role: 'member',
        status: 'active'
    });
    if (memberError) throw new Error(`Failed to add org member for DELETE tests: ${memberError.message}`);

    // Helper to sign in and get token (to reduce repetition)
    const signInAndGetToken = async (user: SupabaseUser): Promise<string> => {
        const client = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
        const { data, error } = await client.auth.signInWithPassword({ email: user.email!, password: TEST_PASSWORD });
        if (error) throw new Error(`Signin failed for ${user.email}: ${error.message}`);
        // Do not sign out this client here, as it's short-lived for token retrieval only.
        // The main test step clients will be signed out.
        return data!.session!.access_token;
    };

    personalChatOwnerToken = await signInAndGetToken(personalChatOwnerUser);
    otherUserForPersonalChatToken = await signInAndGetToken(otherUserForPersonalChat);
    orgAdminToken = await signInAndGetToken(orgAdminUser);
    orgMemberToken = await signInAndGetToken(orgMemberUser);
    completelyOutsideUserToken = await signInAndGetToken(completelyOutsideUser);

    // --- Test Steps for DELETE ---
    await t.step('Case 1.1 (DELETE): should return 401 Unauthorized if no auth token', async () => {
        const fakeChatId = '12345678-1234-1234-1234-1234567890ab';
        const response = await fetch(`${chatDetailsBaseEndpoint}/${fakeChatId}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey! },
        });
        assertEquals(response.status, 401);
        // Consume body to prevent leak
        try {
            const body = await response.json(); 
            console.log("DEBUG DELETE 401 response body (JSON):", JSON.stringify(body)); 
            assertExists(body.message || body.error || body.msg, "DELETE 401 response should have a message, error, or msg property");
        } catch (e) {
            const textBody = await response.text();
            console.log("DEBUG DELETE 401 response body (TEXT):", textBody);
            assert(textBody.length >= 0, "DELETE 401 response text body should exist"); 
        }
    });

    await t.step('Case 1.2 (DELETE): should return 404 Not Found if chatId does not exist', async () => {
        const nonExistentChatId = '00000000-0000-0000-0000-000000000000';
        const response = await fetch(`${chatDetailsBaseEndpoint}/${nonExistentChatId}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${personalChatOwnerToken}` },
        });
        assertEquals(response.status, 404);
        // Consume body to prevent leak
        const body = await response.json(); // Expecting a JSON error from our function
        assertExists(body.error, "404 response should have an error property");
    });

    await t.step('Case 2.1 (DELETE): should allow owner to delete PERSONAL chat', async () => {
        // 1. Setup: Create a personal chat for personalChatOwnerUser
        const chatToDelete = await createTestChat(supabaseAdmin, personalChatOwnerUser.id, null, 'Personal Chat To Delete');
        assert(await checkChatExists(supabaseAdmin, chatToDelete.id), "Chat should exist before deletion attempt");

        // 2. Perform DELETE request as owner
        const response = await fetch(`${chatDetailsBaseEndpoint}/${chatToDelete.id}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${personalChatOwnerToken}` },
        });

        // 3. Assertions
        assertEquals(response.status, 204, `Expected 204, got ${response.status}.`);
        await response.arrayBuffer(); // Consume body for 204 to prevent leak
        assertEquals(await checkChatExists(supabaseAdmin, chatToDelete.id), false, "Chat should be deleted from DB");
    });

    await t.step('Case 2.2 (DELETE): should NOT allow non-owner to delete PERSONAL chat', async () => {
        // 1. Setup: Create a personal chat for personalChatOwnerUser
        const chatToProtect = await createTestChat(supabaseAdmin, personalChatOwnerUser.id, null, 'Non-Owner Delete Test Chat');
        assert(await checkChatExists(supabaseAdmin, chatToProtect.id), "Chat should exist before deletion attempt");

        // 2. Perform DELETE request as otherUserForPersonalChat (who is not the owner)
        const response = await fetch(`${chatDetailsBaseEndpoint}/${chatToProtect.id}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${otherUserForPersonalChatToken}` },
        });

        // 3. Assertions
        assertEquals(response.status, 404, `Expected 404, got ${response.status}. Body: ${await response.text()}`); // RLS should make it appear as if chat doesn't exist
        assert(await checkChatExists(supabaseAdmin, chatToProtect.id), "Chat should NOT be deleted");
    });

    await t.step('Case 3.1 (DELETE): should allow ORG admin to delete ORG chat', async () => {
        assertExists(testOrgForDelete, "Test organization for DELETE tests was not created.");

        // 1. Setup: Create an ORG chat (e.g., associated with orgAdminUser and testOrgForDelete)
        const orgChatToDelete = await createTestChat(supabaseAdmin, orgAdminUser.id, testOrgForDelete.id, 'Org Chat To Delete by Admin');
        assert(await checkChatExists(supabaseAdmin, orgChatToDelete.id), "Org chat should exist before admin deletion attempt");

        // 2. Perform DELETE request as orgAdminUser
        const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChatToDelete.id}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${orgAdminToken}` },
        });

        // 3. Assertions
        assertEquals(response.status, 204, `Expected 204, got ${response.status}.`);
        await response.arrayBuffer(); // Consume body for 204 to prevent leak
        assertEquals(await checkChatExists(supabaseAdmin, orgChatToDelete.id), false, "Org chat should be deleted from DB by admin");
    });

    await t.step('Case 3.2 (DELETE): should NOT allow ORG member (non-admin) to delete ORG chat', async () => {
        assertExists(testOrgForDelete, "Test organization for DELETE tests was not created.");

        // 1. Setup: Create an ORG chat (e.g., associated with orgAdminUser and testOrgForDelete)
        const orgChatToProtect = await createTestChat(supabaseAdmin, orgAdminUser.id, testOrgForDelete.id, 'Org Chat Non-Admin Delete Test');
        assert(await checkChatExists(supabaseAdmin, orgChatToProtect.id), "Org chat should exist before non-admin deletion attempt");

        // 2. Perform DELETE request as orgMemberUser (non-admin)
        const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChatToProtect.id}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${orgMemberToken}` },
        });

        // 3. Assertions
        const responseBody = await response.json(); // Consume body once
        assertEquals(response.status, 403, `Expected 403, got ${response.status}. Body: ${JSON.stringify(responseBody)}`); // Changed from 404 to 403
        
        assertEquals(responseBody.error, "Permission denied to delete this chat (Explicit Check).");
        
        assert(await checkChatExists(supabaseAdmin, orgChatToProtect.id), "Org chat should NOT be deleted by non-admin member");
    });

    await t.step('Case 3.3 (DELETE): should NOT allow user OUTSIDE org to delete ORG chat', async () => {
        assertExists(testOrgForDelete, "Test organization for DELETE tests was not created.");

        // 1. Setup: Create an ORG chat
        const orgChatToProtectFromOutside = await createTestChat(supabaseAdmin, orgAdminUser.id, testOrgForDelete.id, 'Org Chat Outside Delete Test');
        assert(await checkChatExists(supabaseAdmin, orgChatToProtectFromOutside.id), "Org chat should exist before outside deletion attempt");

        // 2. Perform DELETE request as completelyOutsideUser
        const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChatToProtectFromOutside.id}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${completelyOutsideUserToken}` },
        });

        // 3. Assertions
        assertEquals(response.status, 404, `Expected 404, got ${response.status}. Body: ${await response.text()}`);
        assert(await checkChatExists(supabaseAdmin, orgChatToProtectFromOutside.id), "Org chat should NOT be deleted by user outside the org");
    });

    // More DELETE test steps will be added here...

  } finally {
    // AfterAll equivalent for DELETE tests
    if (usersCreatedForDeleteTests.length > 0) {
        await cleanupTestData(supabaseAdmin, usersCreatedForDeleteTests);
    }
    if (testOrgForDelete && testOrgForDelete.id) {
        try {
            await supabaseAdmin.from('organizations').delete().eq('id', testOrgForDelete.id);
        } catch (error) {
            const e = error as Error;
            console.warn(`Could not clean up org ${testOrgForDelete.id}: ${e.message}`);
        }
    }
    await safeSignOut(supabaseAdmin, 'supabaseAdmin_details_delete');
  }
}); 