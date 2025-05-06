import { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
import { spy, type Spy, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";
import type { Database } from "../types_db.ts"; 
import type { 
    AiProviderAdapter, 
    ChatApiRequest,
    AdapterResponsePayload,
    ChatHandlerDeps,
} from '../_shared/types.ts'; 
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts'; 
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockQueryBuilderState, // Added for spy type in supaConfigForRewind
} from "../_shared/test-utils.ts";
import { mainHandler, defaultDeps } from './index.ts';
import { logger } from '../_shared/logger.ts';

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

// --- Mock Data (subset needed for rewind test) ---
const mockSupabaseUrl = 'http://localhost:54321';
const mockAnonKey = 'test-anon-key';
const mockOpenAiKey = 'test-openai-key';
const now = new Date().toISOString();
const testUserId = 'user-auth-xyz';
const testProviderId = 'provider-openai-123';
const testApiIdentifier = 'openai-gpt-4o';
const testProviderString = 'openai';
const testPromptId = 'prompt-abc-456';


// Store the original Deno.env.get before stubbing
const originalDenoEnvGet = globalThis.Deno.env.get;

// --- Mock Implementations (Copied from original) --- 
const createMockAdapter = (sendMessageResult: AdapterResponsePayload | Error): AiProviderAdapter => {
    const sendMessageSpy = sendMessageResult instanceof Error 
        ? spy(() => Promise.reject(sendMessageResult)) 
        : spy(() => Promise.resolve(sendMessageResult));
    return { sendMessage: sendMessageSpy } as unknown as AiProviderAdapter;
};

const createTestDeps = (
  supaConfig: MockSupabaseDataConfig = {},
  adapterSendMessageResult?: AdapterResponsePayload | Error,
  depOverrides: Partial<ChatHandlerDeps> = {}
) => {
  const { client: mockSupabaseClient } = createMockSupabaseClient(supaConfig);
  const mockAdapter = adapterSendMessageResult ? createMockAdapter(adapterSendMessageResult) : undefined;
  const mockGetAiProviderAdapter = mockAdapter ? spy((_provider: string) => mockAdapter) : spy(getAiProviderAdapter); 
  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    createSupabaseClient: spy(() => mockSupabaseClient) as any, 
    getAiProviderAdapter: mockGetAiProviderAdapter, 
    ...depOverrides,
  };
  return { deps, mockClient: mockSupabaseClient };
};

// --- Environment Variable Stub (Copied) ---
const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
    console.log(`[Test Env Stub (Rewind Suite)] Deno.env.get called with: ${key}`);
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    if (key === 'OPENAI_API_KEY') return mockOpenAiKey;
    // Add other keys if the rewind test indirectly needs them
    return undefined; 
});


