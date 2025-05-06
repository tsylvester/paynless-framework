// supabase/functions/chat-details/test/chat-details.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
// Import User type from gotrue-js
import { SupabaseClient, createClient, User } from '@supabase/supabase-js';
import type { Database } from '../../../functions/types_db.ts'; // Adjust path as needed

// Use the generated type for chat messages
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
// Use the generated type for chats
type Chat = Database['public']['Tables']['chats']['Row'];

// --- Test Configuration ---
const TEST_PASSWORD = 'password'; // <<< Add constant for password
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Essential Supabase environment variables are missing for integration tests.');
}

const functionsUrl = `${supabaseUrl}/functions/v1`;
// Base endpoint for chat details - specific chat ID will be appended
const chatDetailsBaseEndpoint = `${functionsUrl}/chat-details`;

// --- Helper Functions (Adapted from chat-history tests) ---
// Use Database type for better type safety
async function createTestUser(adminClient: SupabaseClient<Database>, email: string, password = TEST_PASSWORD): Promise<User> {
  // Cast to any to bypass linter error for admin methods
  const { data, error } = await (adminClient.auth as any).admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm user for testing
  });
  if (error) throw new Error(`Failed to create test user ${email}: ${error.message}`);
  if (!data.user) throw new Error('Failed to create test user: No user data returned.');
  await new Promise(resolve => setTimeout(resolve, 500)); // Wait for profile trigger
  return data.user;
}

// Function to create a test organization and add the owner as specified member
async function createTestOrg(adminClient: SupabaseClient<Database>, name: string, ownerId: string, role: 'admin' | 'member' = 'admin'): Promise<{ id: string; name: string }> {
    const { data: orgData, error: orgError } = await adminClient.from('organizations').insert({ name: name }).select('id, name').single();
    if (orgError) throw new Error(`Failed to create test org "${name}": ${orgError.message}`);
    if (!orgData) throw new Error('Failed to create test org: No data returned.');
    console.log(`Created organization: ${orgData.id} (${orgData.name})`);
    // Use the provided role
    const { error: memberError } = await adminClient.from('organization_members').insert({ organization_id: orgData.id, user_id: ownerId, role: role, status: 'active' }); 
    if (memberError) {
        await adminClient.from('organizations').delete().eq('id', orgData.id);
        throw new Error(`Failed to add owner ${ownerId} to org ${orgData.id} with role ${role}: ${memberError.message}`);
    }
    console.log(`Added owner ${ownerId} as ${role} to organization: ${orgData.id}`);
    await new Promise(resolve => setTimeout(resolve, 200)); 
    return orgData;
}

// Function to create a test chat
async function createTestChat(adminClient: SupabaseClient<Database>, userId: string | null, orgId: string | null, title: string): Promise<{id: string; title: string}> {
    const { data, error } = await adminClient.from('chats').insert({ user_id: userId, organization_id: orgId, title: title }).select('id, title').single();
    if (error) throw new Error(`Failed to create test chat "${title}": ${error.message}`);
    if (!data) throw new Error('Failed to create test chat: No data returned.');
    if (data.title === null) {
        throw new Error('createTestChat query returned a null title, which is not expected by its return type.');
    }
    return data as {id: string; title: string};
}

// *** NEW HELPER *** Function to create a test chat message
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
     
     return data as ChatMessage; // Cast assuming returned data matches interface
}

// *** NEW HELPER *** Function to check if a chat exists
async function checkChatExists(adminClient: SupabaseClient<Database>, chatId: string): Promise<boolean> {
    const { data, error } = await adminClient
        .from('chats')
        .select('id')
        .eq('id', chatId)
        .maybeSingle();
    if (error) {
        console.error(`Error checking if chat ${chatId} exists:`, error);
        return false; // Treat error as non-existent for safety, or re-throw
    }
    return !!data;
}

// Function to clean up test data
async function cleanupTestData(adminClient: SupabaseClient<Database>, usersToDelete: string[]) {
  console.warn('cleanupTestData: Deleting users...');
  for (const userId of usersToDelete) {
     console.log(`Attempting to delete user: ${userId}`);
     const { error } = await (adminClient.auth as any).admin.deleteUser(userId, true); // Use true to bypass soft delete if needed
     if (error && !error.message.includes('User not found')) { // Ignore error if user already deleted
       console.error(`Failed to delete user ${userId}:`, error.message);
     } else if (!error) {
       console.log(`Successfully deleted user: ${userId}`);
     }
  }
}

