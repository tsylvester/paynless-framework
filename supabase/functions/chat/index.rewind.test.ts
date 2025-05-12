import { assert, assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert@0.225.3";
import { spy, type Spy, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import type { ConnInfo } from "https://deno.land/std@0.177.0/http/server.ts";
import type { Database, Json } from "../types_db.ts"; 
import type { 
    AiProviderAdapter, 
    ChatApiRequest,
    AdapterResponsePayload,
    ChatHandlerDeps,
    MockSupabaseClientSetup,
    User 
} from '../_shared/types.ts'; 
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts'; 
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockQueryBuilderState, // Added for spy type in supaConfigForRewind
} from "../_shared/supabase.mock.ts";
import { handler, defaultDeps } from './index.ts';

// --- Helper to generate UUIDs ---
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

// At the top level of the file, near other type definitions:
type PerformChatRewindParams = {
    p_chat_id: string;
    p_rewind_from_message_id: string;
    p_user_id: string;
    p_new_user_message_content: string;
    p_new_user_message_ai_provider_id: string;
    p_new_user_message_system_prompt_id: string | null;
    p_new_assistant_message_content: string;
    p_new_assistant_message_token_usage: Json | null;
    p_new_assistant_message_ai_provider_id: string;
    p_new_assistant_message_system_prompt_id: string | null;
};

// --- Mock Data (subset needed for rewind test) ---
const mockSupabaseUrl = 'http://localhost:54321';
const mockAnonKey = 'test-anon-key';
const mockOpenAiKey = 'test-openai-key';
const now = new Date().toISOString();
const testUserId = 'user-auth-xyz';

// Define constants for mock tests globally
const testPromptId = generateUUID(); 
const testProviderId = generateUUID(); 
const testApiIdentifier = 'openai-gpt-4';
const testProviderString = 'openai';
const systemPromptText = 'Test system prompt'; // General system prompt text for mocks

const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    created_at: new Date().toISOString()
};

const historyForAIAdapter = [
    {
        id: 'msg-1',
        created_at: new Date().toISOString(),
        chat_id: 'chat-1',
        user_id: 'user-1',
        role: 'user',
        content: 'Test message 1',
        is_active_in_thread: true
    },
    {
        id: 'msg-2',
        created_at: new Date().toISOString(),
        chat_id: 'chat-1',
        role: 'assistant',
        content: 'Test response 1',
        is_active_in_thread: true,
        ai_provider_id: 'provider-1',
        system_prompt_id: 'prompt-1',
        token_usage: { prompt_tokens: 10, completion_tokens: 20 }
    }
];

// Store the original Deno.env.get to be used by Real DB tests directly
const originalDenoEnvGet = Deno.env.get;

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
): { deps: ChatHandlerDeps; mockClientSetup: MockSupabaseClientSetup } => {
  const mockClientSetup = createMockSupabaseClient(supaConfig);
  
  const mockAdapter = adapterSendMessageResult ? createMockAdapter(adapterSendMessageResult) : undefined;
  const mockGetAiProviderAdapter = mockAdapter ? spy((_provider: string) => mockAdapter) : spy(getAiProviderAdapter); 

  const deps: ChatHandlerDeps = {
    ...defaultDeps, 
    createSupabaseClient: spy(() => mockClientSetup.client) as any,
    getAiProviderAdapter: mockGetAiProviderAdapter, 
    ...depOverrides, 
  };
  return { deps, mockClientSetup };
};

