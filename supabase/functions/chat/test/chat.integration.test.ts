import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { User as SupabaseUser } from '@supabase/gotrue-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../../../.env' });
import type { Database } from '../../../functions/types_db.ts'; // Adjust path as needed
import { mainHandler, type ChatHandlerDeps, getDefaultDeps } from '../index.ts';
import type { AiProviderAdapter, AdapterResponsePayload } from '../../_shared/types.ts';
// Remove import of createMockAdapter
// import { createMockAdapter } from '../index.test.ts'; 

// --- Database Types ---
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
type Chat = Database['public']['Tables']['chats']['Row'];
type Organization = Database['public']['Tables']['organizations']['Row']; // Needed for helper

// --- Test Configuration ---
const TEST_PASSWORD = 'password'; 
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Essential Supabase environment variables are missing for integration tests.');
}

// Base URL for constructing Request objects if needed, though only origin/path matters usually
const testBaseUrl = 'http://localhost:54323'; 

// --- Mock AI Adapter ---
// REMOVED vi.mock block

// --- NEW: Add createMockAdapter helper locally --- 
// Helper to create a mock AiProviderAdapter
const createMockAdapter = (sendMessageResult: AdapterResponsePayload | Error): AiProviderAdapter => {
    // Use vi.fn for Vitest spies
    const mockSendMessage = sendMessageResult instanceof Error 
        ? vi.fn(() => Promise.reject(sendMessageResult)) 
        : vi.fn(() => Promise.resolve(sendMessageResult));

    return {
        sendMessage: mockSendMessage,
        // listModels: vi.fn(() => Promise.resolve([])), // Add if needed
    } as unknown as AiProviderAdapter; // Cast needed as we might not implement all methods
};

