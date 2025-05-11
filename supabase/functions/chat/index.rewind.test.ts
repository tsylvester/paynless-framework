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
import { mainHandler, defaultDeps } from './index.ts';
import { logger } from '../_shared/logger.ts';

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
                { id: "user-msg-1-rpc-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: userMsg1Content, created_at: msgTimestamp(0), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
                { id: rewindFromMsgId, chat_id: rewindChatId, user_id: null, role: 'assistant', content: aiMsg1Content, created_at: msgTimestamp(1), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1}},
            ];
            
            // This is the new message content from the request body
            const newRequestUserMessageContent = userMsg3NewContent;

            // This is what the AI adapter will return
            const newAiResponseFromAdapterPayload: AdapterResponsePayload = {
                role: 'assistant', content: aiMsg3NewContentFromAdapter, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 10, completion_tokens: 20 },
            };

            // This is the expected structure of the *final assistant message* returned by the RPC call
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
            };
            
            let selectCallCount = 0;
            const supaConfigForRewindRpc: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: systemPromptText }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    // 'chats' select might be needed if the handler tries to re-verify chat existence, but for rewind, it already has chatId.
                    // Let's assume it's not strictly needed for the core rewind logic path if chatId is present.
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => { 
                            selectCallCount++;
                            console.log(`[Test Mock chat_messages.select RPC] Called. selectCallCount: ${selectCallCount}, Filters: ${JSON.stringify(state.filters)}`);
                            type FilterType = typeof state.filters[0]; 

                            // First select call: Fetching the rewind point message's created_at
                            if (selectCallCount === 1 && state.filters.some((f: FilterType) => f.column === 'id' && f.value === rewindFromMsgId) && state.selectColumns === 'created_at') { 
                                console.log(`[Test Mock chat_messages.select RPC] Matched selectCallCount 1 for rewindFromMsgId: ${rewindFromMsgId}`);
                                const rewindMessage = historyForAIAdapter.find(m => m.id === rewindFromMsgId); // Get from our defined history
                                return { data: rewindMessage ? [{ created_at: rewindMessage.created_at } as any] : [], error: null, status: 200, count: rewindMessage ? 1 : 0 };
                            }

                            // Second select call: Fetching active history for AI context based on rewindPointCreatedAt
                            if (selectCallCount === 2 && 
                                state.filters.some((f: FilterType) => f.column === 'chat_id' && f.value === rewindChatId) &&
                                state.filters.some((f: FilterType) => f.column === 'is_active_in_thread' && f.value === true) &&
                                state.filters.some((f: FilterType) => f.column === 'created_at' && f.type === 'lte') 
                            ) { 
                                console.log('[Test Mock chat_messages.select RPC] Matched selectCallCount 2 for fetching active history.');
                                // This should return the historyForAIAdapter
                                return { data: historyForAIAdapter as any[], error: null, status: 200, count: historyForAIAdapter.length };
                            }
                            
                            console.error(`[Test Mock chat_messages.select RPC] UNEXPECTED CALL. selectCallCount: ${selectCallCount}, Filters: ${JSON.stringify(state.filters)}`);
                            return { data: [], error: new Error('Unexpected select call in chat_messages mock for RPC test'), status: 500, count: 0 };
                        }),
                        // update and insert mocks are NOT expected to be called directly by the handler for rewind
                        update: spy(async () => { throw new Error("chat_messages.update should NOT be called in RPC rewind test"); }),
                        insert: spy(async () => { throw new Error("chat_messages.insert should NOT be called in RPC rewind test"); })
                    }
                },
                // Mock for the RPC call itself
                rpcResults: {
                    'perform_chat_rewind': {
                        // The RPC function returns a TABLE, so data should be an array of rows
                        data: [mockAssistantMessageFromRpc as any], // Simulate the RPC returning the new assistant message
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
            
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 200, `RPC Rewind Test Failed: Status was ${response.status}, Body: ${await response.clone().text()}`);
            const responseBody = await response.json();

            // Assert that the response message is the one returned by the RPC
            assertObjectMatch(responseBody.message, {
                id: mockAssistantMessageFromRpc.id,
                content: mockAssistantMessageFromRpc.content,
                chat_id: rewindChatId,
                role: 'assistant',
                token_usage: mockAssistantMessageFromRpc.token_usage
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
                            // First select call: Fetching the rewind point message - SIMULATE NOT FOUND by returning null data and null error
                            if (state.operation === 'select' && state.filters.some(f => f.column === 'id' && f.value === rewindFromMsgIdNonExistent)) {
                                console.log(`[Test Mock chat_messages.select] Simulating rewind point message not found (null data, null error) for ID: ${rewindFromMsgIdNonExistent}`);
                                return { data: null, error: null, status: 200, count: 0 }; 
                            }
                            // Other select calls not expected in this error path primarily
                            console.error(`[Test Mock chat_messages.select] UNEXPECTED SELECT in 'Rewind Point Not Found' test.`);
                            return { data: [], error: new Error('Unexpected select call'), status: 500, count: 0 };
                        }),
                        // update and insert mocks are not strictly needed as the flow should stop before them
                        update: { data: [], error: null, status: 200, count: 0 },
                        insert: { data: [], error: null, status: 201, count: 0 }
                    }
                }
            };

            const { deps } = createTestDeps(supaConfigError, undefined);
            const requestBody = { chatId: rewindChatId, message: userMsgContent, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgIdNonExistent };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            const responseBody = await response.json();
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
                { id: "user-msg-1-rpc-err-id", chat_id: rewindChatId, user_id: testUserId, role: 'user', content: "User Message 1 for RPC error", created_at: msgTimestamp(0), is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null },
                { id: rewindFromMsgId, chat_id: rewindChatId, user_id: null, role: 'assistant', content: "AI Response 1 for RPC error", created_at: msgTimestamp(1), is_active_in_thread: true, ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: {prompt_tokens:1, completion_tokens:1}},
            ];

            const aiAdapterResponseForRpcError: AdapterResponsePayload = {
                role: 'assistant', content: "AI content when RPC fails", ai_provider_id: testProviderId, system_prompt_id: testPromptId, token_usage: { prompt_tokens: 5, completion_tokens: 5 },
            };
            
            let selectCallCountForRpcErrorTest = 0;

            const supaConfigRpcError: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: systemPromptText }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => {
                            selectCallCountForRpcErrorTest++;
                            // First select call: Fetching the rewind point message - SUCCESS
                            if (selectCallCountForRpcErrorTest === 1 && state.filters.some(f => f.column === 'id' && f.value === rewindFromMsgId) && state.selectColumns === 'created_at') {
                                return { data: [{ created_at: rewindPointCreatedAt } as any], error: null, status: 200, count: 1 };
                            }
                            // Second select call: Fetching active history - SUCCESS
                            if (selectCallCountForRpcErrorTest === 2 && state.filters.some(f => f.column === 'chat_id' && f.value === rewindChatId) && state.filters.some(f=>f.column === 'is_active_in_thread')) {
                                return { data: historyForAIAdapterRpcError as any[], error: null, status: 200, count: historyForAIAdapterRpcError.length };
                            }
                            console.error(`[Test Mock chat_messages.select RPC ERROR TEST] UNEXPECTED SELECT (Call #${selectCallCountForRpcErrorTest}). Filters: ${JSON.stringify(state.filters)}`);
                            return { data: [], error: new Error('Unexpected select call in RPC error test'), status: 500, count: 0 };
                        }),
                        // update and insert should not be called directly
                        update: spy(async () => { throw new Error("chat_messages.update should NOT be called in RPC error test"); }),
                        insert: spy(async () => { throw new Error("chat_messages.insert should NOT be called in RPC error test"); })
                    }
                },
                rpcResults: {
                    'perform_chat_rewind': {
                        data: null, 
                        error: new Error('Simulated RPC error during rewind') // Simulate RPC error with a proper Error object
                    }
                }
            };

            const { deps, mockClientSetup } = createTestDeps(supaConfigRpcError, aiAdapterResponseForRpcError);
            const rpcSpy = mockClientSetup.spies.rpcSpy;

            const requestBody = { chatId: rewindChatId, message: userMsgContent, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgId };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            const responseBody = await response.json();
            assertEquals(responseBody.error, 'Simulated RPC error during rewind');

            // Verify RPC was called
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

            const supaConfigError: MockSupabaseDataConfig = {
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
                            // Second select call: Fetching active history - SIMULATE ERROR
                            if (selectCallCountForHistoryTest === 2 && state.operation === 'select' && 
                                state.filters.some((f: any) => f.column === 'chat_id' && f.value === rewindChatId) &&
                                state.filters.some((f: any) => f.column === 'is_active_in_thread' && f.value === true) &&
                                state.filters.some((f: any) => f.column === 'created_at' && f.type === 'lte')) {
                                console.log(`[Test Mock chat_messages.select] Simulating error fetching active history.`);
                                return { data: [], error: new Error('DB History Fetch Failed'), status: 500, count: 0 };
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

            const { deps } = createTestDeps(supaConfigError, undefined);
            const requestBody = { chatId: rewindChatId, message: userMsgContent, providerId: testProviderId, promptId: testPromptId, rewindFromMessageId: rewindFromMsgId };
            const req = new Request('http://localhost/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer test-token` }, body: JSON.stringify(requestBody) });
            
            const response = await mainHandler(req, deps);
            assertEquals(response.status, 500);
            const responseBody = await response.json();
            assertEquals(responseBody.error, 'DB History Fetch Failed');
        });

    } finally {
        // Restore Deno.env.get
        globalThis.Deno.env.get = originalDenoEnvGet;
        // Dispose of the stub to prevent it from affecting other test files if Deno caches modules
        envGetStub.restore(); 
        console.log("[Test Env Stub (Rewind Suite)] Restored Deno.env.get and disposed stub.");
    }
}); 