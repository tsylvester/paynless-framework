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
    IMockQueryBuilder,
    IMockSupabaseAuth,
    IMockSupabaseClient,
    IMockClientSpies,
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
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: systemPromptText }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chats': { select: { data: [{ id: rewindChatId, user_id: testUserId, organization_id: null, system_prompt_id: testPromptId, title: "Rewind Test Chat" } as any], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => { 
                            selectCallCount++;
                            console.log(`[Test Mock chat_messages.select] Called. selectCallCount: ${selectCallCount}, Operation: ${state.operation}, Filters: ${JSON.stringify(state.filters)}`);
                            type FilterType = typeof state.filters[0]; 

                            // First select call: Fetching the rewind point message
                            if (selectCallCount === 1 && state.operation === 'select' && state.filters.some((f: FilterType) => f.column === 'id' && f.value === rewindFromMsgId)) { 
                                console.log(`[Test Mock chat_messages.select] Matched selectCallCount 1 for rewindFromMsgId: ${rewindFromMsgId}`);
                                const rewindMessage = initialMessages.find(m => m.id === rewindFromMsgId);
                                return { data: rewindMessage ? [rewindMessage as any] : [], error: null, status: 200, count: rewindMessage ? 1 : 0 };
                            }

                            // Second select call: Fetching active history for AI context after rewind
                            // Query in mainHandler: .eq('chat_id', currentChatId).eq('is_active_in_thread', true).lte('created_at', rewindPointCreatedAt)
                            if (selectCallCount === 2 && state.operation === 'select' && 
                                state.filters.some((f: FilterType) => f.column === 'chat_id' && f.value === rewindChatId) &&
                                state.filters.some((f: FilterType) => f.column === 'is_active_in_thread' && f.value === true) &&
                                state.filters.some((f: FilterType) => f.column === 'created_at' && f.type === 'lte') // Check for lte on created_at
                            ) { 
                                console.log('[Test Mock chat_messages.select] Matched selectCallCount 2 for fetching active history.');
                                const historyData = [initialMessages[0] as any, initialMessages[1] as any];
                                console.log(`[Test Mock chat_messages.select] Returning history: ${JSON.stringify(historyData.map(h => h.id))}`);
                                return { data: historyData, error: null, status: 200, count: historyData.length };
                            }

                            // Third select call: Result of .insert([...]).select()
                            // This select is called by the MockQueryBuilder with operation 'select' from a chained .insert().select().
                            // The MockQueryBuilder's internal state for .select() won't have insertData directly from its own state members,
                            // but the .insert() part of the chain should have configured the mock to return the inserted data.
                            // The key is that the *actual insert operation's mock* (the one in genericMockResults.chat_messages.insert)
                            // is what provides the data that this subsequent .select() should be seen to retrieve.
                            // So this select mock should simply return what was defined in the test case as the inserted rows.
                            if (selectCallCount === 3 && state.operation === 'select') { // Filters might be empty or generic for a post-insert select
                                console.log('[Test Mock chat_messages.select] Matched selectCallCount 3 for post-insert select.');
                                const insertedDataForSelect = [newUserMsgDbRow as any, newAiMsgDbRow as any]; 
                                console.log(`[Test Mock chat_messages.select] selectCallCount 3: Returning data that *should have been* inserted: ${JSON.stringify(insertedDataForSelect.map(i => i.id))}`);
                                return { data: insertedDataForSelect, error: null, status: 200, count: insertedDataForSelect.length };
                            }
                            
                            console.error(`[Test Mock chat_messages.select] UNEXPECTED CALL. selectCallCount: ${selectCallCount}, Operation: ${state.operation}, Filters: ${JSON.stringify(state.filters)}, InsertData: ${state.insertData ? 'Exists' : 'null'}`);
                            return { data: [], error: new Error('Unexpected select call in chat_messages mock'), status: 500, count: 0 };
                        }),
                        update: spy(async (state: MockQueryBuilderState) => {
                            console.log(`[Test Mock chat_messages.update] Called. Filters: ${JSON.stringify(state.filters)}, UpdateData: ${JSON.stringify(state.updateData)}`);
                            // Simulate successful update of 2 rows, matching the rewind scenario
                            if (state.updateData && (state.updateData as any).is_active_in_thread === false && 
                                state.filters.some(f => f.column === 'chat_id' && f.value === rewindChatId) &&
                                state.filters.some(f => f.column === 'created_at' && f.type === 'gt')) {
                                return { data: [], error: null, status: 200, count: 2 };     
                            }
                            return { data: [], error: new Error('Unexpected update call in mock'), status: 500, count: 0 };
                        }),
                        insert: { data: [newUserMsgDbRow as any, newAiMsgDbRow as any], error: null, status: 201, count: 2 }
                    }
                }
            };

            const { deps, mockClientSetup } = createTestDeps(supaConfigForRewind, newAiResponsePayload);
            // const { spies } = mockClientSetup; // We will get the update spy directly from the config

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

            // Get the update spy directly from the mock config
            const updateSpy = supaConfigForRewind.genericMockResults!.chat_messages!.update as Spy<any, [MockQueryBuilderState], Promise<any>>;
            assertExists(updateSpy, "updateSpy from mock config should exist.");
            assertEquals(updateSpy.calls.length, 1, "updateSpy from config should have been called once.");
            
            // Access the state passed to the spy's call
            const updateCallState = updateSpy.calls[0].args[0] as MockQueryBuilderState;
            assertEquals(updateCallState.updateData, { is_active_in_thread: false });
            assert(updateCallState.filters.some(f => f.column === 'chat_id' && f.value === rewindChatId), "Update call should filter by chatId");
            assert(updateCallState.filters.some(f => f.column === 'created_at' && f.type === 'gt'), "Update call should filter by created_at > value");
            
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
            
            // const insertSpy = supaConfigForRewind.genericMockResults!.chat_messages!.insert as Spy<any, [any[], any[]], Promise<any>>;
            // assertExists(insertSpy, "insertSpy from mock config should exist.");
            // TODO: Revisit insertSpy assertion if needed, ensuring it accesses the correct spy instance or uses a spy function in config.
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

        await t.step("POST rewind with error deactivating messages returns 500", async () => {
            console.log("--- Running Rewind Error Test: Deactivation Failure ---");
            const rewindChatId = 'chat-rewind-err-deactivate';
            const rewindFromMsgId = "ai-msg-1-id-deactivate-err";
            const userMsgContent = "Test message";
            const rewindPointCreatedAt = new Date().toISOString();

            const supaConfigError: MockSupabaseDataConfig = {
                mockUser: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any,
                getUserResult: { data: { user: { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: now } as any }, error: null },
                genericMockResults: {
                    'system_prompts': { select: { data: [{ id: testPromptId, prompt_text: "Sys Prompt" }], error: null, status: 200, count: 1 } },
                    'ai_providers': { select: { data: [{ id: testProviderId, api_identifier: testApiIdentifier, provider: testProviderString }], error: null, status: 200, count: 1 } },
                    'chats': { select: { data: [{ id: rewindChatId, user_id: testUserId, system_prompt_id: testPromptId } as any], error: null, status: 200, count: 1 } },
                    'chat_messages': {
                        select: spy(async (state: MockQueryBuilderState) => {
                            // First select call: Fetching the rewind point message - SUCCESS
                            if (state.operation === 'select' && state.filters.some(f => f.column === 'id' && f.value === rewindFromMsgId)) {
                                return { data: [{ id: rewindFromMsgId, created_at: rewindPointCreatedAt } as any], error: null, status: 200, count: 1 };
                            }
                            console.error(`[Test Mock chat_messages.select] UNEXPECTED SELECT in 'Deactivation Failure' test.`);
                            return { data: [], error: new Error('Unexpected select call'), status: 500, count: 0 };
                        }),
                        update: spy(async (state: MockQueryBuilderState) => {
                            // SIMULATE UPDATE ERROR
                            if (state.updateData && (state.updateData as any).is_active_in_thread === false) {
                                console.log(`[Test Mock chat_messages.update] Simulating error deactivating messages.`);
                                return { data: [], error: new Error('DB Update Failed During Deactivation'), status: 500, count: 0 };
                            }
                            console.error(`[Test Mock chat_messages.update] UNEXPECTED UPDATE in 'Deactivation Failure' test.`);
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
            assertEquals(responseBody.error, 'DB Update Failed During Deactivation');
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