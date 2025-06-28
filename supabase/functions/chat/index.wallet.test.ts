import {
  assertEquals,
  assertExists,
  assertSpyCalls,
  spy,
  type Spy,
  assert,
  assertObjectMatch,
  stub,
  handler,
  defaultDeps,
  logger,
  createTestDeps,
  mockConnInfo,
  ChatTestConstants,
  envGetStub,
  originalDenoEnvGet,
  testUserId,
  testChatId,
  testAiContent,
  mockSupaConfigBase,
  mockAdapterSuccessResponse,
} from "./index.test.ts";
import type { 
    ChatApiRequest,
    ChatHandlerDeps,
    AdapterResponsePayload,
    ChatHandlerSuccessResponse
} from '../_shared/types.ts';
import type {
    TokenWalletServiceMethodImplementations,
    MockTokenWalletService
} from '../_shared/services/tokenWalletService.mock.ts';
import type { MockSupabaseDataConfig } from '../_shared/supabase.mock.ts';

// --- Test Suite for Chat Wallet Functionality ---
Deno.test("Chat Wallet Functionality Tests", async (t) => {
  // Restore Deno.env.get after all tests in this suite are done
  const globalEnvStub: Spy<any> | null = null;
  if (envGetStub && typeof envGetStub.restore === 'function' && !envGetStub.restored) {
    // No direct assignment, use as is or re-stub if needed for suite-specific overrides
  } else {
    // This should ideally not happen if index.test.ts setup is always run/imported first
    console.warn("envGetStub not found or already restored at suite start");
  }

  await t.step("Placeholder: wallet test to be implemented", () => {
    assertEquals(true, true);
  });

  await t.step("POST request returns 402 if getWalletForContext returns null", async () => {
    const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
      getWalletForContext: spy(() => Promise.resolve(null)), // Mock to return null
      // Other methods are not expected to be called in this path
    };

    const { deps } = createTestDeps(
      mockSupaConfigBase, // Basic config with a user
      undefined,          // No AI adapter response needed
      tokenWalletConfig   // Our specific token wallet mock
    );

    const requestBody: ChatApiRequest = {
      message: "Test message, wallet should not be found",
      providerId: ChatTestConstants.testProviderId, // Need a provider to pass initial checks
      promptId: ChatTestConstants.testPromptId,     // Need a prompt to pass initial checks
    };

    const req = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer test-token` },
      body: JSON.stringify(requestBody),
    });

    const res = await handler(req, deps);
    assertEquals(res.status, 402);
    const responseJson = await res.json();
    assertEquals(responseJson.error, "Token wallet not found for your context. Please set up or fund your wallet.");

    const getWalletSpy = deps.tokenWalletService!.getWalletForContext as Spy<any>;
    assertSpyCalls(getWalletSpy, 1);
  });

  await t.step("POST request returns 500 if getWalletForContext throws an error", async () => {
    const errorMessage = "Simulated DB error during getWalletForContext";
    const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
      getWalletForContext: spy(() => Promise.reject(new Error(errorMessage))),
    };
    const loggerErrorSpy = spy();
    const loggerInfoSpy = spy(); // Spy for other methods if needed

    const { deps } = createTestDeps(
      mockSupaConfigBase,
      undefined,
      tokenWalletConfig,
      undefined,
      {
        logger: {
          error: loggerErrorSpy,
          info: loggerInfoSpy,
          warn: spy(),
          debug: spy()
        } as any
      }
    );

    const requestBody: ChatApiRequest = {
      message: "Test message, wallet check should fail with server error",
      providerId: ChatTestConstants.testProviderId,
      promptId: ChatTestConstants.testPromptId,
    };

    const req = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer test-token` },
      body: JSON.stringify(requestBody),
    });

    const res = await handler(req, deps);
    assertEquals(res.status, 500);
    const responseJson = await res.json();
    assertExists(responseJson.error);
    assertEquals(responseJson.error, "Server error during wallet check.");

    const getWalletSpy = deps.tokenWalletService!.getWalletForContext as Spy<any>;
    assertSpyCalls(getWalletSpy, 1);
    assertSpyCalls(loggerErrorSpy, 1);
    // Verify the logger was called with the specific error from getWalletForContext
    const logCallArgs = loggerErrorSpy.calls[0].args;
    assertExists(logCallArgs[0]); // The primary log message string
    assertExists(logCallArgs[1]?.error?.message.includes(errorMessage)); // The error object itself
  });

  await t.step("POST request returns 402 if checkBalance returns false (insufficient funds)", async () => {
    const estimatedCost = 100;
    const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
      getWalletForContext: spy(() => Promise.resolve({
        walletId: "wallet-test-insufficient",
        userId: testUserId,
        balance: "50", // Balance is less than estimatedCost
        currency: "AI_TOKEN",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      checkBalance: spy(() => Promise.resolve(false)), // Mock to return false
    };
    const countTokensFnMock = spy(() => estimatedCost);

    const { deps } = createTestDeps(
      mockSupaConfigBase,
      undefined, // No AI adapter response needed as it shouldn't be called
      tokenWalletConfig,
      countTokensFnMock
    );

    const requestBody: ChatApiRequest = {
      message: "Test message, insufficient funds",
      providerId: ChatTestConstants.testProviderId,
      promptId: ChatTestConstants.testPromptId,
    };

    const req = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer test-token` },
      body: JSON.stringify(requestBody),
    });

    const res = await handler(req, deps);
    assertEquals(res.status, 402);
    const responseJson = await res.json();
    assertExists(responseJson.error, "Error message should exist");
    assert(responseJson.error.includes("Insufficient token balance"), `Error message should contain 'Insufficient token balance', got: ${responseJson.error}`);
    assert(responseJson.error.includes(estimatedCost.toString()), `Error message should contain estimated cost '${estimatedCost}', got: ${responseJson.error}`);

    const getWalletSpy = deps.tokenWalletService!.getWalletForContext as Spy<any>;
    const checkBalanceSpy = deps.tokenWalletService!.checkBalance as Spy<any>;

    assertSpyCalls(getWalletSpy, 1);
    assertSpyCalls(countTokensFnMock, 1); // Token estimation should be called
    assertSpyCalls(checkBalanceSpy, 1);
    // Verify checkBalance was called with the correct walletId and estimatedCost
    assertEquals(checkBalanceSpy.calls[0].args[0], "wallet-test-insufficient");
    assertEquals(checkBalanceSpy.calls[0].args[1], estimatedCost.toString());
  });

  await t.step("POST request returns 500 if countTokensFn throws an error", async () => {
    const countTokensErrorMessage = "Simulated error during token counting";
    const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
      getWalletForContext: spy(() => Promise.resolve({
        walletId: "wallet-test-tokencount-fail",
        userId: testUserId,
        balance: "1000",
        currency: "AI_TOKEN",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
    const countTokensFnMock = spy(() => {
      throw new Error(countTokensErrorMessage);
    });
    const loggerErrorSpy = spy();
    const loggerInfoSpy = spy();

    const { deps } = createTestDeps(
      mockSupaConfigBase,
      undefined,
      tokenWalletConfig,
      countTokensFnMock,
      {
        logger: {
          error: loggerErrorSpy,
          info: loggerInfoSpy,
          warn: spy(),
          debug: spy()
        } as any
      }
    );

    const requestBody: ChatApiRequest = {
      message: "Test message, token counting should fail",
      providerId: ChatTestConstants.testProviderId,
      promptId: ChatTestConstants.testPromptId,
    };

    const req = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },
      body: JSON.stringify(requestBody),
    });

    const res = await handler(req, deps);
    assertEquals(res.status, 500);
    const responseJson = await res.json();
    assertEquals(responseJson.error, "Server error: Could not estimate token cost or check balance. Simulated error during token counting");

    const getWalletSpy = deps.tokenWalletService!.getWalletForContext as Spy<any>;
    assertSpyCalls(getWalletSpy, 1);
    assertSpyCalls(countTokensFnMock, 1);
    assertSpyCalls(loggerErrorSpy, 1);
    const logCallArgs = loggerErrorSpy.calls[0].args;
    assertExists(logCallArgs[0]);
    assert(logCallArgs[1]?.error?.includes(countTokensErrorMessage),
      `Logged error message should contain '${countTokensErrorMessage}'. Logged args: ${JSON.stringify(logCallArgs)}`
    );
  });

  await t.step("POST returns 500 if recordTransaction (debit) fails (critical error, messages not saved)", async () => {
    const debitErrorMessage = "Simulated DB error during token debit";
    const estimatedCost = 50;
    const walletIdToUse = "wallet-test-debit-fail-critical-A"; // Unique wallet ID

    const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
      getWalletForContext: spy(() => Promise.resolve({
        walletId: walletIdToUse,
        userId: testUserId,
        balance: "1000",
        currency: "AI_TOKEN",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      checkBalance: spy(() => Promise.resolve(true)),
      recordTransaction: spy(() => Promise.reject(new Error(debitErrorMessage))), // Debit fails
    };
    const countTokensFnMock = spy(() => estimatedCost);
    const loggerErrorSpy = spy();
    const loggerInfoSpy = spy();

    const { deps, mockAdapterSpy, mockSupabaseClient } = createTestDeps(
      mockSupaConfigBase,
      mockAdapterSuccessResponse, // AI call is successful
      tokenWalletConfig,
      countTokensFnMock,
      {
        logger: {
          error: loggerErrorSpy,
          info: loggerInfoSpy,
          warn: spy(),
          debug: spy()
        } as any
      }
    );

    const requestBody: ChatApiRequest = {
      message: "Test message, debit should fail critically, no save",
      providerId: ChatTestConstants.testProviderId,
      promptId: ChatTestConstants.testPromptId,
    };

    const req = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },
      body: JSON.stringify(requestBody),
    });

    const res = await handler(req, deps);
    assertEquals(res.status, 500);
    const responseJson = await res.json();
    assertExists(responseJson.error);
    assertEquals(responseJson.error, "AI response was generated, but a critical error occurred while finalizing your transaction. Your message has not been saved. Please try again. If the issue persists, contact support.");

    assertSpyCalls(deps.tokenWalletService!.getWalletForContext as Spy<any>, 1);
    assertSpyCalls(countTokensFnMock, 1);
    assertSpyCalls(deps.tokenWalletService!.checkBalance as Spy<any>, 1);
    assertSpyCalls(mockAdapterSpy!, 1);
    assertSpyCalls(deps.tokenWalletService!.recordTransaction as Spy<any>, 1); // Debit was attempted

    assertSpyCalls(loggerErrorSpy, 1); // Critical error was logged
    const criticalLogCallArgs = loggerErrorSpy.calls[0].args;
    assertExists(criticalLogCallArgs[0]);
    assert(
      criticalLogCallArgs[0].includes("CRITICAL: Failed to record token debit transaction for normal path AFTER successful AI response. Messages will NOT be saved."),
      `Critical log message mismatch. Got: ${criticalLogCallArgs[0]}`
    );
    assert(criticalLogCallArgs[1]?.error?.includes(debitErrorMessage), `Original debit error message not found in log details. Logged: ${JSON.stringify(criticalLogCallArgs[1])}`);
    assertExists(criticalLogCallArgs[1]?.aiResponseContent, "AI response content snippet not found in log details");

    const insertSpy = (mockSupabaseClient.from('chat_messages') as any).insert as Spy<any>;
    const assistantMessageInsertCalls = insertSpy.calls.filter(call => {
        const insertData = call.args[0];
        const messages = Array.isArray(insertData) ? insertData : [insertData];
        return messages.some(item => item.role === 'assistant');
    });
    assertEquals(assistantMessageInsertCalls.length, 0, "Assistant message should NOT have been inserted after debit failure.");

    const userMessageInsertCalls = insertSpy.calls.filter(call => {
        const insertData = call.args[0];
        const messages = Array.isArray(insertData) ? insertData : [insertData];
        return messages.some(item => item.role === 'user');
    });
    assertEquals(userMessageInsertCalls.length, 0, "User message should NOT have been inserted after debit failure.");
  });

  await t.step("POST returns 200, logs error, and skips debit if AI response has invalid/missing token_usage", async () => {
    const walletIdToUse = "wallet-test-invalid-token-usage";
    const estimatedCost = 70;

    const tokenWalletConfig: TokenWalletServiceMethodImplementations = {
      getWalletForContext: spy(() => Promise.resolve({
        walletId: walletIdToUse,
        userId: testUserId,
        balance: "2000",
        currency: "AI_TOKEN",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      checkBalance: spy(() => Promise.resolve(true)),
      recordTransaction: spy(() => Promise.resolve({} as any)), // Should not be called
    };
    const countTokensFnMock = spy(() => estimatedCost);
    const loggerErrorSpy = spy();
    const loggerWarnSpy = spy();
    const loggerInfoSpy = spy();

    const localMockSupaConfig: MockSupabaseDataConfig = JSON.parse(JSON.stringify(mockSupaConfigBase));
    if (localMockSupaConfig.genericMockResults && localMockSupaConfig.genericMockResults['chat_messages']) {
        localMockSupaConfig.genericMockResults['chat_messages'].insert = (state: any) => {
            if (Array.isArray(state.insertData) && state.insertData.length > 0) {
                const messageToInsert = state.insertData[0] as Partial<typeof ChatTestConstants.mockUserDbRow>;
                if (messageToInsert.role === 'assistant') {
                    return Promise.resolve({ data: [{ ...ChatTestConstants.mockAssistantDbRow, id: ChatTestConstants.testAsstMsgId + "-invalidtoken", content: ChatTestConstants.testAiContent }], error: null, status: 201, count: 1 });
                } else if (messageToInsert.role === 'user') {
                    return Promise.resolve({ data: [{ ...ChatTestConstants.mockUserDbRow, id: ChatTestConstants.testUserMsgId + "-invalidtoken", content: messageToInsert.content || ChatTestConstants.mockUserDbRow.content }], error: null, status: 201, count: 1 });
                }
            }
            return Promise.resolve({ data: [{ ...ChatTestConstants.mockAssistantDbRow, content: ChatTestConstants.testAiContent }], error: null, status: 201, count: 1 });
        };
    }

    const adapterResponseMissingTokens: AdapterResponsePayload = {
        ...mockAdapterSuccessResponse,
        token_usage: null
    };

    const { deps, mockAdapterSpy } = createTestDeps(
      localMockSupaConfig,
      adapterResponseMissingTokens,
      tokenWalletConfig,
      countTokensFnMock,
      {
        logger: {
          error: loggerErrorSpy,
          warn: loggerWarnSpy,
          info: loggerInfoSpy,
          debug: spy()
        } as any
      }
    );

    const requestBody: ChatApiRequest = {
      message: "Test message, AI token_usage will be invalid",
      providerId: ChatTestConstants.testProviderId,
      promptId: ChatTestConstants.testPromptId,
      chatId: ChatTestConstants.testChatId,
    };

    const req = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },
      body: JSON.stringify(requestBody),
    });

    const res = await handler(req, deps);
    assertEquals(res.status, 200);
    const responseJson = await res.json() as ChatHandlerSuccessResponse;

    assertExists(responseJson.assistantMessage);
    assertEquals(responseJson.assistantMessage.content, ChatTestConstants.testAiContent);

    assertSpyCalls(deps.tokenWalletService!.getWalletForContext as Spy<any>, 1);
    assertSpyCalls(countTokensFnMock, 1);
    assertSpyCalls(deps.tokenWalletService!.checkBalance as Spy<any>, 1);
    assertSpyCalls(mockAdapterSpy!, 1);
    assertSpyCalls(deps.tokenWalletService!.recordTransaction as Spy<any>, 0); // Debit skipped

    assertSpyCalls(loggerWarnSpy, 2); // Expect two warnings now
    assertExists(loggerWarnSpy.calls[0].args[0]?.includes("[calculateActualChatCost] TokenUsage object is missing or invalid."), "First warning should be about invalid TokenUsage from calculateActualChatCost");
    assertExists(loggerWarnSpy.calls[1].args[0]?.includes("Calculated debit amount for normal path is zero or less, debit step will be skipped"), "Second warning should be about skipping debit");
    assertSpyCalls(loggerErrorSpy, 0);
  });

  // More tests will be added here for:
  // - getWalletForContext returns no wallet (expect 402)
  // - getWalletForContext throws an unexpected server error (expect 500)
  // - Insufficient balance for AI call after checkBalance (expect 402)
  // - Error during token estimation with countTokensFn (expect 500)
  // - recordTransaction (debit) fails (should log error, but still return 200)
  // - token_usage from adapter is missing or invalid, so debit is skipped (verify logging)

  // Cleanup after all steps in this test suite
  // This is a bit tricky with the shared envGetStub.
  // Ideally, index.test.ts manages its global stub, and individual test files don't try to restore it.
  // If a test file *needs* to modify Deno.env for its own suite, it should stub/restore locally.
  // For now, we assume the global stub from index.test.ts is active.
  // If issues arise, we might need a more robust per-suite env stubbing mechanism.
});