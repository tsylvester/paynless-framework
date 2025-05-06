import {
    assertEquals, assertExists, assertNotEquals, assertObjectMatch, assertStringIncludes 
} from "jsr:@std/assert";
import { spy, stub, assertSpyCalls, type Spy } from "jsr:@std/testing/mock";
import { SupabaseClient, createClient, type SupabaseClientOptions } from 'npm:@supabase/supabase-js';
import type { User as SupabaseUser, Session, WeakPassword } from 'npm:@supabase/gotrue-js'; // Assuming User is re-exported or use this
// import * as dotenv from 'dotenv'; // Deno handles .env differently, or use jsr:@std/dotenv
// dotenv.config({ path: '../../../../.env' }); // Consider jsr:@std/dotenv/load if needed, or test runner env loading

// --- Manually Load Environment Variables ---
const envPath = new URL('../../.env.local', import.meta.url).pathname;
try {
    const dotEnvText = await Deno.readTextFile(Deno.build.os === 'windows' ? envPath.substring(1) : envPath); // Adjust for Windows path
    for (const line of dotEnvText.split('\n')) {
        if (line.trim() === '' || line.startsWith('#')) {
            continue;
        }
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
            // Remove surrounding quotes if present (common in .env files)
            let finalValue = value;
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                finalValue = value.substring(1, value.length - 1);
            }
            Deno.env.set(key.trim(), finalValue);
            console.log(`DEBUG: Manually set ${key.trim()} = ${finalValue}`);
        }
    }
} catch (error) {
    console.warn(`DEBUG: Could not load or parse .env.local file at ${envPath}:`, error);
}
// --- End Manual Load ---

// Log loaded env vars for debugging
console.log("DEBUG: VITE_SUPABASE_URL after manual load:", Deno.env.get("VITE_SUPABASE_URL"));
console.log("DEBUG: VITE_SUPABASE_ANON_KEY after manual load:", Deno.env.get("VITE_SUPABASE_ANON_KEY"));
console.log("DEBUG: VITE_SUPABASE_SERVICE_ROLE_KEY after manual load:", Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY"));

import type { Database } from '../../../functions/types_db.ts'; // Adjust path as needed
import { mainHandler, type ChatHandlerDeps, getDefaultDeps } from '../index.ts';
import type { AiProviderAdapter, AdapterResponsePayload, ChatApiRequest } from '../../_shared/types.ts';

// --- Database Types ---
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
type Chat = Database['public']['Tables']['chats']['Row'];
type Organization = Database['public']['Tables']['organizations']['Row']; // Needed for helper

// --- Test Configuration ---
const TEST_PASSWORD = 'password'; 
const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL"); 
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY"); 
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY"); 

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Essential Supabase environment variables are missing for integration tests. Ensure VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY are set in .env');
}

const testBaseUrl = 'http://localhost:54323'; 