// --- Isolated Rewind Test Suite ---
Deno.test("Chat Function Rewind Test (Isolated)", async (t) => {
    // Stash the original Deno.env.get for this test suite and stub it.
    const originalIsolatedTestEnvGet = Deno.env.get;
    let envGetStub: Spy<typeof Deno.env, [key: string, ...args: any[]], string | undefined> | null = null;

    try {
        envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
            console.log(`[Test Env Stub (Isolated Suite)] Deno.env.get called with: ${key}`);
    if (key === 'SUPABASE_URL') return mockSupabaseUrl;
    if (key === 'SUPABASE_ANON_KEY') return mockAnonKey;
    if (key === 'OPENAI_API_KEY') return mockOpenAiKey;
            // For any other keys, fall back to the original Deno.env.get captured at the start of this isolated test suite.
            // This is to ensure that if other tests somehow rely on Deno.env.get, they are not affected by this specific stub.
            return originalIsolatedTestEnvGet(key); 
});

        // +++++ UNIT TEST FOR REWIND FUNCTIONALITY +++++
        await t.step("POST request with rewindFromMessageId should call RPC and use its result", async () => {
            console.log("--- Running Rewind Functionality Unit Test (RPC) ---");

            const rewindChatId = 'chat-rewind-rpc-abc';
            const userMsg1Content = "User Message 1 for RPC rewind";
            const aiMsg1Content = "AI Response 1 for RPC rewind";
            // Messages to be made inactive by RPC - not directly asserted but implicitly part of rewind point
            // const userMsg2Content = "User Message 2 for RPC rewind (to be inactive)";
            // const aiMsg2Content = "AI Response 2 for RPC rewind (to be inactive)";
            const userMsg3NewContent = "User Message 3 for RPC rewind (new user input)"; // This is the new message in the request
            const aiMsg3NewContentFromAdapter = "AI Response 3 from adapter for RPC rewind (new from AI)"; // This is what the AI adapter returns
            const rewindFromMsgId = "ai-msg-1-rpc-id"; 
            const initialTimestamp = new Date().getTime();
            const msgTimestamp = (offsetSeconds: number) => new Date(initialTimestamp + offsetSeconds * 1000).toISOString();
            const systemPromptText = 'Test system prompt for RPC rewind';

            // History that should be passed to the AI adapter
            const historyForAIAdapter: ChatMessageRow[] = [
                { id: "user-msg-1-rpc-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg1Content, created_at: msgTimestamp(0), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, updated_at: msgTimestamp(0) },
                { id: rewindFromMsgId, chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg1Content, created_at: msgTimestamp(1), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1}, updated_at: msgTimestamp(1) },
            ];
            
            // This is the new message content from the request body
            const newRequestUserMessageContent = userMsg3NewContent;

            // This is what the AI adapter will return
            const newAiResponseFromAdapterPayload: AdapterResponsePayload = {
                role: 'assistant', content: aiMsg3NewContentFromAdapter, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 10, completion_tokens: 20 },
            };

            // This is the expected structure of the *final assistant message* returned by the RPC
            const mockAssistantMessageFromRpc: ChatMessageRow = {
                id: "ai-msg-3-rpc-id", // New ID for the message created by RPC
                chat_id: rewindChatId, 
                user_id: null, 
                role: 'assistant',
                content: aiMsg3NewContentFromAdapter, // Content from AI adapter
                created_at: msgTimestamp(5), // Timestamp will be set by DB
                is_active_in_thread: true,
                token_usage: newAiResponseFromAdapterPayload.token_usage, // from AI adapter
                ai_provider_id: testProviderId,
                system_prompt_id: testPromptId,
                updated_at: msgTimestamp(5)
            };
            
            let selectCallCount = 0;
            const supaConfigForRewindRpc: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { 
                        select: { 
                            data: [{ id: testPromptId, prompt_text: systemPromptText, is_active: true }], 
                            error: null, status: 200, count: 1 
                        } 
                    },
                    'ai_providers': { 
                        select: { 
                            data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString, is_active: true }], 
                            error: null, status: 200, count: 1 
                        } 
                    },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => { 
                            selectCallCount++;
                            console.log(`[Test Mock chat_messages.select RPC] Called. selectCallCount: ${selectCallCount}, Filters: ${JSON.stringify(state.filters)}`);
                            type FilterType = typeof state.filters[0]; 

                            // First select call: Fetching the rewind point message's created_at
                            if (selectCallCount === 1 && state.filters.some((f: FilterType) => f.column === 'id' && f.value === rewindFromMsgId) && state.selectColumns === 'created_at') { 
                                console.log(`[Test Mock chat_messages.select RPC] Matched selectCallCount 1 for rewindFromMsgId: ${rewindFromMsgId}`);
                                const rewindMessage = historyForAIAdapter.find(m => m.id === rewindFromMsgId);
                                if (!rewindMessage) {
                                    // Simulate not found for the first call if ID doesn't match mock data
                                    return { data: null, error: { name: 'PGRST116', message: 'Query returned no rows' }, status: 406, count: 0 }; 
                                }
                                return { data: [{ created_at: rewindMessage.created_at } as any], error: null, status: 200, count: 1 };
                            }

                            // Second select call: Fetching active history for AI context (use 'lte')
                            if (selectCallCount === 2 && 
                                state.filters.some((f: FilterType) => f.column === 'chat_id' && f.value === rewindChatId) &&
                                state.filters.some((f: FilterType) => f.column === 'is_active_in_thread' && f.value === true) &&
                                state.filters.some((f: FilterType) => f.column === 'created_at' && f.type === 'lte')) { // <<< Updated to check for 'lte'
                                console.log('[Test Mock chat_messages.select RPC] Matched selectCallCount 2 for fetching active history with LTE.');
                                // Return the history correctly, the error is simulated later in the RPC call mock
                                const rewindPointTimestamp = historyForAIAdapter.find(m => m.id === rewindFromMsgId)?.created_at;
                                const filteredHistory = rewindPointTimestamp ? historyForAIAdapter.filter(m => new Date(m.created_at) <= new Date(rewindPointTimestamp)) : [];
                                return { data: filteredHistory as any[], error: null, status: 200, count: filteredHistory.length };
                            }
                            
                            console.error(`[Test Mock chat_messages.select RPC] UNEXPECTED CALL. selectCallCount: ${selectCallCount}, Filters: ${JSON.stringify(state.filters)}`);
                            return { data: [], error: new Error('Unexpected mock chat_messages select call'), status: 500, count: 0 }; 
                        }),
                        update: spy(async () => { throw new Error("chat_messages.update should NOT be called in RPC rewind test"); }),
                        insert: spy(async () => { throw new Error("chat_messages.insert should NOT be called in RPC rewind test"); })
                    }
                },
                rpcResults: {
                    'perform_chat_rewind': {
                        data: [mockAssistantMessageFromRpc as any],
                        error: null
                    }
                }
            };

            const { deps, mockClientSetup } = createTestDeps(supaConfigForRewindRpc, newAiResponseFromAdapterPayload);
            const rpcSpy = mockClientSetup.spies.rpcSpy; // Assuming createMockSupabaseClient exposes this

            const requestBody = { 
                chatId: rewindChatId, 
                message: newRequestUserMessageContent, // New user message content
                providerId: testProviderId, 
                promptId: testPromptId, 
                rewindFromMessageId: rewindFromMsgId 
            };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            
            const response = await handler(req, deps);
            assertEquals(response.status, 200, `RPC Rewind Test Failed: Status was ${response.status}, Body: ${await response.clone().text()}`);
            const responseBody = await response.json();

            // Assert that responseBody.data matches the mockAssistantMessageFromRpc structure
            // (Assuming RPC returns single object when 1 row is returned)
            assertExists(responseBody.data, "Response body should have a 'data' property");
            assertObjectMatch(responseBody.data, {
                id: mockAssistantMessageFromRpc.id,
                content: mockAssistantMessageFromRpc.content,
                chat_id: rewindChatId, // from mockAssistantMessageFromRpc via rewindChatId
                role: 'assistant', // from mockAssistantMessageFromRpc
                token_usage: mockAssistantMessageFromRpc.token_usage, // from mockAssistantMessageFromRpc
                // Ensure other relevant fields from mockAssistantMessageFromRpc are checked if necessary
                // For example, ai_provider_id and system_prompt_id from mockAssistantMessageFromRpc
                ai_provider_id: mockAssistantMessageFromRpc.ai_provider_id,
                system_prompt_id: mockAssistantMessageFromRpc.system_prompt_id
            });

            // Assert RPC call
            assertSpyCalls(rpcSpy, 1);
            const rpcCallArgs = rpcSpy.calls[0].args;
            assertEquals(rpcCallArgs[0], 'perform_chat_rewind');
            const expectedRpcParams: PerformChatRewindParams = {
                p_chat_id: rewindChatId,
                p_rewind_from_message_id: rewindFromMsgId,
                p_user_id: testUserId,
                p_new_user_message_content: newRequestUserMessageContent,
                p_new_user_message_ai_provider_id: testProviderId,
                p_new_user_message_system_prompt_id: testPromptId, // Assuming promptId is not '__none__'
                p_new_assistant_message_content: newAiResponseFromAdapterPayload.content,
                p_new_assistant_message_token_usage: newAiResponseFromAdapterPayload.token_usage,
                p_new_assistant_message_ai_provider_id: testProviderId,
                p_new_assistant_message_system_prompt_id: testPromptId, // Assuming promptId is not '__none__'
            };
            assertObjectMatch(rpcCallArgs[1] as Record<string, unknown>, expectedRpcParams as Record<string, unknown>);
            
            // Assert AI Adapter call (history should be based on messages *before* rewind point)
            const adapterFactorySpy = deps.getAiProviderAdapter as Spy<any,any[],any>; // get the factory spy
            const adapterInstance = adapterFactorySpy.calls[0].returned; // get the instance returned by the factory
            const adapterSpy = adapterInstance.sendMessage as Spy<any, any[], any>; // get the sendMessage spy from the instance

            assertSpyCalls(adapterSpy, 1);
            const adapterArgs = adapterSpy.calls[0].args[0] as ChatApiRequest;
            assertExists(adapterArgs.messages); 
            assertEquals(adapterArgs.message, newRequestUserMessageContent);
            assertEquals(adapterArgs.chatId, rewindChatId);
            // History for AI should be: system prompt + historyForAIAdapter
            assertEquals(adapterArgs.messages.length, 3); 
            assertEquals(adapterArgs.messages[0].role, 'system');
            assertEquals(adapterArgs.messages[0].content, systemPromptText);
            assertEquals(adapterArgs.messages[1].role, 'user');
            assertEquals(adapterArgs.messages[1].content, userMsg1Content);
            assertEquals(adapterArgs.messages[2].role, 'assistant');
            assertEquals(adapterArgs.messages[2].content, aiMsg1Content);
            
            // Ensure original select, update, insert mocks for chat_messages were not called for the DB modification part
            const cmSelectSpy = supaConfigForRewindRpc.genericMockResults!.chat_messages!.select as Spy<any,any[],any>;
            // select is called twice: 1 for rewind point, 1 for history. Not for the actual data modification.
            assertSpyCalls(cmSelectSpy, 2); 

            const cmUpdateSpy = supaConfigForRewindRpc.genericMockResults!.chat_messages!.update as Spy<any,any[],any>;
            assertSpyCalls(cmUpdateSpy, 0); // Should not be called

            const cmInsertSpy = supaConfigForRewindRpc.genericMockResults!.chat_messages!.insert as Spy<any,any[],any>;
             assertSpyCalls(cmInsertSpy, 0); // Should not be called
        });

        await t.step("POST rewind with non-existent rewindFromMessageId returns 404", async () => {
            console.log("--- Running Rewind Error Test: Rewind Point Not Found ---");
            const rewindChatId = 'chat-rewind-err-nofound';
            const rewindFromMsgIdNonExistent = "non-existent-msg-id";
            const userMsgContent = "Test message";

            const supaConfigError: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: "Sys Prompt" }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chats': { select: { data: [{ id: rewindChatId, user_id: testUserId, system_prompt_id: testPromptId } as any], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => {
                            // First select call: Fetching the rewind point message - SIMULATE NOT FOUND
                            if (state.operation === 'select' && state.filters.some(f => f.column === 'id' && f.value === rewindFromMsgIdNonExistent) && state.selectColumns === 'created_at') {
                                console.log(`[Test Mock chat_messages.select] Simulating rewind point message not found for ID: ${rewindFromMsgIdNonExistent}`);
                                // Return the structure that causes .single() to generate PGRST116
                                return { data: null, error: null, status: 200, count: 0 }; 
                            }
                            // Other select calls not expected in this error path
                            console.error(`[Test Mock chat_messages.select] UNEXPECTED SELECT in 'Rewind Point Not Found' test.`);
                            return { data: [], error: new Error('Unexpected select call'), status: 500, count: 0 };
                        }),
                        update: { data: [], error: null, status: 200, count: 0 },
                        insert: { data: [], error: null, status: 201, count: 0 }
                    }
                }
            };

            const { deps } = createTestDeps(supaConfigError, undefined);
            const requestBody = { chatId: rewindChatId, message: userMsgContent, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgIdNonExistent };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            
            const response = await handler(req, deps);
            assertEquals(response.status, 404);
            const responseBody = await response.json();
            // Expect the actual error message from the handler which originates from the mock .single() failure
            assertEquals(responseBody.error, 'Query returned no rows (data was null after .single())');
        });

        await t.step("POST rewind with RPC error (simulating deactivation failure) returns 500", async () => {
            console.log("--- Running Rewind Error Test: RPC Failure (simulating deactivation issue) ---");
            const rewindChatId = 'chat-rewind-err-rpc';
            const rewindFromMsgId = "ai-msg-1-id-rpc-err";
            const userMsgContent = "Test message for RPC error";
            const initialTimestamp = new Date().getTime(); // Define for msgTimestamp
            const msgTimestamp = (offsetSeconds: number) => new Date(initialTimestamp + offsetSeconds * 1000).toISOString(); // Define msgTimestamp
            const rewindPointCreatedAt = msgTimestamp(0); // Use msgTimestamp for consistency, though direct new Date().toISOString() also works here
            const systemPromptText = 'Test system prompt for RPC error';

            const historyForAIAdapterRpcError: ChatMessageRow[] = [
                { id: "user-msg-1-rpc-err-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: "User Message 1 for RPC error", created_at: msgTimestamp(0), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, updated_at: msgTimestamp(0) },
                { id: rewindFromMsgId, chat_id: rewindChatId, user_id: null, role: 'assistant', content: "AI Response 1 for RPC error", created_at: msgTimestamp(1), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1}, updated_at: msgTimestamp(1) },
            ];

            const aiAdapterResponseForRpcError: AdapterResponsePayload = {
                role: 'assistant', content: "AI content when RPC fails", ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 5, completion_tokens: 5 },
            };
            
            const selectCallCountForRpcErrorTest = (() => {
                let count = 0;
                return {
                    increment: () => ++count,
                    get: () => count
                };
            })();

            const supaConfigForRewindErrRpc: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: systemPromptText }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => { 
                            selectCallCountForRpcErrorTest.increment();
                            console.log(`[Test Mock chat_messages.select RPC ERROR] Called. selectCallCount: ${selectCallCountForRpcErrorTest.get()}, Filters: ${JSON.stringify(state.filters)}`);
                            type FilterType = typeof state.filters[0]; 

                            if (selectCallCountForRpcErrorTest.get() === 1 && state.filters.some((f: FilterType) => f.column === 'id' && f.value === rewindFromMsgId) && state.selectColumns === 'created_at') { 
                                console.log(`[Test Mock chat_messages.select RPC ERROR] Matched selectCallCount 1 for rewindFromMsgId: ${rewindFromMsgId}`);
                                const rewindMessage = historyForAIAdapterRpcError.find((m: ChatMessageRow) => m.id === rewindFromMsgId);
                                return { data: rewindMessage ? [{ created_at: rewindMessage.created_at } as any] : [], error: null, status: 200, count: rewindMessage ? 1 : 0 };
                            }

                            // Second select call: Fetching active history for AI context (use 'lte')
                            if (selectCallCountForRpcErrorTest.get() === 2 && 
                                state.filters.some((f: FilterType) => f.column === 'chat_id' && f.value === rewindChatId) &&
                                state.filters.some((f: FilterType) => f.column === 'is_active_in_thread' && f.value === true) &&
                                state.filters.some((f: FilterType) => f.column === 'created_at' && f.type === 'lte')) { // <<< Updated to check for 'lte'
                                console.log('[Test Mock chat_messages.select RPC ERROR] Matched selectCallCount 2 for fetching active history with LTE.');
                                // Return the history correctly, the error is simulated later in the RPC call mock
                                const rewindPointTimestamp = historyForAIAdapterRpcError.find(m => m.id === rewindFromMsgId)?.created_at;
                                const filteredHistory = rewindPointTimestamp ? historyForAIAdapterRpcError.filter(m => new Date(m.created_at) <= new Date(rewindPointTimestamp)) : [];
                                return { data: filteredHistory as any[], error: null, status: 200, count: filteredHistory.length };
                            }
                            
                            console.error(`[Test Mock chat_messages.select RPC ERROR] UNEXPECTED SELECT (Call #${selectCallCountForRpcErrorTest.get()}) in 'RPC Failure' test. Filters: ${JSON.stringify(state.filters)}`);
                            return { data: [], error: new Error('Unexpected mock chat_messages select call in RPC error test'), status: 500, count: 0 };
                        }),
                        update: spy(async () => { throw new Error("chat_messages.update should NOT be called in RPC error test"); }),
                        insert: spy(async () => { throw new Error("chat_messages.insert should NOT be called in RPC error test"); })
                    }
                },
                rpcResults: {
                    'perform_chat_rewind': {
                        data: null,
                        error: { name: 'RpcError', message: 'Simulated RPC failure during rewind' } 
                    }
                }
            };

            const { deps, mockClientSetup } = createTestDeps(supaConfigForRewindErrRpc, aiAdapterResponseForRpcError);
            const rpcSpy = mockClientSetup.spies.rpcSpy;

            const requestBody = { chatId: rewindChatId, message: userMsgContent, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgId };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            
            const response = await handler(req, deps);
            assertEquals(response.status, 500);
            const responseBody = await response.json();
            // Assert the error propagated from the RPC mock
            assertEquals(responseBody.error, 'Simulated RPC failure during rewind');

            // Verify RPC was called (it should be called even if it returns an error)
            assertSpyCalls(rpcSpy, 1);
            assertEquals(rpcSpy.calls[0].args[0], 'perform_chat_rewind');
        });

        await t.step("POST rewind with error fetching active history returns 500", async () => {
            console.log("--- Running Rewind Error Test: History Fetch Failure ---");
            const rewindChatId = 'chat-rewind-err-history';
            const rewindFromMsgId = "ai-msg-1-id-history-err";
            const userMsgContent = "Test message";
            const rewindPointCreatedAt = new Date().toISOString();
            let selectCallCountForHistoryTest = 0;

            const supaConfigHistoryError: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: "Sys Prompt" }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chats': { select: { data: [{ id: rewindChatId, user_id: testUserId, system_prompt_id: testPromptId } as any], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => {
                            selectCallCountForHistoryTest++;
                            // First select call: Fetching the rewind point message - SUCCESS
                            if (selectCallCountForHistoryTest === 1 && state.operation === 'select' && state.filters.some(f => f.column === 'id' && f.value === rewindFromMsgId)) {
                                return { data: [{ id: rewindFromMsgId, created_at: rewindPointCreatedAt } as any], error: null, status: 200, count: 1 };
                            }
                            // Second select call: Fetching active history - SIMULATE ERROR (Use L T E)
                            if (selectCallCountForHistoryTest === 2 && state.operation === 'select' && 
                                state.filters.some((f: any) => f.column === 'chat_id' && f.value === rewindChatId) &&
                                state.filters.some((f: any) => f.column === 'is_active_in_thread' && f.value === true) &&
                                state.filters.some((f: any) => f.column === 'created_at' && f.type === 'lte')) { // <<< Updated to check for 'lte'
                                console.log(`[Test Mock chat_messages.select] Simulating error fetching active history.`);
                                return { data: [], error: new Error('Failed to retrieve chat history for AI context.'), status: 500, count: 0 };
                            }
                            console.error(`[Test Mock chat_messages.select] UNEXPECTED SELECT (Call #${selectCallCountForHistoryTest}) in 'History Fetch Failure' test. Filters: ${JSON.stringify(state.filters)}`);
                            return { data: [], error: new Error('Unexpected select call'), status: 500, count: 0 };
                        }),
                        update: spy(async (state: MockQueryBuilderState) => { 
                            // Deactivation update - SUCCESS
                            if (state.updateData && (state.updateData as any).is_active_in_thread === false) {
                                return { data: [], error: null, status: 200, count: 1 }; // Simulate 1 row updated
                            }
                            console.error(`[Test Mock chat_messages.update] UNEXPECTED UPDATE in 'History Fetch Failure' test.`);
                            return { data: [], error: new Error('Unexpected update call'), status: 500, count: 0 };
                        }),
                        insert: { data: [], error: null, status: 201, count: 0 }
                    }
                }
            };

            const { deps } = createTestDeps(supaConfigHistoryError, undefined);
            const requestBody = { chatId: rewindChatId, message: userMsgContent, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgId };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            
            const response = await handler(req, deps);
            assertEquals(response.status, 500);
            const responseBody = await response.json();
            assertEquals(responseBody.error, 'Failed to retrieve chat history for AI context.');
        });

    } finally {
        // Restore Deno.env.get specifically for this stub
        if (envGetStub) {
        envGetStub.restore(); 
            console.log("[Test Env Stub (Isolated Suite)] Restored Deno.env.get and disposed stub.");
        }
        // Ensure the global Deno.env.get is what it was before this test if somehow altered beyond the stub.
        // This is a safeguard, as stub.restore() should handle it.
        Deno.env.get = originalIsolatedTestEnvGet; 
    }
}); 