// --- Isolated Rewind Test Suite ---
Deno.test("Chat Function Rewind Test (Isolated)", async (t) => {
    try {
        // +++++ UNIT TEST FOR REWIND FUNCTIONALITY +++++
        await t.step("POST request with rewindFromMessageId should deactivate subsequent messages and add new ones", async () => {
            console.log("--- Running Rewind Functionality Unit Test (Isolated) ---");

            const rewindChatId = 'chat-rewind-abc';
            const userMsg1Content = "User Message 1 for rewind";
            const aiMsg1Content = "AI Response 1 for rewind";
            const userMsg2Content = "User Message 2 for rewind (to be inactive)";
            const aiMsg2Content = "AI Response 2 for rewind (to be inactive)";
            const userMsg3Content = "User Message 3 for rewind (new)";
            const aiMsg3Content = "AI Response 3 for rewind (new)";
            const rewindFromMsgId = "ai-msg-1-id"; 
            const initialTimestamp = new Date().getTime();
            const msgTimestamp = (offsetSeconds: number) => new Date(initialTimestamp + offsetSeconds * 1000).toISOString();
            const systemPromptText = 'Test system prompt for rewind';

            const initialMessages: ChatMessageRow[] = [
                { id: "user-msg-1-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg1Content, created_at: msgTimestamp(0), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
                { id: rewindFromMsgId, chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg1Content, created_at: msgTimestamp(1), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1, total_tokens:2}},
                { id: "user-msg-2-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg2Content, created_at: msgTimestamp(2), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
                { id: "ai-msg-2-id", chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg2Content, created_at: msgTimestamp(3), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1, total_tokens:2} },
            ];
            const newAiResponsePayload: AdapterResponsePayload = {
                role: 'assistant', content: aiMsg3Content, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            };
            const newUserMsgDbRow: ChatMessageRow = {
                id: "user-msg-3-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg3Content, created_at: msgTimestamp(4), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: null
            };
            const newAiMsgDbRow: ChatMessageRow = {
                id: "ai-msg-3-id", chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg3Content, created_at: msgTimestamp(5), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: newAiResponsePayload.token_usage
            };

            let selectCallCount = 0;
            const supaConfigForRewind: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any, // Cast to any if SupabaseUser type is complex
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: systemPromptText }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chats': { select: { data: [{ id: rewindChatId, user_id: testUserId, organization_id: null, system_prompt_id: testPromptId, title: "Rewind Test Chat" }], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => { // Use MockQueryBuilderState
                            selectCallCount++;
                            type FilterType = typeof state.filters[0]; 
                            if (selectCallCount === 1 && state.filters.some((f: FilterType) => f.column === 'id' && f.value === rewindFromMsgId) && state.operation === 'select') { 
                                console.log("[Test Mock chat_messages.select spy (Rewind Suite)] Call 1: Matched fetch for rewindFromMessageId details.");
                                return { data: [initialMessages.find(m => m.id === rewindFromMsgId)!], error: null, status: 200, count: 1 };
                            }
                            if (selectCallCount === 2 && state.filters.some((f: FilterType) => f.column === 'is_active_in_thread' && f.value === true) && state.operation === 'select') { 
                                console.log("[Test Mock chat_messages.select spy (Rewind Suite)] Call 2: Matched fetch for active history for AI.");
                                return { data: [initialMessages[0], initialMessages[1]], error: null, status: 200, count: 2 };
                            }
                            console.warn("[Test Mock chat_messages.select spy (Rewind Suite)] Unexpected call or state:", selectCallCount, state);
                            return { data: [], error: new Error('Unexpected select call in mock'), status: 500, count: 0 };
                        }),
                        update: { data: [/*ids of updated messages*/], error: null, status: 200, count: 2 },
                        insert: { data: [newUserMsgDbRow, newAiMsgDbRow], error: null, status: 201, count: 2 }
                    }
                }
            };

            const { deps, mockClient } = createTestDeps(supaConfigForRewind, newAiResponsePayload);

            const requestBody = { chatId: rewindChatId, message: userMsg3Content, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgId };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 200);
            const responseBody = await response.json();
            assertObjectMatch(responseBody.message, {
                content: aiMsg3Content,
                chat_id: rewindChatId,
                role: 'assistant',
                token_usage: newAiResponsePayload.token_usage
            });

            const updateSpy = mockClient.from('chat_messages').update as Spy<any, any[], any>; 
            assertEquals(updateSpy.calls.length, 1, "updateSpy should have been called once.");
            assertEquals(updateSpy.calls[0].args[0], { is_active_in_thread: false });

            const adapterSpy = deps.getAiProviderAdapter(testProviderString)!.sendMessage as Spy<any, any[], any>;
            assertSpyCalls(adapterSpy, 1);
            const adapterArgs = adapterSpy.calls[0].args[0] as ChatApiRequest;
            assertExists(adapterArgs.messages); 
            assertEquals(adapterArgs.message, userMsg3Content);
            assertEquals(adapterArgs.chatId, rewindChatId);
            assertEquals(adapterArgs.messages.length, 3); 
            assertEquals(adapterArgs.messages[0].role, 'system');
            assertEquals(adapterArgs.messages[0].content, systemPromptText);
            assertEquals(adapterArgs.messages[1].content, userMsg1Content);
            assertEquals(adapterArgs.messages[2].content, aiMsg1Content);
            
            const insertSpy = mockClient.from('chat_messages').insert as Spy<any, any[], any>; 
            assertSpyCalls(insertSpy, 1);
            assertEquals(insertSpy.calls[0].args[0].length, 2); 
            assertObjectMatch(insertSpy.calls[0].args[0][0], { content: userMsg3Content, role: 'user', is_active_in_thread: true });
            assertObjectMatch(insertSpy.calls[0].args[0][1], { content: aiMsg3Content, role: 'assistant', is_active_in_thread: true, token_usage: newAiResponsePayload.token_usage });
        });
    } finally {
        // Restore Deno.env.get
        globalThis.Deno.env.get = originalDenoEnvGet;
        // Dispose of the stub to prevent it from affecting other test files if Deno caches modules
        envGetStub.restore(); 
        console.log("[Test Env Stub (Rewind Suite)] Restored Deno.env.get and disposed stub.");
    }
}); 