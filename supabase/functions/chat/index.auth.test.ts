// Import shared testing utilities, types, constants, and helpers
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  assert,
  assertEquals,
  assertExists,
  assertObjectMatch,
  spy,
  stub,
  type Spy,
  assertSpyCalls,
  handler,
  defaultDeps,
  logger,
  createTestDeps,
  mockSupabaseUrl,
  mockAnonKey,
  mockServiceRoleKey,
  testUserId,
  envGetStub,
  originalDenoEnvGet,
  type CreateTestDepsResult,
  mockSupaConfigBase, // Base supa config
  mockAdapterSuccessResponse, // Default adapter response
  ChatTestConstants, // Collection of common test IDs, etc.
  type ChatTestCase, // Shared TestCase interface
  type ChatMessageRow, // If needed directly by tests beyond what ChatTestCase provides
} from "./index.test.ts";
import type { 
  ChatApiRequest, 
  AdapterResponsePayload, 
  ChatHandlerDeps 
} from "../_shared/types.ts";
import type { 
  MockTokenWalletService, 
  TokenWalletServiceMethodImplementations 
} from "../_shared/services/tokenWalletService.mock.ts";
import type { TokenWalletTransaction } from "../_shared/types/tokenWallet.types.ts";

const testBaseUrl = 'http://localhost:8000'; // Example base URL for requests