// --- Real Database Test Suite ---

// ** IMPORTANT: Replace these with the actual UUIDs of your pre-existing, active records **
const REAL_TEST_PROVIDER_ID = "807057fe-6c6c-42cd-93c3-ef7d778e142d"; // Your dummy echo provider
const REAL_TEST_PROMPT_ID = "22222222-2222-2222-2222-222222222222"; // Your test system prompt

const REAL_TEST_PROVIDER_IDENTIFIER = 'dummy-echo-provider'; // Keep consistent if factory needs it
const REAL_TEST_PROVIDER_STRING = 'dummy'; // Keep consistent if factory needs it

// Helper to generate a unique suffix for chat names etc., to avoid collisions if tests are re-run without cleanup
function generateTestRunSuffix(): string {
    return Math.random().toString(36).substring(2, 8);
}

/**
 * Sets up test data for a single real database test run.
 * Assumes provider and prompt already exist.
 * Creates a chat and a sequence of messages.
 */
async function setupTestData(
    supabaseClient: SupabaseClient<Database>, // Use admin client for setup
    userId: string,
    testRunId: string // Unique ID for this specific test execution
): Promise<{
    chatId: string,
    userMsg1Id: string,
    aiMsg1Id: string, // This will often be the rewind point
    userMsg2Id: string,
    aiMsg2Id: string,
    initialMessages: ChatMessageRow[] // Just the messages created here
}> {
    const chatId = generateUUID();
    const userMsg1Id = generateUUID();
    const aiMsg1Id = generateUUID(); // Rewind point
    const userMsg2Id = generateUUID();
    const aiMsg2Id = generateUUID();
    const now = new Date();
    const oneSecondAgo = new Date(now.getTime() - 1000);
    const twoSecondsAgo = new Date(now.getTime() - 2000);
    const threeSecondsAgo = new Date(now.getTime() - 3000);
    const fourSecondsAgo = new Date(now.getTime() - 4000);

    console.log(`[Real DB Setup ${testRunId}] Creating chat: ${chatId}`);

    // 1. Create Chat
    const { error: chatError } = await supabaseClient
        .from('chats')
        .insert({
            id: chatId,
            user_id: userId,
            // ai_provider_id: REAL_TEST_PROVIDER_ID, // This column does not exist on 'chats' table
            system_prompt_id: REAL_TEST_PROMPT_ID,
            title: `Test Chat ${testRunId}`, // Use 'title' instead of 'chat_name'
            // Add other required fields if any (e.g., created_at, updated_at managed by DB?)
        });
    if (chatError) throw new Error(`Failed to create test chat: ${chatError.message}`);

    // 2. Insert Messages
    const messagesToInsert: Omit<ChatMessageRow, 'created_at' | 'updated_at'>[] = [ // Ensure Omit is correct if `updated_at` is auto-managed
        { // User Msg 1
            id: userMsg1Id,
            chat_id: chatId,
            user_id: userId,
            role: 'user',
            content: 'User Message 1',
            is_active_in_thread: true,
            ai_provider_id: null, 
            system_prompt_id: null,
            token_usage: null,
            // inserted_at: fourSecondsAgo.toISOString(), // Use created_at if DB schema expects it
        },
        { // AI Msg 1 (Rewind Point)
            id: aiMsg1Id,
            chat_id: chatId,
            user_id: null,
            role: 'assistant',
            content: 'AI Response 1 (Rewind Target)',
            is_active_in_thread: true,
            ai_provider_id: REAL_TEST_PROVIDER_ID,
            system_prompt_id: REAL_TEST_PROMPT_ID,
            token_usage: { prompt_tokens: 10, completion_tokens: 10 } as Json,
            // inserted_at: threeSecondsAgo.toISOString(),
        },
        { // User Msg 2
            id: userMsg2Id,
            chat_id: chatId,
            user_id: userId,
            role: 'user',
            content: 'User Message 2',
            is_active_in_thread: true,
            ai_provider_id: null,
            system_prompt_id: null,
            token_usage: null,
            // inserted_at: twoSecondsAgo.toISOString(),
        },
        { // AI Msg 2
            id: aiMsg2Id,
            chat_id: chatId,
            user_id: null,
            role: 'assistant',
            content: 'AI Response 2',
            is_active_in_thread: true,
            ai_provider_id: REAL_TEST_PROVIDER_ID,
            system_prompt_id: REAL_TEST_PROMPT_ID,
            token_usage: { prompt_tokens: 10, completion_tokens: 10 } as Json,
            // inserted_at: oneSecondAgo.toISOString(),
        },
    ];
    
    // Add created_at with distinct timestamps for ordering if DB doesn't auto-set on insert appropriately for tests
    const messagesWithTimestamps = messagesToInsert.map((msg, index) => ({
        ...msg,
        created_at: new Date(now.getTime() - (messagesToInsert.length - index) * 1000).toISOString()
    }));


    const { data: insertedMessages, error: messageError } = await supabaseClient
        .from('chat_messages')
        .insert(messagesWithTimestamps) // Use messagesWithTimestamps
        .select(); 

    if (messageError) {
        await supabaseClient.from('chats').delete().eq('id', chatId);
        throw new Error(`Failed to insert test messages: ${messageError.message}`);
    }
    if (!insertedMessages || insertedMessages.length !== messagesWithTimestamps.length) {
        await supabaseClient.from('chats').delete().eq('id', chatId);
        throw new Error(`Failed to insert all test messages. Expected ${messagesWithTimestamps.length}, got ${insertedMessages?.length}`);
    }

    console.log(`[Real DB Setup ${testRunId}] Successfully created chat and ${insertedMessages.length} messages.`);

    return {
        chatId: chatId,
        userMsg1Id: userMsg1Id,
        aiMsg1Id: aiMsg1Id,
        userMsg2Id: userMsg2Id,
        aiMsg2Id: aiMsg2Id,
        initialMessages: insertedMessages as ChatMessageRow[]
    };
}

