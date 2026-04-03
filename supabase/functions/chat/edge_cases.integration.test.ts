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
  AiProviderAdapter,
  AdapterStreamChunk,
} from "../_shared/types.ts";
import { 
  CHAT_FUNCTION_URL, 
  type ProcessedResourceInfo,
  currentTestDeps,
  mockAiAdapter,
  supabaseAdminClient,
  getTestUserAuthToken
} from "../_shared/_integration.test.utils.ts"; 
import type { PostgresError } from "../_shared/supabase.mock.ts";
import { defaultDeps, createChatServiceHandler } from "./index.ts"; // Use factory to build handler per request
import { getAiProviderAdapter, testProviderMap } from "../_shared/ai_service/factory.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { Database, Json } from "../types_db.ts";
import type { ChatMessageRow } from './_chat.test.utils.ts';
import type { FactoryDependencies } from "../_shared/types.ts";

function createNoopStream() {
  return async function* (
    _request: ChatApiRequest,
    _modelIdentifier: string,
  ): AsyncGenerator<AdapterStreamChunk> {
    const textDeltaChunk: AdapterStreamChunk = { type: 'text_delta', text: '' };
    yield textDeltaChunk;
    return;
  };
}

// Build a production-style request handler for tests
function createRequestHandlerForTests(depsOverride?: Partial<ChatHandlerDeps>) {
  const deps: ChatHandlerDeps = {
    ...defaultDeps,
    getAiProviderAdapter: (dependencies: FactoryDependencies) => getAiProviderAdapter({
      ...dependencies,
      providerMap: testProviderMap,
    }),
    ...depsOverride,
  };
  const adminClient = currentTestDeps.supabaseClient as SupabaseClient<Database>;
  const getSupabaseClient = (token: string | null) => currentTestDeps.createSupabaseClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    token ? { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } } : { auth: { persistSession: false } },
  ) as SupabaseClient<Database>;
  return createChatServiceHandler(deps, getSupabaseClient, adminClient);
}

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
        { id: aiMsg1Id, chat_id: chatId, user_id: null, role: 'assistant', content: 'AI Response 1 (Rewind Target)', is_active_in_thread: true, ai_provider_id: providerId, system_prompt_id: promptId, token_usage: { prompt_tokens: 10, completion_tokens: 10 }, error_type: null, response_to_message_id: userMsg1Id },
        { id: userMsg2Id, chat_id: chatId, user_id: userId, role: 'user', content: 'User Message 2', is_active_in_thread: true, ai_provider_id: null, system_prompt_id: null, token_usage: null, error_type: null, response_to_message_id: null },
        { id: aiMsg2Id, chat_id: chatId, user_id: null, role: 'assistant', content: 'AI Response 2', is_active_in_thread: true, ai_provider_id: providerId, system_prompt_id: promptId, token_usage: { prompt_tokens: 10, completion_tokens: 10 }, error_type: null, response_to_message_id: userMsg2Id },
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
    // Handler constructed per test via createChatServiceHandler

    const { data: providerData, error: providerError } = await supabaseAdminClient
      .from("ai_providers")
      .select("id, api_identifier, config")
      .eq("api_identifier", "openai-gpt-3.5-turbo-test")
      .single();

    if (providerError) throw providerError;
    assertExists(providerData, "Provider data was null, could not fetch 'openai-gpt-3.5-turbo-test'.");
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

    // Boundary-faithful integration: no DB/client fault injection here.
    const requestHandler = createRequestHandlerForTests();
    const response = await requestHandler(request);

    const responseJsonForInsufficientBalance = await response.json();
    assertEquals(response.status, 402, "Expected 402 due to insufficient funds. Body: " + JSON.stringify(responseJsonForInsufficientBalance));
    assertStringIncludes(responseJsonForInsufficientBalance.error, "Insufficient token balance");

    // No adapter calls expected; request failed before model invocation

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
    // Handler constructed per test; adapter injected via deps where needed

    const { data: providerData, error: providerError } = await supabaseAdminClient
      .from("ai_providers")
      .select("id, api_identifier")
      .eq("api_identifier", "openai-gpt-3.5-turbo-test")
      .single();

    if (providerError) throw providerError;
    assertExists(providerData, "Provider data was null for 'openai-gpt-3.5-turbo-test' in AI error test.");
    const actualProviderDbId = providerData.id;
    const providerApiIdentifier = providerData.api_identifier;

    const simulatedError = new Error("Simulated AI Provider API Key Error");
    // Inject an adapter that throws to simulate provider error
    const throwingAdapterDeps: Partial<ChatHandlerDeps> = {
      getAiProviderAdapter: (_factoryDeps: any) => ({
        sendMessage: async () => { throw simulatedError; },
        sendMessageStream: createNoopStream(),
        listModels: async () => [],
      }),
    };

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

    const requestHandler = createRequestHandlerForTests(throwingAdapterDeps);
    const response = await requestHandler(request);
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
      .eq("chat_id", (userMessages[0].chat_id ?? '')) // Guard against null
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
    const initialBalance = 5000;
    const { primaryUserId: testUserId } = await initializeTestGroupEnvironment({
        userProfile: { first_name: "Post-AI-Insufficient-Balance User" },
        initialWalletBalance: initialBalance,
    });

    const currentAuthToken = getTestUserAuthToken();
    assertExists(currentAuthToken, "Test user auth token was not set.");
    assertExists(supabaseAdminClient, "Shared Supabase Admin Client is not initialized.");
    assertExists(currentTestDeps, "Shared Test Deps are not initialized.");

    const { data: providerData, error: providerError } = await supabaseAdminClient
        .from("ai_providers")
        .select("id, api_identifier, config")
        .eq("api_identifier", "openai-gpt-3.5-turbo-test")
        .single();
    if (providerError) throw providerError;
    assertExists(providerData, "Provider data for 'openai-gpt-3.5-turbo-test' not found.");
    const actualProviderDbId = providerData.id;
    const providerApiIdentifier = providerData.api_identifier;

    // This usage is higher than the initial balance of 100
    const mockAiTokenUsage: TokenUsage = { prompt_tokens: 50000, completion_tokens: 50000, total_tokens: 100000 };
    const expensiveAdapterDeps: Partial<ChatHandlerDeps> = {
      getAiProviderAdapter: (_factoryDeps) => ({
        sendMessage: async (_request, _modelIdentifier) => ({
          role: 'assistant',
          content: 'This response is too expensive.',
          ai_provider_id: actualProviderDbId,
          system_prompt_id: null,
          token_usage: { prompt_tokens: 50000, completion_tokens: 50000, total_tokens: 100000 },
          finish_reason: 'stop',
        }),
        sendMessageStream: createNoopStream(),
        listModels: async () => [],
      }),
    };

    const requestBody: ChatApiRequest = {
        providerId: actualProviderDbId,
        promptId: "__none__",
        message: "This message will generate a response that is too expensive.",
    };

    const request = new Request(CHAT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentAuthToken}`, "X-Test-Mode": "true" },
        body: JSON.stringify(requestBody),
    });
    const requestHandler = createRequestHandlerForTests(expensiveAdapterDeps);
    const response = await requestHandler(request);
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

  await t.step("[Edge Case] Message persistence through real integration boundary", async () => {
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

    const { data: realProviderDataFromDB, error: providerError } = await supabaseAdminClient
        .from("ai_providers")
        .select("id, api_identifier, config, name, provider, is_active")
        .eq("api_identifier", "openai-gpt-3.5-turbo-test")
        .single();
    if (providerError) throw providerError;
    assertExists(realProviderDataFromDB, "Test provider 'openai-gpt-3.5-turbo-test' not found in DB for mock setup.");
    
    const mockProviderData = { ...realProviderDataFromDB, is_active: true };
    const actualProviderDbId = mockProviderData.id;
    const providerApiIdentifier = mockProviderData.api_identifier;

    const mockAiContent = "Mock AI success response content.";
    const successAdapterDeps: Partial<ChatHandlerDeps> = {
      getAiProviderAdapter: (_factoryDeps) => ({
        sendMessage: async (_request, _modelIdentifier) => ({
          role: 'assistant',
          content: mockAiContent,
          ai_provider_id: actualProviderDbId,
          system_prompt_id: null,
          token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          finish_reason: 'stop',
        }),
        sendMessageStream: createNoopStream(),
        listModels: async () => [],
      }),
    };

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

    const requestHandler = createRequestHandlerForTests(successAdapterDeps);
    const response = await requestHandler(request);

    const responseJson = await response.json();
    assertEquals(response.status, 200, "Expected 200 through real integration boundary. Body: " + JSON.stringify(responseJson));
    assertExists(responseJson.userMessage, "Expected persisted user message in response.");
    assertExists(responseJson.assistantMessage, "Expected persisted assistant message in response.");

    const { data: walletAfter, error: walletErrAfter } = await supabaseAdminClient
      .from("token_wallets")
      .select("balance")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    if (walletErrAfter) throw walletErrAfter;
    assertExists(walletAfter, "Wallet data was null for the user after the operation.");
    
    assertEquals(walletAfter.balance < initialBalance, true,
      `Wallet balance should be debited after successful persistence. Initial: ${initialBalance}, Got: ${walletAfter.balance}`);
  });

  await t.step("[Edge Case] Basic rewind functionality (real database)", async () => {
    const { primaryUserId: testUserId, processedResources } = await initializeTestGroupEnvironment({
      userProfile: { first_name: "Real DB Rewind User" },
      initialWalletBalance: 10000,
    });
    const currentAuthToken = getTestUserAuthToken();
    const providerInfo = processedResources.find(p => p.tableName === 'ai_providers' && (p.resource).api_identifier === 'openai-gpt-3.5-turbo-test')!.resource;

    const { data: chat, error: chatError } = await supabaseAdminClient!.from('chats').insert({ user_id: testUserId, title: "Rewind Test Chat" }).select().single();
    if (chatError) throw chatError;

    const baseTime = new Date();
    const { data: messages, error: msgError } = await supabaseAdminClient!.from('chat_messages').insert([
        { chat_id: chat.id, user_id: testUserId, role: 'user', content: 'Message 1', created_at: new Date(baseTime.getTime() - 4000).toISOString() },
        { chat_id: chat.id, role: 'assistant', content: 'Response 1', created_at: new Date(baseTime.getTime() - 3000).toISOString() },
        { chat_id: chat.id, user_id: testUserId, role: 'user', content: 'Message 2', created_at: new Date(baseTime.getTime() - 2000).toISOString() },
        { chat_id: chat.id, role: 'assistant', content: 'Response 2', created_at: new Date(baseTime.getTime() - 1000).toISOString() },
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
    const requestHandler = createRequestHandlerForTests();
    const response = await requestHandler(request);
    assertEquals(response.status, 200);

    const { data: finalMessages } = await supabaseAdminClient!.from('chat_messages').select('content, is_active_in_thread').eq('chat_id', chat.id).order('created_at');
    assertEquals(finalMessages?.length, 6);
    assertEquals(finalMessages![2].is_active_in_thread, false);
    assertEquals(finalMessages![3].is_active_in_thread, false);
    assertEquals(finalMessages![4].is_active_in_thread, true);
    assertEquals(finalMessages![5].is_active_in_thread, true);
  });
} 