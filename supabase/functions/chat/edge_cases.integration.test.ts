import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.220.1/assert/mod.ts";
import type { 
  ChatApiRequest, 
  TokenUsage, 
  AiModelExtendedConfig,
  ChatHandlerDeps,
  ILogger,
  AiProviderAdapter
} from "../_shared/types.ts";
import { 
  CHAT_FUNCTION_URL, 
  type ProcessedResourceInfo,
  currentTestDeps,
  mockAiAdapter,
  supabaseAdminClient,
  getTestUserAuthToken
} from "../_shared/_integration.test.utils.ts"; 
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import type { MockQueryBuilderState, MockResolveQueryResult, MockPGRSTError } from "../_shared/supabase.mock.ts";
import { handler, defaultDeps } from "./index.ts"; // Static import
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { Database, Json } from "../types_db.ts";
import type { ChatMessageRow } from './_chat.test.utils.ts';

// Helper function to create ChatHandlerDeps
const createDepsForEdgeCaseTest = (): ChatHandlerDeps => {
  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    logger: currentTestDeps.logger,
    getAiProviderAdapter: (
      _providerApiIdentifier: string,
      _providerDbConfig: Json | null,
      _apiKey: string,
      _loggerFromDep?: ILogger
    ): AiProviderAdapter => mockAiAdapter,
    supabaseClient: currentTestDeps.supabaseClient || undefined,
    createSupabaseClient: currentTestDeps.createSupabaseClient || defaultDeps.createSupabaseClient,
  };
  return deps;
};

// Helper to generate a unique suffix for chat names etc., to avoid collisions if tests are re-run without cleanup
function generateTestRunSuffix(): string {
    return Math.random().toString(36).substring(2, 8);
}

/**
 * Sets up test data for a single real database test run.
 * Assumes provider and prompt already exist.
 * Creates a chat and a sequence of messages.
 */
async function setupRewindTestData(
    supabaseClient: SupabaseClient<Database>, // Use admin client for setup
    userId: string,
    providerId: string,
    promptId: string,
    testRunId: string // Unique ID for this specific test execution
): Promise<{
    chatId: string,
    userMsg1Id: string,
    aiMsg1Id: string, // This will often be the rewind point
    userMsg2Id: string,
    aiMsg2Id: string,
}> {
    const chatId = crypto.randomUUID();
    const userMsg1Id = crypto.randomUUID();
    const aiMsg1Id = crypto.randomUUID(); // Rewind point
    const userMsg2Id = crypto.randomUUID();
    const aiMsg2Id = crypto.randomUUID();

    console.log(`[Real DB Setup ${testRunId}] Creating chat: ${chatId}`);

    // 1. Create Chat
    const { error: chatError } = await supabaseClient
        .from('chats')
        .insert({
            id: chatId,
            user_id: userId,
            system_prompt_id: promptId,
            title: `Test Chat ${testRunId}`,
        });
    if (chatError) throw new Error(`Failed to create test chat: ${chatError.message}`);

    // 2. Insert Messages
    const messagesToInsert: Omit<ChatMessageRow, 'created_at' | 'updated_at' | 'metadata' | 'version'>[] = [
        { id: userMsg1Id, chat_id: chatId, user_id: userId, role: 'user', content: 'User Message 1', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null },
        { id: aiMsg1Id, chat_id: chatId, user_id: null, role: 'assistant', content: 'AI Response 1 (Rewind Target)', is_active_in_thread: true, ai_provider_id: providerId, system_prompt_id: promptId, token_usage: { prompt_tokens: 10, completion_tokens: 10 } as Json, error_type: null, response_to_message_id: userMsg1Id },
        { id: userMsg2Id, chat_id: chatId, user_id: userId, role: 'user', content: 'User Message 2', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null },
        { id: aiMsg2Id, chat_id: chatId, user_id: null, role: 'assistant', content: 'AI Response 2', is_active_in_thread: true, ai_provider_id: providerId, system_prompt_id: promptId, token_usage: { prompt_tokens: 10, completion_tokens: 10 } as Json, error_type: null, response_to_message_id: userMsg2Id },
    ];
    
    const messagesWithTimestamps = messagesToInsert.map((msg, index) => ({
        ...msg,
        created_at: new Date(Date.now() - (messagesToInsert.length - index) * 2000).toISOString()
    }));

    const { data: insertedMessages, error: messageError } = await supabaseClient
        .from('chat_messages')
        .insert(messagesWithTimestamps)
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

    return { chatId, userMsg1Id, aiMsg1Id, userMsg2Id, aiMsg2Id };
}