// --- Test Suite for Chat Authentication ---
Deno.test("Chat Auth Tests", async (t) => {
  try {
    // Ensure the global Deno.env.get is our stub for the duration of these tests
    // The stub is typically active upon import if it patches globalThis.Deno.env directly.
    // If envGetStub itself needs to be "activated" or reset for each test suite,
    // that would be done here (e.g., envGetStub.resetHistory(); envGetStub.start();)
    // For now, assuming it's active.

    await t.step("OPTIONS request should return CORS headers", async () => {
      // Use imported createTestDeps. No specific supa config or adapter result needed for OPTIONS.
      const { deps } = createTestDeps(); 
      const req = new Request('http://localhost/chat', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }); 
      
      // Use imported handler
      const response = await handler(req, deps);
      
      assertEquals(response.status, 204);
      assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
      // Add other CORS header checks if necessary (Allow-Methods, Allow-Headers)
    });

    await t.step("GET request should return 405 Method Not Allowed", async () => {
      const { deps } = createTestDeps();
      const req = new Request('http://localhost/chat', { method: 'GET' });
      const response = await handler(req, deps);
      assertEquals(response.status, 405);
    });

    await t.step("POST request missing Auth header should return 401", async () => {
      // Mock Supabase to return no user
      const { deps } = createTestDeps({ 
        getUserResult: { data: { user: null }, error: null } 
      }); 
      const req = new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Body content might not matter as much as the lack of auth for this test
        body: JSON.stringify({ 
            provider_name: ChatTestConstants.testProviderString, 
            api_identifier: ChatTestConstants.testApiIdentifier,
            messages: [{role: "user", content: "test"}] 
        }),
      });
      const response = await handler(req, deps);
      assertEquals(response.status, 401);
      const responseBody = await response.json();
      assertEquals(responseBody.error, 'Authentication required');
    });

    await t.step("POST request with invalid/expired Auth token should return 401 (Supa mock)", async () => {
      const { deps } = createTestDeps({ 
        simulateAuthError: new Error("Simulated Invalid token"),
        genericMockResults: {
          'ai_providers': {
            select: { data: [{ id: ChatTestConstants.testProviderId, name: "Mock Provider", api_identifier: ChatTestConstants.testApiIdentifier, provider: ChatTestConstants.testProviderString, is_active: true, config: { api_identifier: ChatTestConstants.testApiIdentifier, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } } }], error: null, status: 200, count: 1 }
          },
          'system_prompts': {
            select: { data: [{ id: ChatTestConstants.testPromptId, prompt_text: 'Test system prompt', is_active: true }], error: null, status: 200, count: 1 }
          },
          'chats': {
            insert: { data: [{ id: ChatTestConstants.testChatId, user_id: ChatTestConstants.testUserId, system_prompt_id: ChatTestConstants.testPromptId, title:"test" }], error: null, status: 201, count: 1 }
          }
        }
      });
      const req = new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid-token' 
        },
        body: JSON.stringify({ 
            message: "test",
            providerId: ChatTestConstants.testProviderId,
            promptId: ChatTestConstants.testPromptId
        }),
      });
      const response = await handler(req, deps);
      assertEquals(response.status, 401);
      const responseBody = await response.json();
      // The actual error message might come from Supabase client's handling of the error
      // Or from the chat handler's generic message for auth failures.
      // Given the error message from simulateAuthError contains "Invalid token",
      // the handler should produce "Invalid authentication credentials".
      assertEquals(responseBody.error, 'Invalid authentication credentials'); 
    });
    
    await t.step("POST request with valid Auth (New Chat) should proceed past auth check", async () => {
      const tokenWalletConfigForTest: TokenWalletServiceMethodImplementations = {
        getWalletForContext: () => Promise.resolve({
          walletId: 'test-wallet-id',
          balance: '100000', // Sufficient balance
          currency: 'AI_TOKEN',
          createdAt: new Date(),
          updatedAt: new Date(),
          organization_id: null,
          user_id: ChatTestConstants.testUserId
        }),
        recordTransaction: () => Promise.resolve({ 
          transactionId: "txn_123",
          walletId: "test-wallet-id",
          type: "DEBIT_USAGE",
          amount: "10",
          balanceAfterTxn: "99990",
          recordedByUserId: ChatTestConstants.testUserId, 
          relatedEntityId: ChatTestConstants.testChatId, 
          relatedEntityType: 'chat_flow',
          timestamp: new Date(),
        } as TokenWalletTransaction)
      };

      const { deps, mockSupabaseClient, mockTokenWalletService } = createTestDeps(
        { // Supabase config: user exists, provider exists, system prompt exists
          ...mockSupaConfigBase, // Start with the shared base
          genericMockResults: {
            ...mockSupaConfigBase.genericMockResults,
            // Ensure critical selects for a new chat succeed
            'ai_providers': {
                select: { data: [{ id: ChatTestConstants.testProviderId, name: "Test Provider Active", api_identifier: ChatTestConstants.testApiIdentifier, provider: ChatTestConstants.testProviderString, is_active: true, default_model_id: "some-model", config: { api_identifier: ChatTestConstants.testApiIdentifier, input_token_cost_rate: 1, output_token_cost_rate: 2, tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } } }], error: null, status: 200, count: 1 }
            },
            'system_prompts': {
                select: { data: [{ id: ChatTestConstants.testPromptId, prompt_text: 'Test system prompt', is_active: true }], error: null, status: 200, count: 1 }
            },
            // Mock chat insertion to succeed
            'chats': {
                insert: { data: [{ id: ChatTestConstants.testChatId, user_id: ChatTestConstants.testUserId, system_prompt_id: ChatTestConstants.testPromptId, title:"test" }], error: null, status: 201, count: 1 },
                select: { data: [{ id: ChatTestConstants.testChatId, user_id: ChatTestConstants.testUserId, system_prompt_id: ChatTestConstants.testPromptId, title:"test" }], error: null, status: 200, count: 1 } // For re-fetching after create
            },
            // Mock message insertions to succeed individually
            'chat_messages': {
                insert: (state) => {
                  // Determine if it's the user or assistant message based on the input
                  // This is a simplified check; more robust checks might be needed if structure varies
                  const insertedData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                  let responseData = null;
                  if (insertedData && (insertedData as any).role === 'user') {
                    responseData = { ...ChatTestConstants.mockUserDbRow, id: crypto.randomUUID(), chat_id: ChatTestConstants.testChatId, ...insertedData };
                  } else if (insertedData && (insertedData as any).role === 'assistant') {
                    responseData = { ...ChatTestConstants.mockAssistantDbRow, id: crypto.randomUUID(), chat_id: ChatTestConstants.testChatId, ...insertedData };
                  }
                  // Fallback or throw error if unexpected data
                  if (!responseData) {
                    console.warn('[Test Mock chat_messages insert] Unexpected insertData:', state.insertData);
                    return Promise.resolve({ data: null, error: new Error('Mock insert for chat_messages received unexpected data'), status: 500, count: 0 });
                  }
                  return Promise.resolve({ data: [responseData], error: null, status: 201, count: 1 });
                },
            }
          }
        },
        mockAdapterSuccessResponse, // AI Adapter will succeed
        tokenWalletConfigForTest, // Pass the specific wallet service config
        () => 10 // Provide the mock for countTokensForMessages directly to createTestDeps
      );

      const reqBodyMessages: { role: 'user' | 'system' | 'assistant'; content: string }[] = [{ role: "user", content: "Hello, this is a test for valid auth." }];
      const reqBody: ChatApiRequest = {
        message: reqBodyMessages[0].content,
        providerId: ChatTestConstants.testProviderId,
        messages: reqBodyMessages,
        promptId: ChatTestConstants.testPromptId,
      };

      const req = new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer mock-user-token` // Supabase mock will handle this
        },
        body: JSON.stringify(reqBody),
      });

      const response = await handler(req, deps);
      
      // For a fully successful interaction (auth ok, provider ok, db ok, wallet ok)
      assertEquals(response.status, 200); 
      const responseData = await response.json();
      assertExists(responseData.chatId);
      assertExists(responseData.assistantMessage);
      assertEquals(responseData.assistantMessage.role, "assistant");
      // If userMessage is also expected and relevant to check:
      // assertExists(responseData.userMessage);
      // assertEquals(responseData.userMessage.role, "user");

      // Verify TokenWalletService calls
      const getWalletSpy = deps.tokenWalletService!.getWalletForContext as Spy<any, any[], any>;
      assertEquals(getWalletSpy.calls.length, 1);
      // assertEquals(getWalletSpy.calls[0].args, [ChatTestConstants.testUserId, undefined]); // Example arg check

      const recordTransactionSpy = deps.tokenWalletService!.recordTransaction as Spy<any, any[], any>;
      assertEquals(recordTransactionSpy.calls.length, 1);

      // createTransaction might be called internally by deductBalance, or directly.
      // If deductBalance is the primary external call, checking it might be sufficient.
      // Check createTransaction if it's called directly by the main handler.
      // assertSpyCalls(mockTokenWalletService.stubs.createTransaction, 1); 


      // Check Supabase client calls (example: one insert for user message, one for assistant)
      // This requires knowing the table names used in createMockSupabaseClient's genericMockResults
      // and how your handler interacts.
      // For example, if chat_messages.insert is called twice:
      // const insertSpy = mockSupabaseClient.from('chat_messages').insert([]).then().constructor.prototype.then as Spy;
      // assertSpyCalls(insertSpy, 2); // Or access specific stubs from createMockSupabaseClient if exposed
    });

    // ... any other test steps for auth ...

  } finally {
    // Restore the original Deno.env.get after all tests in this suite are done
    globalThis.Deno.env.get = originalDenoEnvGet;
    // If envGetStub has a specific restore or cleanup method, call it:
    // envGetStub.restore(); 
    // Ensure stubs on shared mocks are cleared if they persist across test files
    // (though createTestDeps creates fresh mock instances each time for Supabase client & token wallet)
  }
});

// Remaining test steps from the original file would go here, similarly refactored.
// For example:
// - Test case for user_id in body vs. user_id from Auth
// - Test case for org_id context (if auth logic handles it)