// Definition for getChatMessagesByChatId
async function getChatMessagesByChatId(adminClient: SupabaseClient<Database>, chatId: string): Promise<ChatMessage[]> {
    const { data, error } = await adminClient
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
    if (error) {
        console.error(`Error fetching messages for chat ${chatId}:`, error);
        return [];
    }
    return data || [];
}

// --- Test Suite ---
describe('Edge Function Integration Tests: GET /chat-details/:chatId', () => {
  let supabaseAdmin: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  let testUser: User | null = null;
  let otherUser: User | null = null;
  const usersToDelete: string[] = [];

  beforeAll(async () => {
    supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
    userClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    try {
      const userEmail = `test-user-details-${Date.now()}@integration.test`;
      testUser = await createTestUser(supabaseAdmin, userEmail);
      usersToDelete.push(testUser.id);
      console.log('Created primary test user:', testUser.id);

      const otherUserEmail = `other-user-details-${Date.now()}@integration.test`;
      otherUser = await createTestUser(supabaseAdmin, otherUserEmail);
      usersToDelete.push(otherUser.id);
      console.log('Created secondary test user:', otherUser.id);

    } catch (error) { 
      console.error("Error during chat-details test setup (creating user):", error);
      throw error;
    }
  });

  afterAll(async () => {
    if (usersToDelete.length > 0) {
      await cleanupTestData(supabaseAdmin, usersToDelete);
    }
  });

  it('STEP-1.4.5 [RED]: should return 401 Unauthorized if no auth token is provided', async () => {
    const fakeChatId = '00000000-0000-0000-0000-000000000000'; // Use a placeholder
    const response = await fetch(`${chatDetailsBaseEndpoint}/${fakeChatId}`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
      },
    });
    // Expect 401 - behavior might depend on proxy (msg vs error)
    expect(response.status).toBe(401);
    // Add body check if needed, similar to chat-history tests
    // const body = await response.json();
    // expect(body.msg || body.error).toBeDefined();
  });

  it('STEP-1.4.5 [RED]: should return messages for a personal chat', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created');
    
    // 1. Setup: Create a personal chat and add messages
    const personalChat = await createTestChat(supabaseAdmin, testUser.id, null, 'Personal Details Test Chat');
    const msg1 = await createTestMessage(supabaseAdmin, personalChat.id, testUser.id, 'user', 'Hello');
    const msg2 = await createTestMessage(supabaseAdmin, personalChat.id, null, 'assistant', 'Hi there!');
    const inactiveMsg = await createTestMessage(supabaseAdmin, personalChat.id, testUser.id, 'user', 'Old message', false);
    
    // 2. Get auth token
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
      email: testUser.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const authToken = signInData!.session!.access_token;

    // 3. Fetch messages for the personal chat
    const response = await fetch(`${chatDetailsBaseEndpoint}/${personalChat.id}`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    // 4. Assertions (EXPECTED TO FAIL INITIALLY - RED)
    // Expect 200 OK status
    expect(response.status).toBe(200);
    
    // Expect body to be an array containing the *active* messages
    const body: ChatMessage[] = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2); // Should only include msg1 and msg2
    expect(body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: msg1.id, content: msg1.content, role: 'user' }),
      expect.objectContaining({ id: msg2.id, content: msg2.content, role: 'assistant' }),
    ]));
    // Ensure the inactive message is NOT included
    expect(body).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: inactiveMsg.id })
    ]));
  });

  it('[GREEN]: should return messages for an ORG chat, filtering inactive', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created');
    
    // 1. Setup: Create an Org, add user, create chat, add messages
    const testOrg = await createTestOrg(supabaseAdmin, `Details Org Test ${Date.now()}`, testUser.id);
    const orgChat = await createTestChat(supabaseAdmin, testUser.id, testOrg.id, 'Org Details Test Chat');
    const orgMsg1 = await createTestMessage(supabaseAdmin, orgChat.id, testUser.id, 'user', 'Org Hello');
    const orgMsg2 = await createTestMessage(supabaseAdmin, orgChat.id, null, 'assistant', 'Org Hi there!');
    const inactiveOrgMsg = await createTestMessage(supabaseAdmin, orgChat.id, testUser.id, 'user', 'Old Org message', false);
    
    // 2. Get auth token
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
      email: testUser.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const authToken = signInData!.session!.access_token;

    // 3. Fetch messages for the org chat (No organizationId needed in URL for chat-details, RLS handles access)
    const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChat.id}`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    // 4. Assertions
    expect(response.status).toBe(200);
    const body: ChatMessage[] = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2); // Should only include orgMsg1 and orgMsg2
    expect(body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: orgMsg1.id, content: orgMsg1.content }),
      expect.objectContaining({ id: orgMsg2.id, content: orgMsg2.content }),
    ]));
    // Ensure the inactive message is NOT included
    expect(body).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: inactiveOrgMsg.id })
    ]));
  });

  it('STEP-1.4.5 [GREEN]: should return 404 if user requests chat they cannot access', async () => {
    if (!testUser || !testUser.email) throw new Error('Primary test user not created');
    if (!otherUser) throw new Error('Secondary test user not created');

    // 1. Setup: Create a personal chat belonging to otherUser
    const otherUsersChat = await createTestChat(supabaseAdmin, otherUser.id, null, 'Other User Private Chat');
    await createTestMessage(supabaseAdmin, otherUsersChat.id, otherUser.id, 'user', 'Secret message');

    // 2. Get auth token for the *primary* testUser
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
      email: testUser.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const authToken = signInData!.session!.access_token;

    // 3. Fetch messages for otherUser's chat using primary testUser's token
    const response = await fetch(`${chatDetailsBaseEndpoint}/${otherUsersChat.id}`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    // 4. Assertions: Expect 404 Not Found
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Chat not found or access denied');
  });

  // --- Add more tests for org chats, permissions, etc. later ---

}); 

describe('Edge Function Integration Tests: DELETE /chat-details/:chatId', () => {
  let supabaseAdmin: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  let testUser: User | null = null;
  let otherUser: User | null = null;
  const usersToDelete: string[] = [];

  let orgAdminUser: User;
  let orgMemberUser: User;
  let personalChatOwnerUser: User;
  let otherUserForPersonalChat: User;
  let completelyOutsideUser: User;

  let orgAdminToken: string;
  let orgMemberToken: string;
  let personalChatOwnerToken: string;
  let otherUserForPersonalChatToken: string;
  let completelyOutsideUserToken: string;
  
  let testOrgForDelete: { id: string; name: string };
  const usersCreatedForDeleteTests: string[] = [];

  beforeAll(async () => {
    supabaseAdmin = createClient<Database>(supabaseUrl!, supabaseServiceRoleKey!); // Add ! for non-null assertion if confident they are set by dotenv
    userClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!); // Add ! for non-null assertion

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

    const personalOwnerSignIn = await userClient.auth.signInWithPassword({ email: personalChatOwnerUser.email!, password: TEST_PASSWORD });
    if (personalOwnerSignIn.error) throw new Error(`Signin failed for personalChatOwnerUser: ${personalOwnerSignIn.error.message}`);
    personalChatOwnerToken = personalOwnerSignIn.data!.session!.access_token;

    const otherPersonalSignIn = await userClient.auth.signInWithPassword({ email: otherUserForPersonalChat.email!, password: TEST_PASSWORD });
    if (otherPersonalSignIn.error) throw new Error(`Signin failed for otherUserForPersonalChat: ${otherPersonalSignIn.error.message}`);
    otherUserForPersonalChatToken = otherPersonalSignIn.data!.session!.access_token;

    const adminSignIn = await userClient.auth.signInWithPassword({ email: orgAdminUser.email!, password: TEST_PASSWORD });
    if (adminSignIn.error) throw new Error(`Signin failed for orgAdminUser: ${adminSignIn.error.message}`);
    orgAdminToken = adminSignIn.data!.session!.access_token;

    const memberSignIn = await userClient.auth.signInWithPassword({ email: orgMemberUser.email!, password: TEST_PASSWORD });
    if (memberSignIn.error) throw new Error(`Signin failed for orgMemberUser: ${memberSignIn.error.message}`);
    orgMemberToken = memberSignIn.data!.session!.access_token;

    const outsideSignIn = await userClient.auth.signInWithPassword({ email: completelyOutsideUser.email!, password: TEST_PASSWORD });
    if (outsideSignIn.error) throw new Error(`Signin failed for completelyOutsideUser: ${outsideSignIn.error.message}`);
    completelyOutsideUserToken = outsideSignIn.data!.session!.access_token;
  });

  afterAll(async () => {
    if (usersCreatedForDeleteTests.length > 0) {
      await cleanupTestData(supabaseAdmin, usersCreatedForDeleteTests);
    }
    if (testOrgForDelete && testOrgForDelete.id) {
        // Attempt to delete the org, handle error if it fails (e.g., if already deleted via cascade)
        try {
            await supabaseAdmin.from('organizations').delete().eq('id', testOrgForDelete.id);
        } catch (error) {
            console.warn(`Could not clean up org ${testOrgForDelete.id}: ${(error as Error).message}`);
        }
    }
  });

  it('Case 1.1: should return 401 Unauthorized if no auth token is provided', async () => {
    const fakeChatId = '12345678-1234-1234-1234-1234567890ab';
    const response = await fetch(`${chatDetailsBaseEndpoint}/${fakeChatId}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseAnonKey! }, // Add ! for non-null assertion
    });
    expect(response.status).toBe(401);
  });

  it('Case 1.2: should return 404 Not Found if chatId does not exist (authenticated)', async () => {
    const nonExistentChatId = '00000000-0000-0000-0000-000000000000';
    const response = await fetch(`${chatDetailsBaseEndpoint}/${nonExistentChatId}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${personalChatOwnerToken}` }, // Add ! for non-null assertion
    });
    expect(response.status).toBe(404);
  });
  
  // Case 1.3 for invalid UUID can be added if specific handling is expected beyond Supabase's default.

  describe('Personal Chat Deletion', () => {
    let personalChatIdToDelete: string;

    beforeEach(async () => {
      const chat = await createTestChat(supabaseAdmin, personalChatOwnerUser.id, null, 'Personal Chat for Deletion');
      personalChatIdToDelete = chat.id;
      await createTestMessage(supabaseAdmin, personalChatIdToDelete, personalChatOwnerUser.id, 'user', 'Msg in personal chat');
    });

    it('Case 2.1 (Owner): should allow owner to delete their personal chat', async () => {
      const response = await fetch(`${chatDetailsBaseEndpoint}/${personalChatIdToDelete}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${personalChatOwnerToken}` }, // Add ! for non-null assertion
      });
      expect(response.status).toBe(204); // Standard for successful DELETE with no content back

      const chatExists = await checkChatExists(supabaseAdmin, personalChatIdToDelete);
      expect(chatExists).toBe(false);
      const messages = await getChatMessagesByChatId(supabaseAdmin, personalChatIdToDelete);
      expect(messages).toHaveLength(0);
    });

    it('Case 2.2 (Non-Owner): should prevent non-owner from deleting a personal chat', async () => {
      const response = await fetch(`${chatDetailsBaseEndpoint}/${personalChatIdToDelete}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${otherUserForPersonalChatToken}` }, // Add ! for non-null assertion
      });
      expect([403, 404]).toContain(response.status); // RLS should result in 404 or 403

      const chatExists = await checkChatExists(supabaseAdmin, personalChatIdToDelete);
      expect(chatExists).toBe(true);
    });
  });

  describe('Organization Chat Deletion', () => {
    let orgChatIdToDelete: string;

    beforeEach(async () => {
      const chat = await createTestChat(supabaseAdmin, orgAdminUser.id, testOrgForDelete.id, 'Org Chat for Deletion');
      orgChatIdToDelete = chat.id;
      await createTestMessage(supabaseAdmin, orgChatIdToDelete, orgAdminUser.id, 'user', 'Msg in org chat');
    });

    it('Case 3.1 (Org Admin): should allow org admin to delete an org chat', async () => {
      const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChatIdToDelete}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${orgAdminToken}` }, // Add ! for non-null assertion
      });
      expect(response.status).toBe(204);

      const chatExists = await checkChatExists(supabaseAdmin, orgChatIdToDelete);
      expect(chatExists).toBe(false);
      const messages = await getChatMessagesByChatId(supabaseAdmin, orgChatIdToDelete);
      expect(messages).toHaveLength(0);
    });

    it('Case 3.2 (Org Member, Non-Admin): should prevent org member (non-admin) from deleting an org chat', async () => {
      const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChatIdToDelete}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${orgMemberToken}` }, // Add ! for non-null assertion
      });
      expect([403, 404]).toContain(response.status);

      const chatExists = await checkChatExists(supabaseAdmin, orgChatIdToDelete);
      expect(chatExists).toBe(true);
    });
    
    it('Case 3.3 (User Not in Org): should prevent user not in org from deleting an org chat', async () => {
        const response = await fetch(`${chatDetailsBaseEndpoint}/${orgChatIdToDelete}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseAnonKey!, 'Authorization': `Bearer ${completelyOutsideUserToken}` }, // Add ! for non-null assertion
          });
          expect([403, 404]).toContain(response.status);
    
          const chatExists = await checkChatExists(supabaseAdmin, orgChatIdToDelete);
          expect(chatExists).toBe(true);
    });
    
    // Case 3.4 (Org Admin from different Org) can be added if more granular testing between orgs is needed.
    // It would involve setting up another org and another admin user for that org.
  });
}); 