/**
 * Cleans up data created by setupTestData for a specific test run.
 * Only deletes the chat and its messages. Does NOT touch provider/prompt.
 */
async function cleanupTestData(supabaseClient: SupabaseClient<Database>, chatId: string, testRunId: string) {
    console.log(`[Real DB Cleanup ${testRunId}] Deleting chat: ${chatId}`);
    // RLS might prevent deleting messages directly if not owner/admin.
    // Deleting the chat should cascade delete messages if FK constraint is set up correctly.
    const { error: deleteChatError } = await supabaseClient
        .from('chats')
        .delete()
        .eq('id', chatId);

    if (deleteChatError) {
        console.error(`[Real DB Cleanup ${testRunId}] WARN: Failed to delete test chat ${chatId}: ${deleteChatError.message}. Manual cleanup might be needed.`);
    } else {
        console.log(`[Real DB Cleanup ${testRunId}] Successfully deleted chat ${chatId}.`);
    }

    // Optional: Verify messages are gone (might be slow)
    // const { count: messageCount } = await supabaseClient
    //     .from('chat_messages')
    //     .select('*', { count: 'exact', head: true })
    //     .eq('chat_id', chatId);
    // if (messageCount !== 0) {
    //     console.error(`[Real DB Cleanup ${testRunId}] WARN: Messages for chat ${chatId} still exist after chat deletion.`);
    // }
}

