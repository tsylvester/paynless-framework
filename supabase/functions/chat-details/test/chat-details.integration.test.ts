// supabase/functions/chat-details/test/chat-details.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// Import User type from gotrue-js
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/gotrue-js'; 
// Load environment variables from .env file at the root
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../../../.env' }); // Adjust path relative to this file
import type { Database } from '../../../functions/types_db.ts'; // Adjust path as needed

// Use the generated type for chat messages
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

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

// Function to create a test organization and add the owner as admin member
async function createTestOrg(adminClient: SupabaseClient<Database>, name: string, ownerId: string): Promise<{ id: string; name: string }> {
    const { data: orgData, error: orgError } = await adminClient.from('organizations').insert({ name: name }).select('id, name').single();
    if (orgError) throw new Error(`Failed to create test org "${name}": ${orgError.message}`);
    if (!orgData) throw new Error('Failed to create test org: No data returned.');
    console.log(`Created organization: ${orgData.id} (${orgData.name})`);
    const { error: memberError } = await adminClient.from('organization_members').insert({ organization_id: orgData.id, user_id: ownerId, role: 'admin', status: 'active' });
    if (memberError) {
        await adminClient.from('organizations').delete().eq('id', orgData.id);
        throw new Error(`Failed to add owner ${ownerId} to org ${orgData.id}: ${memberError.message}`);
    }
    console.log(`Added owner ${ownerId} as admin to organization: ${orgData.id}`);
    await new Promise(resolve => setTimeout(resolve, 200)); 
    return orgData;
}

// Function to create a test chat
async function createTestChat(adminClient: SupabaseClient<Database>, userId: string | null, orgId: string | null, title: string): Promise<{id: string; title: string}> {
    const { data, error } = await adminClient.from('chats').insert({ user_id: userId, organization_id: orgId, title: title }).select('id, title').single();
    if (error) throw new Error(`Failed to create test chat "${title}": ${error.message}`);
    if (!data) throw new Error('Failed to create test chat: No data returned.');
    return data;
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