/**
 * Cleans up data created by setupTestData for a specific test run.
 */
async function cleanupRewindTestData(supabaseClient: SupabaseClient<Database>, chatId: string, testRunId: string) {
    console.log(`[Real DB Cleanup ${testRunId}] Deleting chat: ${chatId}`);
    const { error: deleteChatError } = await supabaseClient
        .from('chats')
        .delete()
        .eq('id', chatId);

    if (deleteChatError) {
        console.error(`[Real DB Cleanup ${testRunId}] WARN: Failed to delete test chat ${chatId}: ${deleteChatError.message}. Manual cleanup might be needed.`);
    } else {
        console.log(`[Real DB Cleanup ${testRunId}] Successfully deleted chat ${chatId}.`);
    }
}


export async function runEdgeCaseTests(
  t: Deno.TestContext,
  initializeTestGroupEnvironment: (options?: {
    userProfile?: Partial<{ role: "user" | "admin"; first_name: string }>;
    initialWalletBalance?: number;
  }) => Promise<{ primaryUserId: string; processedResources: ProcessedResourceInfo<any>[]; }>
) {
  await t.step("[Edge Case] Insufficient balance BEFORE AI call", async () => {
    const initialBalance = 5;
    const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({
      userProfile: { first_name: "Low Balance User" },
      initialWalletBalance: initialBalance,
    });
    // Removed dynamic imports, using static ones now
    const currentAuthToken = getTestUserAuthToken();
    assertExists(currentAuthToken, "Test user auth token was not set.");
    assertExists(supabaseAdminClient, "Shared Supabase Admin Client is not initialized.");
    assertExists(currentTestDeps, "Shared Test Deps are not initialized.");
    assertExists(handler, "Chat handler is not available from utils."); // cHandler is now static
    assertExists(mockAiAdapter, "Mock AI adapter is not available from utils.");

    const { data: providerData, error: providerError } = await supabaseAdminClient
      .from("ai_providers")
      .select("id, api_identifier, config")
      .eq("api_identifier", "gpt-3.5-turbo-test")
      .single();

    if (providerError) throw providerError;
    assertExists(providerData, "Provider data was null, could not fetch 'gpt-3.5-turbo-test'.");
    const actualProviderDbId = providerData.id;

    const requestBody: ChatApiRequest = {
      providerId: actualProviderDbId,
      promptId: "__none__",
      message: "This message might be just enough with a few output tokens to exceed balance.",
    };

    const request = new Request(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
      body: JSON.stringify(requestBody),
    });

    const response = await handler(request, createDepsForEdgeCaseTest()); // Use helper

    const responseJsonForInsufficientBalance = await response.json();
    assertEquals(response.status, 402, "Expected 402 Payment Required due to insufficient funds pre-check. Body: " + JSON.stringify(responseJsonForInsufficientBalance));
    assertStringIncludes(responseJsonForInsufficientBalance.error, "Insufficient token balance");

    const recordedCalls = mockAiAdapter.getRecordedCalls();
    assertEquals(recordedCalls.length, 0, "AI adapter should not have been called.");

    const { data: wallet, error: walletErr } = await supabaseAdminClient
      .from("token_wallets")
      .select("balance")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    if (walletErr) throw walletErr;
    assertExists(wallet, "Wallet data was null for the user.");
    assertEquals(wallet.balance, initialBalance, "Wallet balance should remain unchanged.");
  });

  await t.step("[Edge Case] AI Provider returns an error", async () => {
    const initialBalance = 1000;
    const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({
      userProfile: { first_name: "AI Error User" },
      initialWalletBalance: initialBalance,
    });
    // Removed dynamic imports
    const currentAuthToken = getTestUserAuthToken();
    assertExists(currentAuthToken, "Test user auth token was not set for AI error test.");
    assertExists(supabaseAdminClient, "Shared Supabase Admin Client is not initialized for AI error test.");
    assertExists(currentTestDeps, "Shared Test Deps are not initialized for AI error test.");
    assertExists(handler, "Chat handler is not available from utils for AI error test.");
    assertExists(mockAiAdapter, "Mock AI adapter is not available from utils for AI error test.");

    const { data: providerData, error: providerError } = await supabaseAdminClient
      .from("ai_providers")
      .select("id, api_identifier")
      .eq("api_identifier", "gpt-3.5-turbo-test")
      .single();

    if (providerError) throw providerError;
    assertExists(providerData, "Provider data was null for 'gpt-3.5-turbo-test' in AI error test.");
    const actualProviderDbId = providerData.id;
    const providerApiIdentifier = providerData.api_identifier;

    const simulatedError = new Error("Simulated AI Provider API Key Error");
    mockAiAdapter.setMockError(providerApiIdentifier, simulatedError.message, 502);

    const requestBody: ChatApiRequest = {
      providerId: actualProviderDbId,
      promptId: "__none__",
      message: "This message will trigger an AI provider error.",
    };

    const request = new Request(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` },
      body: JSON.stringify(requestBody),
    });

    const response = await handler(request, createDepsForEdgeCaseTest()); // Use helper
    const responseJsonForAiError = await response.json();
    assertEquals(response.status, 502, "Expected 502 Bad Gateway due to AI provider error. Body: " + JSON.stringify(responseJsonForAiError));

    assertExists(responseJsonForAiError.error, "Response JSON should contain a top-level error field for AI provider errors.");
    assertStringIncludes(responseJsonForAiError.error, simulatedError.message, "Error message in response should include the simulated error message from mock.");

    const { data: wallet, error: walletError } = await supabaseAdminClient
      .from("token_wallets")
      .select("balance")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();

    if (walletError) throw walletError;
    assertExists(wallet, "Wallet not found for user.");
    assertEquals(wallet.balance, initialBalance, "Wallet balance should not have changed after AI provider error.");

    const { data: userMessages, error: userMessageError } = await supabaseAdminClient
      .from("chat_messages")
      .select("*")
      .eq("user_id", testUserId)
      .eq("role", "user")
      .order("created_at", { ascending: false });

    if (userMessageError) throw userMessageError;
    assertExists(userMessages);
    assertNotEquals(userMessages.length, 0, "User message should have been saved.");
    assertEquals(userMessages[0].content, requestBody.message);

    const { data: assistantMessages, error: assistantMessageError } = await supabaseAdminClient
      .from("chat_messages")
      .select("*")
      // .eq("user_id", testUserId) // Assistant messages don't have user_id directly populated this way
      .eq("chat_id", userMessages[0].chat_id) // Find by chat_id
      .eq("role", "assistant")
      .eq("error_type", "ai_provider_error")
      .order("created_at", { ascending: false });

    if (assistantMessageError) throw assistantMessageError;
    assertExists(assistantMessages);
    assertNotEquals(assistantMessages.length, 0, "Assistant error message should have been saved.");
    assertStringIncludes(assistantMessages[0].content ?? "", "AI service request failed");
    assertStringIncludes(assistantMessages[0].content ?? "", simulatedError.message);
  });

  await t.step("[Edge Case] Insufficient balance AFTER AI call (costlier than expected)", async () => {
    const initialBalance = 100;
    const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "Post-AI-Insufficient-Balance User" },
        initialWalletBalance: initialBalance,
    });

    const currentAuthToken = getTestUserAuthToken();
    assertExists(currentAuthToken, "Test user auth token was not set.");
    assertExists(supabaseAdminClient, "Shared Supabase Admin Client is not initialized.");
    assertExists(currentTestDeps, "Shared Test Deps are not initialized.");
    assertExists(handler, "Chat handler is not available from utils.");
    assertExists(mockAiAdapter, "Mock AI adapter is not available from utils.");

    const { data: providerData, error: providerError } = await supabaseAdminClient
        .from("ai_providers")
        .select("id, api_identifier, config")
        .eq("api_identifier", "gpt-3.5-turbo-test")
        .single();
    if (providerError) throw providerError;
    assertExists(providerData, "Provider data for 'gpt-3.5-turbo-test' not found.");
    const actualProviderDbId = providerData.id;
    const providerApiIdentifier = providerData.api_identifier;

    // This usage is higher than the initial balance of 100
    const mockAiTokenUsage: TokenUsage = { prompt_tokens: 50000, completion_tokens: 50000, total_tokens: 100000 };
    mockAiAdapter.setSimpleMockResponse(providerApiIdentifier, "This response is too expensive.", actualProviderDbId, null, mockAiTokenUsage);

    const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: "__none__",
        message: "This message will generate a response that is too expensive.",
    };

    const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
    });

    const response = await handler(request, createDepsForEdgeCaseTest());
    const responseJson = await response.json();

    assertEquals(response.status, 402, `Expected 402 Payment Required due to insufficient funds post-check. Body: ${JSON.stringify(responseJson)}`);
    assertExists(responseJson.error, "Response should contain an error message.");
    assertStringIncludes(responseJson.error, "Insufficient funds for the actual cost of the AI operation.");

    const { data: wallet, error: walletErr } = await supabaseAdminClient
        .from("token_wallets")
        .select("balance")
        .eq("user_id", testUserId)
        .is("organization_id", null)
        .single();
    if (walletErr) throw walletErr;
    assertExists(wallet, "Wallet data not found for the user.");
    assertEquals(wallet.balance, initialBalance, "Wallet balance should remain unchanged after a failed transaction.");
  });

  await t.step("[Edge Case] Database error during message saving (after AI call & debit)", async () => {
    const initialBalance = 10000;
    const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "DB Error User" },
        initialWalletBalance: initialBalance,
    });
    // Removed dynamic imports
    const currentAuthToken = getTestUserAuthToken();
    assertExists(currentAuthToken);
    assertExists(supabaseAdminClient);
    assertExists(currentTestDeps);
    assertExists(handler);
    assertExists(mockAiAdapter);

    const { data: realProviderDataFromDB, error: providerError } = await supabaseAdminClient
        .from("ai_providers")
        .select("id, api_identifier, config, name, provider, is_active")
        .eq("api_identifier", "gpt-3.5-turbo-test")
        .single();
    if (providerError) throw providerError;
    assertExists(realProviderDataFromDB, "Test provider 'gpt-3.5-turbo-test' not found in DB for mock setup.");
    
    const mockProviderData = { ...realProviderDataFromDB, is_active: true };
    const actualProviderDbId = mockProviderData.id;
    const providerApiIdentifier = mockProviderData.api_identifier;

    const mockAiContent = "Mock AI success response content.";
    const mockAiTokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    mockAiAdapter.setSimpleMockResponse(providerApiIdentifier, mockAiContent, actualProviderDbId, null, mockAiTokenUsage);

    const testMessageContent = "Test message that will trigger DB error for assistant msg";
    const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: "__none__",
        message: testMessageContent,
    };
    
    const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
    });

    let userMessageInsertCount = 0;
    const simulatedAssistantInsertError: MockPGRSTError = { name: "PostgrestError", message: "Simulated DB error on assistant message insert", code: "DB001", details: "Test details", hint: "Test hint" };

    const mockSupabaseSetup = createMockSupabaseClient(
        testUserId, 
        {           
            genericMockResults: {
                ai_providers: { 
                    select: async (state: MockQueryBuilderState): Promise<any> => {
                        const idFilter = state.filters.find(f => f.column === 'id' && f.value === actualProviderDbId);
                        if (state.operation === 'select' && idFilter) {
                            return { data: [mockProviderData], error: null, count: 1, status: 200, statusText: "OK" } as MockResolveQueryResult;
                        }
                        console.warn(`[Test Mock DB] Unhandled select on ai_providers in this test: ${JSON.stringify(state)}`);
                        return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for ai_providers", code:"TMU001"} as MockPGRSTError, count: 0, status: 404, statusText: "Not Found by Mock" } as MockResolveQueryResult;
                    }
                },
                token_wallets: { 
                    select: async (state: MockQueryBuilderState): Promise<any> => {
                        const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === testUserId);
                        const orgIdIsNullFilter = state.filters.find(f => f.column === 'organization_id' && f.type === 'is' && f.value === null);

                        if (state.operation === 'select' && userIdFilter && orgIdIsNullFilter) {
                            return { 
                                data: [{ 
                                    wallet_id: crypto.randomUUID(), 
                                    user_id: testUserId, 
                                    organization_id: null, 
                                    balance: initialBalance, 
                                    currency: "AI_TOKEN", 
                                    created_at: new Date().toISOString(), 
                                    updated_at: new Date().toISOString() 
                                }], 
                                error: null, 
                                count: 1, 
                                status: 200, 
                                statusText: "OK" 
                            } as MockResolveQueryResult;
                        }
                        console.warn(`[Test Mock DB] Unhandled select on token_wallets in this test: ${JSON.stringify(state)}`);
                        return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled select for token_wallets", code:"TMU002"} as MockPGRSTError, count: 0, status: 404, statusText: "Not Found by Mock" } as MockResolveQueryResult;
                    },
                },
                chats: {
                    insert: async (state: MockQueryBuilderState): Promise<any> => {
                        const chatInsertData = state.insertData as { user_id?: string, organization_id?: string | null, system_prompt_id?: string | null, title?: string };
                        const newChatId = crypto.randomUUID();
                        return {
                            data: [{ 
                                id: newChatId, 
                                user_id: chatInsertData.user_id,
                                organization_id: chatInsertData.organization_id,
                                system_prompt_id: chatInsertData.system_prompt_id,
                                title: chatInsertData.title,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                            }],
                            error: null,
                            count: 1,
                            status: 201, 
                            statusText: "Created"
                        } as MockResolveQueryResult;
                    }
                },
                chat_messages: {
                    insert: async (state: MockQueryBuilderState): Promise<any> => { 
                        userMessageInsertCount++;
                        const insertedDataArray = Array.isArray(state.insertData) ? state.insertData : [state.insertData];
                        const insertedData = insertedDataArray[0] as Record<string, unknown>; 
                        
                        if (insertedData?.role === 'user' && userMessageInsertCount === 1) {
                            const id = crypto.randomUUID();
                            return { 
                                data: [{ id, ...insertedData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }], 
                                error: null, 
                                count: 1, 
                                status: 201, 
                                statusText: "Created" 
                            } as MockResolveQueryResult;
                        } else if (insertedData?.role === 'assistant' && userMessageInsertCount === 2) { // Simulate error on second insert (assistant message)
                            return { 
                                data: null, 
                                error: simulatedAssistantInsertError, 
                                count: 0, 
                                status: 500, 
                                statusText: "Internal Server Error (Simulated)" 
                            } as MockResolveQueryResult;
                        }
                        console.warn(`[Test Mock DB] Unhandled insert on chat_messages: ${JSON.stringify(state)}, count: ${userMessageInsertCount}`);
                        return { data: null, error: { name: "TestMockUnhandled", message: "Unhandled insert for chat_messages", code:"TMU003"} as MockPGRSTError, count: 0, status: 500, statusText: "Not Found by Mock" } as MockResolveQueryResult;
                    },
                    select: async (_state: MockQueryBuilderState): Promise<any> => { // Catch-all select for chat_messages
                        return { data: [], error: null, count: 0, status: 200, statusText: "OK" } as MockResolveQueryResult;
                    }
                },
                 token_wallet_transactions: { 
                    insert: async (state: MockQueryBuilderState): Promise<any> => {
                        const insertedDataArray = Array.isArray(state.insertData) ? state.insertData : [state.insertData];
                        const insertedData = insertedDataArray[0] as Record<string, unknown>; 
                        const id = crypto.randomUUID();
                        return {
                            data: [{ id, ...insertedData, created_at: new Date().toISOString() }], 
                            error: null,
                            count: 1,
                            status: 201,
                            statusText: "Created"
                        } as MockResolveQueryResult;
                    }
                }
            },
        }
    );
    
    const originalSupabaseClient = currentTestDeps.supabaseClient;
    currentTestDeps.supabaseClient = mockSupabaseSetup.client as unknown as SupabaseClient<Database>; // Set the specific mock client
    let response;
    try {
      response = await handler(request, createDepsForEdgeCaseTest()); // Use helper
    } finally {
      currentTestDeps.supabaseClient = originalSupabaseClient; // Restore original client
    }

    const responseJson = await response.json();
    assertEquals(response.status, 500, "Expected 500 Internal Server Error due to DB failure saving assistant message. Body: " + JSON.stringify(responseJson));
    
    assertExists(responseJson.error, "Response JSON should contain an error field.");
    assertStringIncludes(responseJson.error, "Database error during message persistence", 
      `Error message should be from the simulated DB error. Expected to include: 'Database error during message persistence', Got: '${responseJson.error}'`);
    assertStringIncludes(responseJson.error, simulatedAssistantInsertError.message, 
      `Error message should include details from the simulated DB error. Expected to include: '${simulatedAssistantInsertError.message}', Got: '${responseJson.error}'`);

    const { data: walletAfter, error: walletErrAfter } = await supabaseAdminClient
      .from("token_wallets")
      .select("balance")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    if (walletErrAfter) throw walletErrAfter;
    assertExists(walletAfter, "Wallet data was null for the user after the operation.");
    
    assertEquals(walletAfter.balance, initialBalance, 
      `Wallet balance should be restored to initial balance after DB error. Expected: ${initialBalance}, Got: ${walletAfter.balance}`);

    assertEquals(userMessageInsertCount, 2, "Expected two insert attempts to chat_messages (user, then assistant).");
  });

  await t.step("[Edge Case] Basic rewind functionality (real database)", async () => {
    const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
      userProfile: { first_name: "Real DB Rewind User" },
      initialWalletBalance: 10000,
    });
    const currentAuthToken = getTestUserAuthToken();
    const providerInfo = processedResources.find(p => p.tableName === 'ai_providers' && (p.resource as any).api_identifier === 'gpt-3.5-turbo-test')!.resource as any;

    const { data: chat, error: chatError } = await supabaseAdminClient!.from('chats').insert({ user_id: testUserId, title: "Rewind Test Chat" }).select().single();
    if (chatError) throw chatError;

    const { data: messages, error: msgError } = await supabaseAdminClient!.from('chat_messages').insert([
        { chat_id: chat.id, user_id: testUserId, role: 'user', content: 'Message 1' },
        { chat_id: chat.id, role: 'assistant', content: 'Response 1' },
        { chat_id: chat.id, user_id: testUserId, role: 'user', content: 'Message 2' },
        { chat_id: chat.id, role: 'assistant', content: 'Response 2' },
    ]).select();
    if (msgError) throw msgError;

    const rewindFromMessageId = messages[1].id;

    const requestBody: ChatApiRequest = {
        message: "User message after rewind",
        providerId: providerInfo.id,
        chatId: chat.id,
        rewindFromMessageId,
        promptId: "__none__",
    };

    const request = new Request(CHAT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentAuthToken}` },
        body: JSON.stringify(requestBody),
    });

    const response = await handler(request, createDepsForEdgeCaseTest());
    assertEquals(response.status, 200);

    const { data: finalMessages } = await supabaseAdminClient!.from('chat_messages').select('content, is_active_in_thread').eq('chat_id', chat.id).order('created_at');
    assertEquals(finalMessages?.length, 6);
    assertEquals(finalMessages![2].is_active_in_thread, false);
    assertEquals(finalMessages![3].is_active_in_thread, false);
    assertEquals(finalMessages![4].is_active_in_thread, true);
    assertEquals(finalMessages![5].is_active_in_thread, true);
  });
} 