// --- Helper Functions (Adapted from chat-details tests) ---
async function createTestUser(adminClient: SupabaseClient<Database>, email: string, password = TEST_PASSWORD): Promise<SupabaseUser> {
  const { data, error } = await (adminClient.auth as any).admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create test user ${email}: ${error.message}`);
  if (!data.user) throw new Error('Failed to create test user: No user data returned.');
  await new Promise(resolve => setTimeout(resolve, 500)); 
  return data.user as SupabaseUser;
}

async function createTestOrg(adminClient: SupabaseClient<Database>, name: string, ownerId: string, role: 'admin' | 'member' = 'admin'): Promise<{ id: string; name: string }> {
    const { data: orgData, error: orgError } = await adminClient.from('organizations').insert({ name: name }).select('id, name').single();
    if (orgError) throw new Error(`Failed to create test org "${name}": ${orgError.message}`);
    if (!orgData) throw new Error('Failed to create test org: No data returned.');
    console.log(`Created organization: ${orgData.id} (${orgData.name})`);
    const { error: memberError } = await adminClient.from('organization_members').insert({ organization_id: orgData.id, user_id: ownerId, role: role, status: 'active' }); 
    if (memberError) {
        await adminClient.from('organizations').delete().eq('id', orgData.id);
        throw new Error(`Failed to add owner ${ownerId} to org ${orgData.id} with role ${role}: ${memberError.message}`);
    }
    console.log(`Added owner ${ownerId} as ${role} to organization: ${orgData.id}`);
    await new Promise(resolve => setTimeout(resolve, 200)); 
    return orgData;
}

// Helper to toggle org chat creation permission
async function setOrgMemberChatCreation(adminClient: SupabaseClient<Database>, orgId: string, allow: boolean): Promise<void> {
    const { error } = await adminClient
        .from('organizations')
        .update({ allow_member_chat_creation: allow })
        .eq('id', orgId);
    if (error) {
        throw new Error(`Failed to set allow_member_chat_creation for org ${orgId}: ${error.message}`);
    }
    console.log(`Set allow_member_chat_creation=${allow} for org ${orgId}`);
}

// Helper to get chat details by ID
async function getChatById(adminClient: SupabaseClient<Database>, chatId: string): Promise<Chat | null> {
    const { data, error } = await adminClient
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .maybeSingle();
    if (error) {
        console.error(`Error fetching chat ${chatId}:`, error);
        return null;
    }
    return data;
}

// Helper to get messages for a chat
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

async function cleanupTestData(adminClient: SupabaseClient<Database>, usersToDelete: string[]) {
  console.warn('cleanupTestData: Deleting users...');
  for (const userId of usersToDelete) {
     console.log(`Attempting to delete user: ${userId}`);
     const { error } = await (adminClient.auth as any).admin.deleteUser(userId, true); 
     if (error && !error.message.includes('User not found')) { 
       console.error(`Failed to delete user ${userId}:`, error.message);
     } else if (!error) {
       console.log(`Successfully deleted user: ${userId}`);
     }
  }
}

// --- Test Suite ---
describe('Edge Function Integration Tests: POST /chat (using DI)', () => {
  let supabaseAdmin: SupabaseClient<Database>;
  let testUser: SupabaseUser | null = null;
  const usersToDelete: string[] = [];
  const dummyProviderId = '11111111-1111-1111-1111-111111111111'; 
  const dummyPromptId = '22222222-2222-2222-2222-222222222222';   

  beforeAll(async () => {
    supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
    try {
      const userEmail = `test-user-chat-di-${Date.now()}@integration.test`;
      testUser = await createTestUser(supabaseAdmin, userEmail);
      usersToDelete.push(testUser.id);
      console.log('Created primary test user for /chat DI:', testUser.id);

      // <<< Ensure dummy provider and prompt exist (still needed for DB lookups) >>>
      const { error: providerUpsertError } = await supabaseAdmin
        .from('ai_providers')
        .upsert({ id: dummyProviderId, name: 'Dummy Test Provider', provider: 'openai', api_identifier: 'gpt-dummy', is_active: true });
      if (providerUpsertError) throw providerUpsertError;
      console.log(`Ensured dummy AI provider exists: ${dummyProviderId}`);

      const { error: promptUpsertError } = await supabaseAdmin
        .from('system_prompts')
        .upsert({ id: dummyPromptId, name: 'Dummy Test Prompt', prompt_text: 'You are a dummy assistant.', is_active: true });
       if (promptUpsertError) throw promptUpsertError;
       console.log(`Ensured dummy system prompt exists: ${dummyPromptId}`);
    } catch (error) { 
      console.error("Error during /chat DI test setup:", error);
      throw error;
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks(); // Clean up mocks
    if (usersToDelete.length > 0) {
      await cleanupTestData(supabaseAdmin, usersToDelete);
    }
  });

  // --- Test Cases ---

  it('[POST /chat] should create a new PERSONAL chat and first messages', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created');
    
    // 1. Get auth token
    // We still need the anon client to sign in the user initially
    const anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    const { data: signInData, error: signInError } = await (anonClient.auth as any).signInWithPassword({ email: testUser.email, password: TEST_PASSWORD });
    expect(signInError).toBeNull();
    const authToken = signInData!.session!.access_token;

    // 2. Define request body
    const requestBody = {
        message: 'Hello DI test, create a personal chat',
        providerId: dummyProviderId, 
        promptId: dummyPromptId 
    };

    // 3. Configure Mock AI Response & Create Mock Adapter
    const mockAssistantContent = "Okay, personal chat created via DI.";
    const mockResponsePayload: AdapterResponsePayload = {
        role: 'assistant',
        content: mockAssistantContent,
        ai_provider_id: dummyProviderId,
        system_prompt_id: dummyPromptId,
        token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    };
    // Create the mock adapter instance using the helper
    const mockAdapter = createMockAdapter(mockResponsePayload);
    // Get the spy instance from the created adapter
    const mockSendMessageSpy = mockAdapter.sendMessage as vi.SpiedFunction<any>; // Cast to Vitest spy type

    // 4. Create Mock Request Object
    const mockRequest = new Request(`${testBaseUrl}/chat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    // 5. Create Test Dependencies WITH Mock Factory
    // Define a factory function that returns the specific mock adapter instance
    const mockGetAiProviderAdapter = vi.fn().mockReturnValue(mockAdapter);

    // Get the base default dependencies, then override/mock what's needed for the test
    const baseDeps = getDefaultDeps(); // Call the function to get base deps

    const testDeps: ChatHandlerDeps = {
        ...baseDeps, // Spread actual implementations first
        createSupabaseClient: vi.fn().mockImplementation((url: string, key: string, options: any) => {
             const headers = options?.global?.headers ?? {};
             return createClient<Database>(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { 
                 global: { headers: { ...headers, Authorization: `Bearer ${authToken}` } } 
             });
        }),
        getAiProviderAdapter: mockGetAiProviderAdapter, 
        supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
        supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
        openaiApiKey: process.env.OPENAI_API_KEY || 'dummy-test-openai-key', 
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || 'dummy-test-anthropic-key',
        googleApiKey: process.env.GOOGLE_API_KEY || 'dummy-test-google-key',
    };

    // 6. Call the main handler directly
    const response = await mainHandler(mockRequest, testDeps);

    // 7. Assertions (Expecting 200 OK)
    expect(response.status).toBe(200); 
    const body = await response.json();
    
    // Check response structure (should contain assistant message)
    expect(body).not.toHaveProperty('chatId'); // Chat ID is not returned in the success response body anymore
    expect(body).toHaveProperty('message');
    const assistantMessage = body.message;
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.content).toBe(mockAssistantContent);
    expect(assistantMessage.ai_provider_id).toBe(dummyProviderId);
    expect(assistantMessage.system_prompt_id).toBe(dummyPromptId);
    expect(assistantMessage.token_usage).toEqual(mockResponsePayload.token_usage);
    expect(assistantMessage).toHaveProperty('id'); // Should have a DB id
    expect(assistantMessage).toHaveProperty('chat_id'); // Should have the new chat_id
    expect(assistantMessage).toHaveProperty('created_at');

    const newChatId = assistantMessage.chat_id; // Get chat ID from returned message

    // Verify database state
    const newChat = await getChatById(supabaseAdmin, newChatId);
    expect(newChat).not.toBeNull();
    expect(newChat?.user_id).toBe(testUser.id);
    expect(newChat?.organization_id).toBeNull();
    expect(newChat?.title).toContain('Hello DI test'); // Check title generation

    const messages = await getChatMessagesByChatId(supabaseAdmin, newChatId);
    expect(messages).toHaveLength(2); // User + Assistant
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe(requestBody.message);
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe(mockAssistantContent);
    expect(messages[1].id).toBe(assistantMessage.id); 

    // Assert mock factory and send message were called
    expect(mockGetAiProviderAdapter).toHaveBeenCalledTimes(1);
    expect(mockSendMessageSpy).toHaveBeenCalledTimes(1); 
    // Can add more specific assertions on mockSendMessageSpy.mock.calls[0][...] if needed
  });

  it('[POST /chat] should create a new ORG chat and first messages (as Admin)', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created');
    
    // 1. Setup Org
    const testOrg = await createTestOrg(supabaseAdmin, `Chat Create Org DI Test ${Date.now()}`, testUser.id, 'admin');

    // 2. Get auth token
    const anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    const { data: signInData, error: signInError } = await (anonClient.auth as any).signInWithPassword({ email: testUser.email, password: TEST_PASSWORD });
    expect(signInError).toBeNull();
    const authToken = signInData!.session!.access_token;

    // 3. Define request body
    const requestBody = {
        message: 'Hello DI test, create an org chat',
        organizationId: testOrg.id,
        providerId: dummyProviderId,
        promptId: '__none__' // Test the __none__ case
    };

    // 4. Configure Mock AI Response & Create Mock Adapter
    const mockAssistantContent = "Okay, org chat created via DI.";
    const mockResponsePayload: AdapterResponsePayload = {
        role: 'assistant',
        content: mockAssistantContent,
        ai_provider_id: dummyProviderId,
        system_prompt_id: null, // Expect null as promptId was '__none__'
        token_usage: { prompt_tokens: 5, completion_tokens: 15, total_tokens: 20 }
    };
    const mockAdapter = createMockAdapter(mockResponsePayload);
    const mockSendMessageSpy = mockAdapter.sendMessage as vi.SpiedFunction<any>; 

    // 5. Create Mock Request Object
    const mockRequest = new Request(`${testBaseUrl}/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    // 6. Create Test Dependencies WITH Mock Factory
    const mockGetAiProviderAdapter = vi.fn().mockReturnValue(mockAdapter);
    const baseDeps = getDefaultDeps(); // Call the function to get base deps

    const testDeps: ChatHandlerDeps = {
        ...baseDeps, // Spread actual implementations first
        createSupabaseClient: vi.fn().mockImplementation((url: string, key: string, options: any) => {
             const headers = options?.global?.headers ?? {};
             return createClient<Database>(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { 
                 global: { headers: { ...headers, Authorization: `Bearer ${authToken}` } } 
             });
        }),
        getAiProviderAdapter: mockGetAiProviderAdapter,
        supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
        supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
        openaiApiKey: process.env.OPENAI_API_KEY || 'dummy-test-openai-key',
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || 'dummy-test-anthropic-key',
        googleApiKey: process.env.GOOGLE_API_KEY || 'dummy-test-google-key',
    };

    // 7. Call the main handler directly
    const response = await mainHandler(mockRequest, testDeps);

    // 8. Assertions (Expecting 200 OK)
    expect(response.status).toBe(200); 
    const body = await response.json();
    
    expect(body).toHaveProperty('message');
    const assistantMessage = body.message;
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.content).toBe(mockAssistantContent);
    expect(assistantMessage.ai_provider_id).toBe(dummyProviderId);
    expect(assistantMessage.system_prompt_id).toBeNull(); // Check null prompt
    expect(assistantMessage.token_usage).toEqual(mockResponsePayload.token_usage);
    expect(assistantMessage).toHaveProperty('id');
    expect(assistantMessage).toHaveProperty('chat_id');

    const newChatId = assistantMessage.chat_id;

    // Verify database state
    const newChat = await getChatById(supabaseAdmin, newChatId);
    expect(newChat).not.toBeNull();
    expect(newChat?.user_id).toBe(testUser.id);
    expect(newChat?.organization_id).toBe(testOrg.id);

    const messages = await getChatMessagesByChatId(supabaseAdmin, newChatId);
    expect(messages).toHaveLength(2); // User + Assistant
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe(requestBody.message);
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe(mockAssistantContent);

    // Assert mock factory and send message were called
    expect(mockGetAiProviderAdapter).toHaveBeenCalledTimes(1);
    expect(mockSendMessageSpy).toHaveBeenCalledTimes(1);
  });

  // --- Add more tests using DI later ---
  // - Existing chat continuation (personal & org)
  // - Org member allowed chat creation (when flag is true)
  // - Org member disallowed chat creation (when flag is false) -> Expect RLS error from DB insert
  // - Using a prompt ID that DOES NOT exist (expect 400 from prompt lookup)
  // - Missing/invalid providerId (expect 400)
  // - Adapter returns an error (configure mockSendMessage.mockRejectedValueOnce) -> Expect 500

}); 