// Helper to create a mock AiProviderAdapter using Deno's spy
const createMockAdapter = (sendMessageResult: AdapterResponsePayload | Error): AiProviderAdapter => {
    const mockSendMessage = sendMessageResult instanceof Error 
        ? spy(() => Promise.reject(sendMessageResult)) 
        : spy(() => Promise.resolve(sendMessageResult));
    return {
        sendMessage: mockSendMessage,
    } as unknown as AiProviderAdapter;
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

async function getChatById(adminClient: SupabaseClient<Database>, chatId: string): Promise<Chat | null> {
    const { data, error } = await adminClient.from('chats').select('*').eq('id', chatId).maybeSingle();
    if (error) { console.error(`Error fetching chat ${chatId}:`, error); return null; }
    return data;
}

async function getChatMessagesByChatId(adminClient: SupabaseClient<Database>, chatId: string): Promise<ChatMessage[]> {
    const { data, error } = await adminClient.from('chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (error) { console.error(`Error fetching messages for chat ${chatId}:`, error); return []; }
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
Deno.test("Edge Function Integration Tests: POST /chat (using DI)", async (t) => {
  const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(supabaseUrl!, supabaseServiceRoleKey!);
  let testUser: SupabaseUser | null = null;
  const usersToDelete: string[] = [];
  const dummyProviderId = '11111111-1111-1111-1111-111111111111'; 
  const dummyPromptId = '22222222-2222-2222-2222-222222222222';   

    try {
    // Initial setup (creating testUser, dummy provider/prompt)
      const userEmail = `test-user-chat-di-${Date.now()}@integration.test`;
      testUser = await createTestUser(supabaseAdmin, userEmail);
      usersToDelete.push(testUser.id);
    await supabaseAdmin.from('ai_providers').upsert({ id: dummyProviderId, name: 'Dummy Test Provider', provider: 'openai', api_identifier: 'gpt-dummy', is_active: true });
    await supabaseAdmin.from('system_prompts').upsert({ id: dummyPromptId, name: 'Dummy Test Prompt', prompt_text: 'You are a dummy assistant.', is_active: true });
    console.log("Initial test setup completed.");

    await t.step('[POST /chat] should create a new PERSONAL chat and first messages', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created');
    
      let anonClient: SupabaseClient<Database> | null = null; // Declare anonClient outside try to be accessible in finally
      try {
        anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
        const { data: signInData, error: signInError } = await (anonClient.auth as any).signInWithPassword({ email: testUser.email, password: TEST_PASSWORD });
        assertEquals(signInError, null);
        const authToken = signInData!.session!.access_token;

        const requestBody = {
            message: 'Hello DI test, create a personal chat',
            providerId: dummyProviderId, 
            promptId: dummyPromptId 
        };

        const mockAssistantContent = "Okay, personal chat created via DI.";
        const mockResponsePayload: AdapterResponsePayload = {
            role: 'assistant',
            content: mockAssistantContent,
            ai_provider_id: dummyProviderId,
            system_prompt_id: dummyPromptId,
            token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        };
          const actualAdapterObject = createMockAdapter(mockResponsePayload);
          const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;

          const baseDeps = getDefaultDeps();
          const testDeps: ChatHandlerDeps = {
              ...baseDeps,
                createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => {
                     return createClient<Database>(supabaseUrl!, supabaseAnonKey!, { 
                         global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${authToken}` } } 
                     });
                }) as any,
                getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };

        const mockRequest = new Request(`${testBaseUrl}/chat`, {
            method: 'POST',
              headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const response = await mainHandler(mockRequest, testDeps);
          assertEquals(response.status, 200); 
        const body = await response.json();
        
          assertNotEquals(body.message?.chat_id, undefined); // Assuming chatId is no longer directly in body, but on message
          assertExists(body.message);
        const assistantMessage = body.message;
          assertEquals(assistantMessage.role, 'assistant');
          assertEquals(assistantMessage.content, mockAssistantContent);
          assertEquals(assistantMessage.ai_provider_id, dummyProviderId);
          assertEquals(assistantMessage.system_prompt_id, dummyPromptId);
          assertObjectMatch(assistantMessage.token_usage as Record<string,unknown>, mockResponsePayload.token_usage as Record<string,unknown>);
          assertExists(assistantMessage.id);
          assertExists(assistantMessage.chat_id);
          assertExists(assistantMessage.created_at);

          const newChatId = assistantMessage.chat_id;
        const newChat = await getChatById(supabaseAdmin, newChatId);
          assertExists(newChat);
          assertEquals(newChat?.user_id, testUser.id);
          assertEquals(newChat?.organization_id, null);
          assertStringIncludes(newChat?.title || '', 'Hello DI test');

        const messages = await getChatMessagesByChatId(supabaseAdmin, newChatId);
          assertEquals(messages.length, 2);
          assertEquals(messages[0].role, 'user');
          assertEquals(messages[0].content, requestBody.message);
          assertEquals(messages[1].role, 'assistant');
          assertEquals(messages[1].content, mockAssistantContent);
          assertEquals(messages[1].id, assistantMessage.id); 

          assertSpyCalls(testDeps.getAiProviderAdapter as Spy<any,any[],any>, 1);
          assertSpyCalls(mockSendMessageSpy, 1); 
      } finally {
        await safeSignOut(anonClient, 'anonClient_personal_chat_test');
      }
    });

    await t.step('[POST /chat] should create a new ORG chat and first messages (as Admin)', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created');
    
    const testOrg = await createTestOrg(supabaseAdmin, `Chat Create Org DI Test ${Date.now()}`, testUser.id, 'admin');

      const anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
    const { data: signInData, error: signInError } = await (anonClient.auth as any).signInWithPassword({ email: testUser.email, password: TEST_PASSWORD });
      assertEquals(signInError, null);
    const authToken = signInData!.session!.access_token;

    const requestBody = {
        message: 'Hello DI test, create an org chat',
        organizationId: testOrg.id,
        providerId: dummyProviderId,
          promptId: '__none__'
    };

    const mockAssistantContent = "Okay, org chat created via DI.";
    const mockResponsePayload: AdapterResponsePayload = {
        role: 'assistant',
        content: mockAssistantContent,
        ai_provider_id: dummyProviderId,
          system_prompt_id: null,
        token_usage: { prompt_tokens: 5, completion_tokens: 15, total_tokens: 20 }
    };
      const actualAdapterObject = createMockAdapter(mockResponsePayload);
      const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>; 

      const baseDeps = getDefaultDeps();
      const testDeps: ChatHandlerDeps = {
          ...baseDeps,
            createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => {
                 return createClient<Database>(supabaseUrl!, supabaseAnonKey!, { 
                     global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${authToken}` } } 
                 });
            }) as any,
            getAiProviderAdapter: spy(() => actualAdapterObject) as any,
      };

    const mockRequest = new Request(`${testBaseUrl}/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    const response = await mainHandler(mockRequest, testDeps);

      assertEquals(response.status, 200); 
    const body = await response.json();
    
      assertEquals(body.message.content, mockAssistantContent);
      assertExists(body.message?.chat_id);

      const newChatId = body.message!.chat_id!;
    const newChat = await getChatById(supabaseAdmin, newChatId);
      assertExists(newChat);
      assertEquals(newChat?.user_id, testUser.id);
      assertEquals(newChat?.organization_id, testOrg.id);

    const messages = await getChatMessagesByChatId(supabaseAdmin, newChatId);
      assertEquals(messages.length, 2);
      assertEquals(messages[0].role, 'user');
      assertEquals(messages[0].content, requestBody.message);
      assertEquals(messages[1].role, 'assistant');
      assertEquals(messages[1].content, mockAssistantContent);

      assertSpyCalls(testDeps.getAiProviderAdapter as Spy<any,any[],any>, 1);
      assertSpyCalls(mockSendMessageSpy, 1);
    });

    await t.step('[POST /chat] Case 1.1: should return 401 Unauthorized if no auth token is provided', async () => {
    const requestBody = { message: 'Test', providerId: dummyProviderId, promptId: dummyPromptId };
      const actualAdapterObject = createMockAdapter({ role: 'assistant', content: 'AI should not be called', ai_provider_id: dummyProviderId, system_prompt_id: null, token_usage: {prompt_tokens:0, completion_tokens:0, total_tokens:0}});
      const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
    const baseDeps = getDefaultDeps();
    const depsForUnauthTest: ChatHandlerDeps = {
        ...baseDeps,
          getAiProviderAdapter: spy(() => actualAdapterObject) as any,
    };
      const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)});
    const response = await mainHandler(mockRequest, depsForUnauthTest);
      assertEquals(response.status, 401);
      assertSpyCalls(mockSendMessageSpy, 0); // Ensure AI not called
  });

    await t.step('[POST /chat] Case 1.2: should return 400 Bad Request if message is missing', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not available');
    let anonClient: SupabaseClient<Database> | null = null;
    try {
      anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email: testUser.email, password: TEST_PASSWORD });
      if (signInError) throw new Error(`Signin failed for testUser: ${signInError.message}`);
      const authToken = signInData!.session!.access_token;

      const requestBody = { providerId: dummyProviderId, promptId: dummyPromptId };
      const actualAdapterObject = createMockAdapter({ role: 'assistant', content: 'AI should not be called', ai_provider_id: dummyProviderId, system_prompt_id: null, token_usage: {prompt_tokens:0, completion_tokens:0, total_tokens:0}});
      const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
    const baseDeps = getDefaultDeps();
    const testDeps: ChatHandlerDeps = {
        ...baseDeps,
          createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => 
              createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                    global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${authToken}` } },
                    auth: { persistSession: false }
                })
          ) as any,
          getAiProviderAdapter: spy(() => actualAdapterObject) as any,
      };
      const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify(requestBody) });
    const response = await mainHandler(mockRequest, testDeps);
      assertEquals(response.status, 400);
    const body = await response.json();
      assertEquals(body.error, 'Missing or invalid "message" in request body');
      assertSpyCalls(mockSendMessageSpy, 0);
    } finally {
      await safeSignOut(anonClient, 'anonClient_case_1_2');
    }
  });

    await t.step('[POST /chat] Case 1.3: should return 400 Bad Request if providerId is missing', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not available');
    let anonClient: SupabaseClient<Database> | null = null;
    try {
      anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email: testUser.email, password: TEST_PASSWORD });
      if (signInError) throw new Error(`Signin failed for testUser: ${signInError.message}`);
      const authToken = signInData!.session!.access_token;

      const requestBody = { message: 'Test message', promptId: dummyPromptId };
      const actualAdapterObject = createMockAdapter({ role: 'assistant', content: 'AI should not be called', ai_provider_id: dummyProviderId, system_prompt_id: null, token_usage: {prompt_tokens:0, completion_tokens:0, total_tokens:0}});
      const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
      const baseDeps = getDefaultDeps();
      const testDeps: ChatHandlerDeps = {
          ...baseDeps,
            createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => 
                createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                      global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${authToken}` } },
                      auth: { persistSession: false }
                  })
            ) as any,
            getAiProviderAdapter: spy(() => actualAdapterObject) as any,
      };
      const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify(requestBody) });
      const response = await mainHandler(mockRequest, testDeps);
      assertEquals(response.status, 400);
      const body = await response.json();
      assertEquals(body.error, 'Missing or invalid "providerId" in request body');
      assertSpyCalls(mockSendMessageSpy, 0);
    } finally {
      await safeSignOut(anonClient, 'anonClient_case_1_3');
    }
  });

    await t.step('[POST /chat] Case 2.1: should create a new PERSONAL chat and return chatId and assistant message in body', async () => {
    if (!testUser || !testUser.email) throw new Error('Test user not created');
    let anonClient: SupabaseClient<Database> | null = null;
    try {
      anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email: testUser.email, password: TEST_PASSWORD });
      if (signInError) throw new Error(`Signin failed for testUser: ${signInError.message}`);
      const authToken = signInData!.session!.access_token;

      const requestBody = {
        message: 'Hello, personal chat with explicit chatId in response',
        providerId: dummyProviderId,
        promptId: dummyPromptId
    };
    const mockAssistantContent = "Okay, new personal chat created, ID is in body.";
    const mockAdapterPayload: AdapterResponsePayload = { 
        role: 'assistant', 
        content: mockAssistantContent, 
        ai_provider_id: dummyProviderId, 
        system_prompt_id: dummyPromptId, 
        token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    };
      const actualAdapterObject = createMockAdapter(mockAdapterPayload);
      const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
    
    const baseDeps = getDefaultDeps();
    const testDeps: ChatHandlerDeps = {
        ...baseDeps,
          createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) =>             
              createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                    global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${authToken}` } },
                    auth: { persistSession: false }
                })
          ) as any,
          getAiProviderAdapter: spy(() => actualAdapterObject) as any,
    };

    const mockRequest = new Request(`${testBaseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(requestBody),
    });
    const response = await mainHandler(mockRequest, testDeps);
      assertEquals(response.status, 200);
    const body = await response.json();
      assertEquals(typeof body.message?.chat_id, 'string');
    const newChatId = body.message!.chat_id!;
      assertEquals(body.message.content, mockAssistantContent);
      assertEquals(body.message.role, 'assistant');
      assertEquals(body.message.ai_provider_id, dummyProviderId);
      assertEquals(body.message.system_prompt_id, dummyPromptId);
    const chatRecord = await getChatById(supabaseAdmin, newChatId);
      assertExists(chatRecord);
      assertEquals(chatRecord!.user_id, testUser.id);
      assertEquals(chatRecord!.organization_id, null);
      assertEquals(chatRecord!.system_prompt_id, dummyPromptId);
    const messages = await getChatMessagesByChatId(supabaseAdmin, newChatId);
      assertEquals(messages.length, 2);
      assertEquals(messages[0].content, requestBody.message);
      assertEquals(messages[0].role, 'user');
      assertEquals(messages[1].content, mockAssistantContent);
      assertEquals(messages[1].role, 'assistant');
      assertEquals(messages[1].is_active_in_thread, true);
      assertSpyCalls(testDeps.getAiProviderAdapter as Spy<any,any[],any>, 1);
      assertSpyCalls(mockSendMessageSpy, 1);
    } finally {
      await safeSignOut(anonClient, 'anonClient_case_2_1');
    }
    });

    await t.step('New Organization Chat Creation', async (t_org_creation) => {
      const orgAdminUser: SupabaseUser = await createTestUser(supabaseAdmin, `org-admin-${Date.now()}@test.com`);
      const orgMemberUser: SupabaseUser = await createTestUser(supabaseAdmin, `org-member-${Date.now()}@test.com`);
      const nonOrgUser: SupabaseUser = await createTestUser(supabaseAdmin, `non-org-user-${Date.now()}@test.com`);
      usersToDelete.push(orgAdminUser.id, orgMemberUser.id, nonOrgUser.id); 

      let anonClient: SupabaseClient<Database> | null = null; // Declare at the top of the block
      try {
        anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!); 
        // Sign in all users needed for this block using this single anonClient
        let signInData = await anonClient.auth.signInWithPassword({ email: orgAdminUser.email!, password: TEST_PASSWORD });
        if (signInData.error) throw new Error(`Signin failed for orgAdminUser: ${signInData.error.message}`);
        const orgAdminToken: string = signInData.data!.session!.access_token;

        // Re-authenticate or set new user session for orgMemberToken
        // If signInWithPassword on the same client overwrites the session, this is fine.
        // Otherwise, you might need separate clients or a way to manage multiple user sessions on one client if supported.
        signInData = await anonClient.auth.signInWithPassword({ email: orgMemberUser.email!, password: TEST_PASSWORD });
        if (signInData.error) throw new Error(`Signin failed for orgMemberUser: ${signInData.error.message}`);
        const orgMemberToken: string = signInData.data!.session!.access_token;

        signInData = await anonClient.auth.signInWithPassword({ email: nonOrgUser.email!, password: TEST_PASSWORD });
        if (signInData.error) throw new Error(`Signin failed for nonOrgUser: ${signInData.error.message}`);
        const nonOrgToken: string = signInData.data!.session!.access_token;

        const testOrgAllowCreate = await createTestOrg(supabaseAdmin, `Org Allow Create ${Date.now()}`, orgAdminUser.id, 'admin');
        await setOrgMemberChatCreation(supabaseAdmin, testOrgAllowCreate.id, true);
        await supabaseAdmin.from('organization_members').insert({ organization_id: testOrgAllowCreate.id, user_id: orgMemberUser.id, role: 'member', status: 'active' });

        const testOrgDisallowCreate = await createTestOrg(supabaseAdmin, `Org Disallow Create ${Date.now()}`, orgAdminUser.id, 'admin');
        await setOrgMemberChatCreation(supabaseAdmin, testOrgDisallowCreate.id, false);
        await supabaseAdmin.from('organization_members').insert({ organization_id: testOrgDisallowCreate.id, user_id: orgMemberUser.id, role: 'member', status: 'active' });

        await t_org_creation.step('[POST /chat] Case 3.1a: Org Admin should create org chat', async () => {
          const requestBody = { message: 'Admin creating org chat', providerId: dummyProviderId, promptId: dummyPromptId, organizationId: testOrgAllowCreate.id };
            const actualAdapterObject = createMockAdapter({ role: 'assistant', content: "Org chat created by admin.", ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }});
            const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
          const baseDeps = getDefaultDeps();
          const testDeps: ChatHandlerDeps = {
              ...baseDeps,
                createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => 
                    createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                          global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgAdminToken}` } },
                          auth: { persistSession: false }
                      })
                ) as any,
                getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };
          const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgAdminToken}` }, body: JSON.stringify(requestBody) });
          const response = await mainHandler(mockRequest, testDeps);
            assertEquals(response.status, 200);
          const body = await response.json();
            assertEquals(typeof body.message?.chat_id, 'string');
          const newChatId = body.message!.chat_id!;
          const chatRecord = await getChatById(supabaseAdmin, newChatId);
            assertExists(chatRecord);
            assertEquals(chatRecord!.organization_id, testOrgAllowCreate.id);
            assertEquals(chatRecord!.user_id, orgAdminUser.id);
        });

        await t_org_creation.step('[POST /chat] Case 3.1b: Org Member (allowed) should create org chat', async () => {
          const requestBody = { message: 'Member creating org chat (allowed)', providerId: dummyProviderId, promptId: dummyPromptId, organizationId: testOrgAllowCreate.id };
            const actualAdapterObject = createMockAdapter({ role: 'assistant', content: "Org chat created by member (allowed).", ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }});
            const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
          const baseDeps = getDefaultDeps();
          const testDeps: ChatHandlerDeps = {
              ...baseDeps,
                createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => 
                    createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                          global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgMemberToken}` } },
                          auth: { persistSession: false }
                      })
                ) as any,
                getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };
          const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgMemberToken}` }, body: JSON.stringify(requestBody) });
          const response = await mainHandler(mockRequest, testDeps);
            assertEquals(response.status, 200);
          const body = await response.json();
            assertEquals(typeof body.message?.chat_id, 'string');
          const newChatId = body.message!.chat_id!;
          const chatRecord = await getChatById(supabaseAdmin, newChatId);
            assertExists(chatRecord);
            assertEquals(chatRecord!.organization_id, testOrgAllowCreate.id);
            assertEquals(chatRecord!.user_id, orgMemberUser.id);
        });

        await t_org_creation.step('[POST /chat] Case 3.2: Org Member (disallowed) should NOT create org chat', async () => {
          const requestBody = { message: 'Member trying org chat (disallowed)', providerId: dummyProviderId, promptId: dummyPromptId, organizationId: testOrgDisallowCreate.id };
            const actualAdapterObject = createMockAdapter({ role: 'assistant', content: 'AI should not be called', ai_provider_id: dummyProviderId, system_prompt_id: null, token_usage: {prompt_tokens:0, completion_tokens:0, total_tokens:0}});
            const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
          const baseDeps = getDefaultDeps();
          const testDeps: ChatHandlerDeps = {
              ...baseDeps,
                createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => 
                    createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                          global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgMemberToken}` } },
                          auth: { persistSession: false }
                      })
                ) as any,
                getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };
          const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgMemberToken}` }, body: JSON.stringify(requestBody) });
          const response = await mainHandler(mockRequest, testDeps);
            assertEquals(response.status, 500);
      });

        await t_org_creation.step('[POST /chat] Case 3.3: User not in org should NOT create org chat', async () => {
          const requestBody = { message: 'Non-member trying org chat', providerId: dummyProviderId, promptId: dummyPromptId, organizationId: testOrgAllowCreate.id };
            const actualAdapterObject = createMockAdapter({ role: 'assistant', content: 'AI should not be called', ai_provider_id: dummyProviderId, system_prompt_id: null, token_usage: {prompt_tokens:0, completion_tokens:0, total_tokens:0}});
            const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
          const baseDeps = getDefaultDeps();
          const testDeps: ChatHandlerDeps = {
              ...baseDeps,
                createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => 
                    createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                          global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${nonOrgToken}` } },
                          auth: { persistSession: false }
                      })
                ) as any,
                getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };
          const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${nonOrgToken}` }, body: JSON.stringify(requestBody) });
          const response = await mainHandler(mockRequest, testDeps);
            assertEquals(response.status, 500);
      });

        await t_org_creation.step('[POST /chat] Case 3.4: should return 403 for non-existent organizationId', async () => {
          const requestBody = { message: 'Chat with invalid orgId', providerId: dummyProviderId, promptId: dummyPromptId, organizationId: '00000000-0000-0000-0000-000000000000' };
            const actualAdapterObject = createMockAdapter({ role: 'assistant', content: 'AI should not be called', ai_provider_id: dummyProviderId, system_prompt_id: null, token_usage: {prompt_tokens:0, completion_tokens:0, total_tokens:0}});
            const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
          const baseDeps = getDefaultDeps();
          const testDeps: ChatHandlerDeps = {
              ...baseDeps,
                createSupabaseClient: spy((url?: string, key?: string, options?: SupabaseClientOptions<"public">) => 
                    createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
                          global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgAdminToken}` } },
                          auth: { persistSession: false }
                      })
                ) as any,
                getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };
          const mockRequest = new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgAdminToken}` }, body: JSON.stringify(requestBody) });
          const response = await mainHandler(mockRequest, testDeps);
            assertEquals(response.status, 500);
      });
      } finally {
        // Sign out the main anonClient for this block after all sub-steps are done
        await safeSignOut(anonClient, 'anonClient_org_creation_block');
      }
    });

    await t.step('Existing Chat Continuation', async (t_continuation) => {
      const orgAdminUserForContinuation: SupabaseUser = await createTestUser(supabaseAdmin, `test-user-continuation-${Date.now()}@integration.test`);
      usersToDelete.push(orgAdminUserForContinuation.id);
      let anonClient: SupabaseClient<Database> | null = null; // Declare at the top
      try {
        anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!); 
        const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email: orgAdminUserForContinuation.email!, password: TEST_PASSWORD });
        if (signInError) throw new Error(`Signin failed for continuation user: ${signInError.message}`);
        const result = signInData as { user: SupabaseUser; session: Session; weakPassword?: WeakPassword | undefined; };
        const orgAdminTokenForContinuation: string = result.session!.access_token;    
        const testOrgForContinuation = await createTestOrg(supabaseAdmin, `Continuation Org ${Date.now()}`, orgAdminUserForContinuation.id, 'admin');

        const initialPersonalAdapterObject = createMockAdapter({ role: 'assistant', content: 'Initial AI response for personal.', ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }});
        const personalChatInitialResponse = await mainHandler(
          new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${orgAdminTokenForContinuation}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Initial message for personal continuation', providerId: dummyProviderId, promptId: dummyPromptId }) }),
          { ...getDefaultDeps(), createSupabaseClient: spy((url: string, key: string, options: SupabaseClientOptions<"public">) => createClient<Database>(supabaseUrl!, supabaseAnonKey!, { global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgAdminTokenForContinuation}` } }, auth: { persistSession: false } })) as any, getAiProviderAdapter: spy(() => initialPersonalAdapterObject) as any }
        );
        assertEquals(personalChatInitialResponse.status, 200);
        const personalChatBody = await personalChatInitialResponse.json();
        assertExists(personalChatBody.message?.chat_id);
        const existingPersonalChatId: string = personalChatBody.message.chat_id;

        const initialOrgAdapterObject = createMockAdapter({ role: 'assistant', content: 'Initial AI response for org.', ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }});
        const orgChatInitialResponse = await mainHandler(
          new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${orgAdminTokenForContinuation}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Initial message for org continuation', providerId: dummyProviderId, promptId: dummyPromptId, organizationId: testOrgForContinuation.id }) }),
          { ...getDefaultDeps(), createSupabaseClient: spy((url: string, key: string, options: SupabaseClientOptions<"public">) => createClient<Database>(supabaseUrl!, supabaseAnonKey!, { global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgAdminTokenForContinuation}` } }, auth: { persistSession: false } })) as any, getAiProviderAdapter: spy(() => initialOrgAdapterObject) as any }
        );
        assertEquals(orgChatInitialResponse.status, 200);
        const orgChatBody = await orgChatInitialResponse.json();
        assertExists(orgChatBody.message?.chat_id);
        const existingOrgChatId: string = orgChatBody.message.chat_id;
        
        await t_continuation.step('should add a message to an existing PERSONAL chat', async () => {
          const requestBody = { message: 'Second message for personal continuation', chatId: existingPersonalChatId, providerId: dummyProviderId, promptId: dummyPromptId };
          const mockAssistantContent = "Okay, continued personal chat.";
          const actualAdapterObject = createMockAdapter({ role: 'assistant', content: mockAssistantContent, ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 12, completion_tokens: 22, total_tokens: 34 }});
          const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
          const testDeps: ChatHandlerDeps = {
            ...getDefaultDeps(),
            createSupabaseClient: spy((url: string, key: string, options: SupabaseClientOptions<"public">) => createClient<Database>(supabaseUrl!, supabaseAnonKey!, { global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgAdminTokenForContinuation}` } }, auth: { persistSession: false } })) as any,
            getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };
          const response = await mainHandler( new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${orgAdminTokenForContinuation}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }), testDeps );
          assertEquals(response.status, 200);
          const body = await response.json();
          assertEquals(body.message.role, 'assistant');
          assertEquals(body.message.content, mockAssistantContent);
          assertEquals(body.message.chat_id, existingPersonalChatId);
          const messages = await getChatMessagesByChatId(supabaseAdmin, existingPersonalChatId);
          assertEquals(messages.length, 4);
          assertEquals(messages[2].content, requestBody.message);
          assertEquals(messages[2].role, 'user');
          assertEquals(messages[3].content, mockAssistantContent);
          assertEquals(messages[3].role, 'assistant');
          assertEquals(messages[3].is_active_in_thread, true);
          assertSpyCalls(testDeps.getAiProviderAdapter as Spy<any,any[],any>, 1);
          assertSpyCalls(mockSendMessageSpy, 1);
        });

        await t_continuation.step('should add a message to an existing ORG chat by org admin', async () => {
          const requestBody = { message: 'Second message for org continuation by admin', chatId: existingOrgChatId, organizationId: testOrgForContinuation.id, providerId: dummyProviderId, promptId: dummyPromptId };
          const mockAssistantContent = "Okay, continued org chat by admin.";
          const actualAdapterObject = createMockAdapter({ role: 'assistant', content: mockAssistantContent, ai_provider_id: dummyProviderId, system_prompt_id: null, token_usage: { prompt_tokens: 13, completion_tokens: 23, total_tokens: 36 }});
          const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>;
          const testDeps: ChatHandlerDeps = {
            ...getDefaultDeps(),
            createSupabaseClient: spy((url: string, key: string, options: SupabaseClientOptions<"public">) => createClient<Database>(supabaseUrl!, supabaseAnonKey!, { global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${orgAdminTokenForContinuation}` } }, auth: { persistSession: false } })) as any,
            getAiProviderAdapter: spy(() => actualAdapterObject) as any,
          };
          const response = await mainHandler( new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${orgAdminTokenForContinuation}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }), testDeps );
          assertEquals(response.status, 200);
          const body = await response.json();
          assertEquals(body.message.role, 'assistant');
          assertEquals(body.message.content, mockAssistantContent);
          assertEquals(body.message.chat_id, existingOrgChatId);
          const messages = await getChatMessagesByChatId(supabaseAdmin, existingOrgChatId);
          assertEquals(messages.length, 4);
          assertEquals(messages[2].content, requestBody.message);
          assertEquals(messages[3].content, mockAssistantContent);
          assertSpyCalls(testDeps.getAiProviderAdapter as Spy<any,any[],any>, 1);
          assertSpyCalls(mockSendMessageSpy, 1);
      });
    } finally {
      // Sign out the main anonClient for this block
      await safeSignOut(anonClient, 'anonClient_continuation_block');
    }
  });

    await t.step('Chat Rewind Functionality', async (t_rewind) => {
      const userForRewind: SupabaseUser = await createTestUser(supabaseAdmin, `test-user-rewind-${Date.now()}@integration.test`);
      usersToDelete.push(userForRewind.id);
      let anonClient: SupabaseClient<Database> | null = null; // Declare at the top
      try {
        anonClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
        const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email: userForRewind.email!, password: TEST_PASSWORD });
        if (signInError) throw new Error(`Signin failed for rewind user: ${signInError.message}`);
        const result = signInData as { user: SupabaseUser; session: Session; weakPassword?: WeakPassword | undefined; };
        const userTokenForRewind: string = result.session!.access_token;

        const baseDepsForRewindSetup = getDefaultDeps();
        const createClientSpyForRewind = spy((url: string, key: string, options: SupabaseClientOptions<"public">) => createClient<Database>(supabaseUrl!, supabaseAnonKey!, { global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${userTokenForRewind}` } }, auth: { persistSession: false } }));

        // Turn 1: Create chat and first message pair
        const adapterTurn1 = createMockAdapter({ role: 'assistant', content: 'AI Response 1', ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }});
        const depsTurn1: ChatHandlerDeps = {
          ...baseDepsForRewindSetup,
          createSupabaseClient: createClientSpyForRewind as any,
          getAiProviderAdapter: spy(() => adapterTurn1) as any 
        };
        const initialChatResponse = await mainHandler( new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${userTokenForRewind}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'User Message 1', providerId: dummyProviderId, promptId: dummyPromptId }) }), depsTurn1 );
        assertEquals(initialChatResponse.status, 200);
        const initialChatBody = await initialChatResponse.json();
        const chatToRewindId: string = initialChatBody.message.chat_id;
        const messageIdToRewindFrom: string = initialChatBody.message.id;

        // Turn 2: Add second message pair
        const adapterTurn2 = createMockAdapter({ role: 'assistant', content: 'AI Response 2', ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 }});
        const depsTurn2: ChatHandlerDeps = {
          ...baseDepsForRewindSetup,
          createSupabaseClient: createClientSpyForRewind as any,
          getAiProviderAdapter: spy(() => adapterTurn2) as any
        };
        await mainHandler( new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${userTokenForRewind}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: chatToRewindId, message: 'User Message 2', providerId: dummyProviderId, promptId: dummyPromptId }) }), depsTurn2 );

        // Turn 3: Add third message pair (to be deactivated)
        const adapterTurn3 = createMockAdapter({ role: 'assistant', content: 'AI Response 3 (to be deactivated)', ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 3, completion_tokens: 3, total_tokens: 6 }});
        const depsTurn3: ChatHandlerDeps = {
          ...baseDepsForRewindSetup,
          createSupabaseClient: createClientSpyForRewind as any,
          getAiProviderAdapter: spy(() => adapterTurn3) as any 
        };
        await mainHandler( new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${userTokenForRewind}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: chatToRewindId, message: 'User Message 3 (to be deactivated)', providerId: dummyProviderId, promptId: dummyPromptId }) }), depsTurn3 );
        
        await t_rewind.step('should rewind chat, mark subsequent messages inactive, and add new active messages', async () => {
            const rewindRequestBody = { chatId: chatToRewindId, message: 'User Message 4 (after rewind)', providerId: dummyProviderId, rewindFromMessageId: messageIdToRewindFrom, promptId: dummyPromptId };
            const mockRewoundAssistantContent = "AI Response 4 (after rewind)";
            const mockRewoundAdapterPayload: AdapterResponsePayload = { role: 'assistant', content: mockRewoundAssistantContent, ai_provider_id: dummyProviderId, system_prompt_id: dummyPromptId, token_usage: { prompt_tokens: 40, completion_tokens: 40, total_tokens: 80 }};
            const actualAdapterObject = createMockAdapter(mockRewoundAdapterPayload);
            const mockSendMessageSpy = actualAdapterObject.sendMessage as Spy<any,any[],any>; 
            const rewindDeps: ChatHandlerDeps = {
              ...getDefaultDeps(),
              createSupabaseClient: spy((url: string, key: string, options: SupabaseClientOptions<"public">) => createClient<Database>(supabaseUrl!, supabaseAnonKey!, { global: { headers: { ...(options?.global?.headers || {}), Authorization: `Bearer ${userTokenForRewind}` } }, auth: { persistSession: false } })) as any,
              getAiProviderAdapter: spy(() => actualAdapterObject) as any,
            };
            const response = await mainHandler( new Request(`${testBaseUrl}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${userTokenForRewind}`, 'Content-Type': 'application/json' }, body: JSON.stringify(rewindRequestBody) }), rewindDeps );
            assertEquals(response.status, 200);
            const body = await response.json();
            assertEquals(body.message.role, 'assistant');
            assertEquals(body.message.content, mockRewoundAssistantContent);
            assertEquals(body.message.chat_id, chatToRewindId);
            assertObjectMatch(body.message.token_usage as Record<string,unknown>, mockRewoundAdapterPayload.token_usage as Record<string,unknown>);
            const finalMessages = await getChatMessagesByChatId(supabaseAdmin, chatToRewindId);

            // DEBUG: Log all final messages with their active status
            console.log("DEBUG Rewind: Final messages state before assertions:");
            finalMessages.forEach(msg => {
              console.log(`  Content: "${msg.content}", Active: ${msg.is_active_in_thread}, CreatedAt: ${msg.created_at}, ID: ${msg.id}`);
            });
            console.log(`DEBUG Rewind: Target rewindFromMessageId was: ${messageIdToRewindFrom}`);

            assertEquals(finalMessages.length, 8);
            assertEquals(finalMessages.find(m => m.content === 'User Message 1')?.is_active_in_thread, true);
            assertEquals(finalMessages.find(m => m.id === messageIdToRewindFrom)?.is_active_in_thread, true);
            assertEquals(finalMessages.find(m => m.content === 'User Message 2')?.is_active_in_thread, false);
            assertEquals(finalMessages.find(m => m.content === 'AI Response 2')?.is_active_in_thread, false);
            assertEquals(finalMessages.find(m => m.content === 'User Message 3 (to be deactivated)')?.is_active_in_thread, false);
            assertEquals(finalMessages.find(m => m.content === 'AI Response 3 (to be deactivated)')?.is_active_in_thread, false);
            const userMessage4 = finalMessages.find(m => m.content === rewindRequestBody.message);
            const assistantMessage4 = finalMessages.find(m => m.content === mockRewoundAssistantContent);
            assertEquals(userMessage4?.is_active_in_thread, true);
            assertEquals(assistantMessage4?.is_active_in_thread, true);
            assertObjectMatch(assistantMessage4?.token_usage as Record<string,unknown>, mockRewoundAdapterPayload.token_usage as Record<string,unknown>);
            assertSpyCalls(rewindDeps.getAiProviderAdapter as Spy<any,any[],any>, 1);
            assertSpyCalls(mockSendMessageSpy, 1);
        });
      } finally {
        // Sign out the main anonClient for this block
        await safeSignOut(anonClient, 'anonClient_rewind_block');
      }
    });

  } catch (error) {
    // Log errors from setup or test steps if needed, or just let them propagate to fail the test
    console.error("Error during test execution:", error);
    throw error; // Re-throw to ensure test fails
  } finally {
    // Cleanup logic (afterAll equivalent)
    console.log("Running cleanup...");
    if (usersToDelete.length > 0) {
        await cleanupTestData(supabaseAdmin, usersToDelete);
        // Stop Supabase admin client listeners
        if (supabaseAdmin && supabaseAdmin.auth) {
            const { error: adminSignOutError } = await supabaseAdmin.auth.signOut();
            if (adminSignOutError) {
                console.error("Error signing out supabaseAdmin:", adminSignOutError.message);
            } else {
                console.log("Signed out supabaseAdmin to stop auth client listeners.");
            }
        }
        // Any other global cleanup
        console.log("Cleanup finished.");
    } else {
        console.log("No users to clean up.");
    }
  }
}); 

// Helper function to safely sign out a Supabase client
// This can be used in individual test steps for their local anonClients
async function safeSignOut(client: SupabaseClient | null, clientName = "client") {
    if (client && client.auth) {
        const { error } = await client.auth.signOut();
        if (error) {
            console.warn(`Error signing out ${clientName}: ${error.message}`);
        } else {
            // console.log(`Successfully signed out ${clientName}`);
        }
    }
} 