// Global variable to hold the authenticated client for the test user
// let testUserClient: SupabaseClient<Database> | null = null; // No longer needed
let realTestAuthenticatedUserId: string | null = null; // Renamed to avoid conflict with mock's testUserId
let testUserAccessToken: string | null = null; // To store the token after signup

Deno.test("Chat Function Rewind Test (Real Database)", { sanitizeResources: false, sanitizeOps: false }, async (t) => {
    const supabaseUrl = originalDenoEnvGet('SUPABASE_URL');
    const supabaseAnonKey = originalDenoEnvGet('SUPABASE_ANON_KEY');
    const supabaseServiceKey = originalDenoEnvGet('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn("WARN: Real Database Tests SKIPPED. Missing SUPABASE_URL or SUPABASE_ANON_KEY.");
        return;
    }
    if (!supabaseServiceKey) {
        // Log a warning but proceed if service key is missing, cleanup will be manual for users.
        console.warn("WARN: Real Database Tests will run, but test user cleanup requires SUPABASE_SERVICE_ROLE_KEY.");
    }

    let supabaseAdminClient: SupabaseClient<Database> | null = null;
    if (supabaseServiceKey) {
        supabaseAdminClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
        });
    } else {
        console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY is required for test data setup and cleanup. Skipping real database tests.");
        return; // Exit if no service key, as setup/cleanup are essential
    }

    const realSupabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey); // For user-level interactions if needed

    const testUserEmail = `test-user-rewind-${Date.now()}@example.com`;
    const testUserPassword = "password123";
    // let testUserAccessToken: string | null = null; // No longer needed as a separate variable here
    // let testUserIdReal: string | null = null; // Use realTestAuthenticatedUserId directly

    await t.step("Setup Real Test User", async () => {
        const { data: signUpData, error: signUpError } = await realSupabaseClient.auth.signUp({
            email: testUserEmail,
            password: testUserPassword,
        });
        if (signUpError) throw new Error(`Failed to sign up test user: ${signUpError.message}`);
        assertExists(signUpData.session, "Test user session not found after sign up.");
        assertExists(signUpData.user, "Test user data missing after sign up.");
        assertExists(signUpData.session.access_token, "Access token missing after sign up.");
        
        testUserAccessToken = signUpData.session.access_token; // Store globally
        realTestAuthenticatedUserId = signUpData.user.id;
        console.log(`[Real DB Test Setup] Signed up and in user: ${realTestAuthenticatedUserId}`);
    });

    await t.step("Basic rewind functionality (real database)", async () => {
        const testRunId = `basic-rewind-${generateTestRunSuffix()}`;
        const testData = await setupTestData(supabaseAdminClient!, realTestAuthenticatedUserId!, testRunId);
        assertExists(testData, "Test data setup failed");

        const reqBody: ChatApiRequest = {
            message: "User message after rewind",
            providerId: REAL_TEST_PROVIDER_ID,
            promptId: REAL_TEST_PROMPT_ID,
            chatId: testData.chatId,
            rewindFromMessageId: testData.aiMsg1Id // Rewind from the first AI message
        };
        // Use the globally stored access token
        assertExists(testUserAccessToken, "Access token was not set during test user setup.");

        const req = new Request(`http://localhost/chat`, { // Use dummy URL
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                'Authorization': `Bearer ${testUserAccessToken}`,
                    },
            body: JSON.stringify(reqBody),
                });

        // Call the actual handler
                const response = await handler(req, defaultDeps);
        const responseText = await response.clone().text(); // Clone for logging if needed
        assertEquals(response.status, 200, `Basic Rewind Failed: Status ${response.status}, Body: ${responseText}`);
                const responseBody = await response.json();
        assertExists(responseBody, "Basic Rewind Failed: Response body is empty");

        // Assertions on the response body (new assistant message returned by RPC)
        // The RPC calls the adapter, which for the dummy provider, echoes.
        assertExists(responseBody.data, "Response data should exist");
        // Assuming RPC returns a single object, not an array, when 1 row is returned.
        assertObjectMatch(responseBody.data, {
            // id: string, // Cannot predict the new ID
            chat_id: testData.chatId,
            user_id: null, // Assistant messages have null user_id
            role: "assistant",
            content: "Echo from Dummy: User message after rewind", // Dummy provider prepends. Hardcode expected value for clarity.
            is_active_in_thread: true,
            // token_usage: { prompt_tokens: 0, completion_tokens: 10, total_tokens: 10 }, // Cannot deep match Json easily with assertObjectMatch
            ai_provider_id: REAL_TEST_PROVIDER_ID,
            system_prompt_id: REAL_TEST_PROMPT_ID,
        });

        // --- Verification: Check DB state after rewind ---
        const { data: messagesAfter, error: fetchError } = await supabaseAdminClient!
            .from('chat_messages')
            .select('id, content, is_active_in_thread')
            .eq('chat_id', testData.chatId)
            .order('created_at', { ascending: true });
        
        assertExists(messagesAfter, "Failed to fetch messages after rewind");
        assertEquals(fetchError, null, "Error fetching messages after rewind");

        // Find the specific messages we expect to be deactivated
        const userMsg2After = messagesAfter.find(m => m.id === testData.userMsg2Id);
        const aiMsg2After = messagesAfter.find(m => m.id === testData.aiMsg2Id);
        const newUserMsgAfter = messagesAfter.find(m => m.content === reqBody.message);
        // Access the id directly from responseBody.data
        const newAiMsgAfter = messagesAfter.find(m => m.id === responseBody.data.id);

        assertExists(userMsg2After, "Original user message 2 not found after rewind");
        assertEquals(userMsg2After.is_active_in_thread, false, "User message 2 should be inactive after rewind");

        assertExists(aiMsg2After, "Original AI message 2 not found after rewind");
        assertEquals(aiMsg2After.is_active_in_thread, false, "AI message 2 should be inactive after rewind");
        
        assertExists(newUserMsgAfter, "New user message not found after rewind");
        assertEquals(newUserMsgAfter.is_active_in_thread, true, "New user message should be active after rewind");
        
        assertExists(newAiMsgAfter, "New AI message (from response) not found after rewind");
        assertEquals(newAiMsgAfter.is_active_in_thread, true, "New AI message should be active after rewind");

        console.log("Basic Rewind Test (Real DB): DB state verified successfully.");

        // Cleanup
        await cleanupTestData(supabaseAdminClient!, testData.chatId, testRunId);
    });

    await t.step("Rewind with non-existent message ID (real database)", async () => {
        const testRunId = `nonexist-rewind-${generateTestRunSuffix()}`;
        const testData = await setupTestData(supabaseAdminClient!, realTestAuthenticatedUserId!, testRunId);
        assertExists(testData, "Test data setup failed");
        const nonExistentMsgId = generateUUID();

        const reqBody: ChatApiRequest = {
            message: "User message for non-existent rewind",
            providerId: REAL_TEST_PROVIDER_ID,
            promptId: REAL_TEST_PROMPT_ID,
            chatId: testData.chatId,
            rewindFromMessageId: nonExistentMsgId
        };
        // Use the globally stored access token
        assertExists(testUserAccessToken, "Access token was not set during test user setup.");

        const req = new Request(`http://localhost/chat`, { // Use dummy URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testUserAccessToken}`,
            },
            body: JSON.stringify(reqBody),
        });

        const response = await handler(req, defaultDeps);
        const responseText = await response.clone().text();
        // EXPECT 404 because the handler checks for the rewind message ID before calling RPC
        assertEquals(response.status, 404, `Non-existent Rewind ID Test Failed: Status ${response.status}, Expected 404, Body: ${responseText}`);

        // Cleanup
        await cleanupTestData(supabaseAdminClient!, testData.chatId, testRunId);
    });

    await t.step("Rewind without providing chatId (real database)", async () => {
        // No setup needed as we expect failure before DB interaction specific to rewind
        const reqBody: ChatApiRequest = {
            message: "User message for missing chat ID rewind",
            providerId: REAL_TEST_PROVIDER_ID,
            promptId: REAL_TEST_PROMPT_ID,
            // chatId is omitted
            rewindFromMessageId: generateUUID() // A dummy rewind ID
        };
        // Use the globally stored access token
        assertExists(testUserAccessToken, "Access token was not set during test user setup.");

        const req = new Request(`http://localhost/chat`, { // Use dummy URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testUserAccessToken}`,
            },
            body: JSON.stringify(reqBody),
        });

        const response = await handler(req, defaultDeps);
        const responseText = await response.clone().text();
        // EXPECT 400 because rewind needs a chat ID
        assertEquals(response.status, 400, `Missing Chat ID Rewind Test Failed: Status ${response.status}, Expected 400, Body: ${responseText}`);
    });

    // --- Teardown Real Test User (Optional but good practice) ---
    await t.step("Teardown Real Test User", async () => {
         if (realTestAuthenticatedUserId && supabaseAdminClient) {
            try {
                console.log(`[Real DB Test Teardown] Attempting to delete user: ${realTestAuthenticatedUserId}`);
                const { error: deleteError } = await supabaseAdminClient.auth.admin.deleteUser(realTestAuthenticatedUserId);
                if (deleteError) {
                    console.error(`[Real DB Test Teardown] Failed to delete test user ${realTestAuthenticatedUserId}:`, deleteError);
                } else {
                    console.log(`[Real DB Test Teardown] Successfully deleted test user ${realTestAuthenticatedUserId}.`);
                }
            } catch (err) {
                 console.error(`[Real DB Test Teardown] Error during user deletion for ${realTestAuthenticatedUserId}:`, err);
            }
         } else if (!supabaseAdminClient) {
               console.warn(`[Real DB Test Teardown] supabaseAdminClient not initialized. Skipping user deletion for ${realTestAuthenticatedUserId}.`);
         }
    }); // Close teardown step

}); // Close the main Deno.test block for "Real Database"

// Ensure no other definitions are accidentally left open after this point.
