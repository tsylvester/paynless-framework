import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.220.1/assert/mod.ts";
// TestContext is Deno.TestContext, a global type, no import needed.
import {
  initializeSupabaseAdminClient,
  initializeTestDeps,
  coreTeardown,
  coreInitializeTestStep,
  setSharedAdminClient,
  CHAT_FUNCTION_URL,
  type ProcessedResourceInfo,
  type TestResourceRequirement,
  type TestSetupConfig,
} from "../_shared/_integration.test.utils.ts";

// Import types directly from their canonical location
import type { ChatApiRequest, ChatHandlerSuccessResponse, AiModelExtendedConfig, FactoryDependencies } from "../_shared/types.ts";

// Import the test group runner
import { runHappyPathTests } from './happy_path.integration.test.ts';
//import { runEdgeCaseTests } from './edge_cases.integration.test.ts';
//import { runSpecificConfigsTests } from './specific_configs.integration.test.ts';
//import { runAuthValidationTests } from "./auth_validation.integration.test.ts";

// --- Refactor Validation imports ---
import { handler } from "./index.ts";
import type { ChatDeps, ChatParams, ChatPayload } from "./index.interface.ts";
import {
  buildAuthenticatedGetUserFn,
  buildMockUserForChatHandlerUnitTests,
} from "./index.mock.ts";
import { streamRequest } from "./streamRequest/streamRequest.ts";
import { prepareChatContext } from "./prepareChatContext/prepareChatContext.ts";
import { constructMessageHistory } from "./constructMessageHistory/constructMessageHistory.ts";
import { findOrCreateChat } from "./findOrCreateChat.ts";
import { countTokens } from "../_shared/utils/tokenizer_utils.ts";
import { debitTokens } from "../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";
import {
  handleCorsPreflightRequest,
  createSuccessResponse,
  createErrorResponse,
} from "../_shared/cors-headers.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import {
  createMockAdminTokenWalletService,
  asSupabaseAdminClientForTests,
} from "../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockQueryBuilderState,
} from "../_shared/supabase.mock.ts";
import { getMockAiProviderAdapter } from "../_shared/ai_service/ai_provider.mock.ts";
import type { TokenWallet } from "../_shared/types/tokenWallet.types.ts";
import type { Database, Tables } from "../types_db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// --- Router-level Helper Functions (wrappers around core logic) ---
async function setupTestSuiteRouter() {
  console.log("Setting up test suite (router)...");
  const adminClient = initializeSupabaseAdminClient();
  setSharedAdminClient(adminClient); 

  // Ensure API keys exist for provider adapters during tests
  const ensureEnv = (k: string, v: string) => { if (!Deno.env.get(k)) Deno.env.set(k, v) };
  ensureEnv('OPENAI_API_KEY', 'sk-test-openai');
  ensureEnv('ANTHROPIC_API_KEY', 'sk-test-anthropic');
  ensureEnv('GOOGLE_API_KEY', 'sk-test-google');
  ensureEnv('CUSTOM_API_KEY', 'sk-test-custom');
  ensureEnv('DUMMY_API_KEY', 'sk-test-dummy');

  initializeTestDeps();
  
  console.log("Test suite setup complete (router).");
}

async function teardownTestSuiteRouter() {
  console.log("Tearing down test suite (router)...");
  await coreTeardown();
  console.log("Test suite teardown complete (router).");
}

// Define default resources needed for most chat integration tests
const defaultTestAiProviders: TestResourceRequirement<any>[] = [
  {
    tableName: "ai_providers",
    identifier: { api_identifier: "openai-gpt-3.5-turbo-test" },
    desiredState: {
      name: "GPT-3.5 Turbo (Test)",
      api_identifier: "openai-gpt-3.5-turbo-test",
      provider: "openai",
      is_active: true,
      config: {
        api_identifier: "openai-gpt-3.5-turbo-test",
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
        input_token_cost_rate: 1,
        output_token_cost_rate: 2,
        requires_api_key: false,
      }
    }
  },
  {
    tableName: "ai_providers",
    identifier: { api_identifier: "openai-gpt-4-costly-test" },
    desiredState: {
      name: "GPT-4 Costly (Test)",
      api_identifier: "openai-gpt-4-costly-test",
      provider: "openai",
      is_active: true,
      config: {
        api_identifier: "openai-gpt-4-costly-test",
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
        input_token_cost_rate: 15,
        output_token_cost_rate: 75,
        requires_api_key: false,
      }
    }
  },
  {
    tableName: "ai_providers",
    identifier: { api_identifier: "anthropic-claude-test" },
    desiredState: {
      name: "Anthropic Claude (Test)",
      api_identifier: "anthropic-claude-test",
      provider: "anthropic",
      is_active: true,
      config: {
        api_identifier: "anthropic-claude-test",
        tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-3-opus-20240229" },
        input_token_cost_rate: 3,
        output_token_cost_rate: 15,
        requires_api_key: false,
      }
    }
  },
  {
    tableName: "ai_providers",
    identifier: { api_identifier: "google-gemini-pro-test" },
    desiredState: {
      name: "Google Gemini Pro (Test)",
      api_identifier: "google-gemini-pro-test",
      provider: "google",
      is_active: true,
      config: {
        api_identifier: "google-gemini-pro-test",
        tokenization_strategy: { type: "google_gemini_tokenizer" },
        input_token_cost_rate: 2.5,
        output_token_cost_rate: 10,
        requires_api_key: false,
      }
    }
  },
  {
    tableName: "ai_providers",
    identifier: { api_identifier: "rough-char-count-test" },
    desiredState: {
      name: "Rough Char Count (Test)",
      api_identifier: "rough-char-count-test",
      provider: "custom",
      is_active: true,
      config: {
        api_identifier: "rough-char-count-test",
        tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 4 },
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        requires_api_key: false,
      }
    }
  },
  {
    tableName: "ai_providers",
    identifier: { api_identifier: "inactive-provider-test" },
    desiredState: {
      name: "Inactive Provider (Test)",
      api_identifier: "inactive-provider-test",
      provider: "custom",
      is_active: false,
      config: {
        api_identifier: "inactive-provider-test",
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
        requires_api_key: false,
      }
    }
  }
];

const defaultTestSystemPrompts: TestResourceRequirement<any>[] = [
  {
    tableName: "system_prompts",
    identifier: { name: "Default Test System Prompt" },
    desiredState: {
      name: "Default Test System Prompt",
      prompt_text: "You are a helpful AI assistant for testing purposes.",
      is_active: true
    }
  },
  {
    tableName: "system_prompts",
    identifier: { name: "Specific System Prompt for Happy Path" },
    desiredState: {
      name: "Specific System Prompt for Happy Path",
      prompt_text: "You are a pirate. Respond as a pirate for this happy path test.",
      is_active: true
    }
  }
];

const allDefaultTestResources = [...defaultTestAiProviders, ...defaultTestSystemPrompts];

async function initializeTestGroupEnvironmentRouter(
  options: {
    userProfile?: Partial<{ role: "user" | "admin"; first_name: string }>;
    initialWalletBalance?: number;
    additionalResources?: TestResourceRequirement<any>[];
    aiProviderApiIdentifier?: string;
    aiProviderConfigOverride?: Partial<AiModelExtendedConfig>;
  } = {}
): Promise<{ primaryUserId: string; processedResources: ProcessedResourceInfo[] }> {
  const extra: TestResourceRequirement<any>[] = [...(options.additionalResources || [])];

  if (options.aiProviderApiIdentifier) {
    const defaultConfig: AiModelExtendedConfig = {
      api_identifier: options.aiProviderApiIdentifier,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      hard_cap_output_tokens: 1000,
    };
    const providerConfig: AiModelExtendedConfig = {
      ...defaultConfig,
      ...(options.aiProviderConfigOverride || {}),
    };
    extra.push({
      tableName: "ai_providers",
      identifier: { api_identifier: options.aiProviderApiIdentifier },
      desiredState: {
        name: `Test Provider (${options.aiProviderApiIdentifier})`,
        api_identifier: options.aiProviderApiIdentifier,
        provider: "dummy",
        is_active: true,
        config: providerConfig,
      },
    });
  }

  const finalConfig: TestSetupConfig = {
    userProfile: options.userProfile,
    initialWalletBalance: options.initialWalletBalance,
    resources: [...allDefaultTestResources, ...extra],
  };

  const result = await coreInitializeTestStep(finalConfig);
  return result;
}

Deno.test({
  name: "Chat Integration Tests Suite Router",
  sanitizeOps: false, 
  sanitizeResources: false, 
  sanitizeExit: false, 
  async fn(t: Deno.TestContext) {
    await setupTestSuiteRouter();

    try {
      // Call the Happy Path tests
      await t.step("[Test Group] Happy Path Scenarios", async (innerT: Deno.TestContext) => {
        await runHappyPathTests(innerT, initializeTestGroupEnvironmentRouter);
      });

      // Call the Edge Case tests
//      await t.step("[Test Group] Edge Cases", async (innerT: Deno.TestContext) => {
//        await runEdgeCaseTests(innerT, initializeTestGroupEnvironmentRouter);
//      });

      // Call the Specific Configs tests
//      await t.step("[Test Group] Specific Configurations", async (innerT: Deno.TestContext) => {
//        await runSpecificConfigsTests(innerT, initializeTestGroupEnvironmentRouter);
//      });

      // Run Auth and Validation tests
//      await t.step("[Test Group] Auth and Input Validation", async (t_auth_val) => {
//        await runAuthValidationTests(t_auth_val, coreInitializeTestStep);
//      });

      // Refactor Validation: DI wiring integration tests
      await t.step("[Test Group] Refactor Validation — DI Wiring", async (innerT: Deno.TestContext) => {
        const REFACTOR_TEST_PROVIDER_ID: string = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
        const REFACTOR_TEST_CHAT_ID: string = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
        const REFACTOR_TEST_WALLET_ID: string = "cccccccc-cccc-4ccc-8ccc-000000000001";
        const REFACTOR_TEST_USER_MSG_ID: string = "dddddddd-dddd-4ddd-8ddd-000000000001";
        const REFACTOR_TEST_USER_ID: string = "eeeeeeee-eeee-4eee-8eee-000000000001";

        const mockLogger: MockLogger = new MockLogger();

        const providerConfig: AiModelExtendedConfig = {
          api_identifier: "dummy-integration-model",
          tokenization_strategy: { type: "rough_char_count" },
          input_token_cost_rate: 0.001,
          output_token_cost_rate: 0.002,
          context_window_tokens: 10000,
          provider_max_input_tokens: 1000,
          provider_max_output_tokens: 500,
        };

        const providerRow: Tables<"ai_providers"> = {
          id: REFACTOR_TEST_PROVIDER_ID,
          name: "Integration Test Provider",
          api_identifier: "dummy-integration-model",
          provider: "dummy",
          is_active: true,
          config: providerConfig as unknown as Database["public"]["Tables"]["ai_providers"]["Row"]["config"],
          description: null,
          is_default_embedding: false,
          is_default_generation: false,
          is_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        function buildSupabaseConfig(): MockSupabaseDataConfig {
          return {
            genericMockResults: {
              ai_providers: {
                select: {
                  data: [providerRow],
                  error: null,
                },
              },
              chats: {
                select: {
                  data: [{ id: REFACTOR_TEST_CHAT_ID }],
                  error: null,
                },
              },
              chat_messages: {
                select: {
                  data: [],
                  error: null,
                  count: 0,
                  status: 200,
                  statusText: "OK",
                },
                insert: async (
                  state: MockQueryBuilderState,
                ): Promise<{
                  data: object[] | null;
                  error: Error | null;
                  count: number | null;
                  status: number;
                  statusText: string;
                }> => {
                  const insertData = state.insertData;
                  if (
                    insertData === null ||
                    typeof insertData !== "object" ||
                    Array.isArray(insertData)
                  ) {
                    return {
                      data: null,
                      error: new Error("invalid insert payload"),
                      count: 0,
                      status: 400,
                      statusText: "Bad Request",
                    };
                  }
                  const now: string = new Date().toISOString();
                  if ("role" in insertData && insertData.role === "user") {
                    const content: string =
                      "content" in insertData && typeof insertData.content === "string"
                        ? insertData.content
                        : "";
                    const userRow: Tables<"chat_messages"> = {
                      id: REFACTOR_TEST_USER_MSG_ID,
                      chat_id: REFACTOR_TEST_CHAT_ID,
                      user_id: REFACTOR_TEST_USER_ID,
                      role: "user",
                      content,
                      is_active_in_thread: true,
                      ai_provider_id: REFACTOR_TEST_PROVIDER_ID,
                      system_prompt_id: null,
                      token_usage: null,
                      error_type: null,
                      response_to_message_id: null,
                      created_at: now,
                      updated_at: now,
                    };
                    return {
                      data: [userRow],
                      error: null,
                      count: 1,
                      status: 201,
                      statusText: "Created",
                    };
                  }
                  if ("role" in insertData && insertData.role === "assistant") {
                    const id: string =
                      "id" in insertData && typeof insertData.id === "string"
                        ? insertData.id
                        : crypto.randomUUID();
                    const content: string =
                      "content" in insertData && typeof insertData.content === "string"
                        ? insertData.content
                        : "";
                    const assistantRow: Tables<"chat_messages"> = {
                      id,
                      chat_id: REFACTOR_TEST_CHAT_ID,
                      user_id: null,
                      role: "assistant",
                      content,
                      is_active_in_thread: true,
                      ai_provider_id: REFACTOR_TEST_PROVIDER_ID,
                      system_prompt_id: null,
                      token_usage: null,
                      error_type: null,
                      response_to_message_id: REFACTOR_TEST_USER_MSG_ID,
                      created_at: now,
                      updated_at: now,
                    };
                    return {
                      data: [assistantRow],
                      error: null,
                      count: 1,
                      status: 201,
                      statusText: "Created",
                    };
                  }
                  return {
                    data: null,
                    error: new Error("unexpected insert role"),
                    count: 0,
                    status: 400,
                    statusText: "Bad Request",
                  };
                },
              },
            },
          };
        }

        function buildDepsAndParams(): {
          chatDeps: ChatDeps;
          chatParams: ChatParams;
          mockAdminWallet: ReturnType<typeof createMockAdminTokenWalletService>;
          mockUserWallet: ReturnType<typeof createMockUserTokenWalletService>;
        } {
          const mockAdminWallet = createMockAdminTokenWalletService();
          const mockUserWallet = createMockUserTokenWalletService({
            getWalletByIdAndUser: (
              walletId: string,
              userId: string,
            ): Promise<TokenWallet | null> => {
              const now: Date = new Date();
              const wallet: TokenWallet = {
                walletId,
                userId,
                balance: "10000",
                currency: "AI_TOKEN",
                createdAt: now,
                updatedAt: now,
              };
              return Promise.resolve(wallet);
            },
          });
          const adapterPair = getMockAiProviderAdapter(mockLogger, providerConfig);

          const chatDeps: ChatDeps = {
            logger: mockLogger,
            adminTokenWalletService: mockAdminWallet.instance,
            userTokenWalletService: mockUserWallet.instance,
            streamRequest: streamRequest,
            handleCorsPreflightRequest,
            createSuccessResponse,
            createErrorResponse,
            prepareChatContext: prepareChatContext,
            countTokens: countTokens,
            debitTokens: debitTokens,
            getMaxOutputTokens: getMaxOutputTokens,
            findOrCreateChat: findOrCreateChat,
            constructMessageHistory: constructMessageHistory,
            getAiProviderAdapter: (_deps: FactoryDependencies) => adapterPair.instance,
          };

          const supabaseConfig: MockSupabaseDataConfig = buildSupabaseConfig();
          const userMockSetup = createMockSupabaseClient(REFACTOR_TEST_USER_ID, supabaseConfig);
          const adminMockSetup = createMockSupabaseClient("refactor-admin", {});
          const userClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(userMockSetup.client);
          const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(adminMockSetup.client);

          const mockUser = buildMockUserForChatHandlerUnitTests();
          const chatParams: ChatParams = {
            userClient,
            adminClient,
            getUserFn: buildAuthenticatedGetUserFn(mockUser),
          };

          return { chatDeps, chatParams, mockAdminWallet, mockUserWallet };
        }

        function buildRefactorPostPayload(): ChatPayload {
          const requestBody: ChatApiRequest = {
            message: "integration test message",
            providerId: REFACTOR_TEST_PROVIDER_ID,
            promptId: "__none__",
            chatId: REFACTOR_TEST_CHAT_ID,
            walletId: REFACTOR_TEST_WALLET_ID,
          };
          const req: Request = new Request(
            "https://example.com/refactor-integration-test",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            },
          );
          return { req };
        }

        await innerT.step(
          "Full POST flow with real StreamRequest, real path handlers, mocked external deps",
          async () => {
            const { chatDeps, chatParams } = buildDepsAndParams();
            const chatPayload: ChatPayload = buildRefactorPostPayload();

            const result = await handler(chatDeps, chatParams, chatPayload);

            assert(!(result instanceof Error), "handler should not return an Error");
            const response: Response = result as Response;
            assertEquals(response.status, 200);
            const contentType: string | null = response.headers.get("Content-Type");
            assertExists(contentType);
            assertStringIncludes(contentType, "text/event-stream");

            const body: string = await response.text();
            assertStringIncludes(body, '"type":"chat_start"');
            assertStringIncludes(body, '"type":"chat_complete"');
          },
        );

        await innerT.step(
          "AdminTokenWalletService and UserTokenWalletService correctly constructed and passed through",
          async () => {
            const { chatDeps, chatParams, mockAdminWallet, mockUserWallet } =
              buildDepsAndParams();
            const chatPayload: ChatPayload = buildRefactorPostPayload();

            const result = await handler(chatDeps, chatParams, chatPayload);
            assert(!(result instanceof Error), "handler should not return an Error");

            // Consume the stream so all side effects complete
            const response: Response = result as Response;
            await response.text();

            // adminTokenWalletService.recordTransaction called by debitTokens inside StreamChat
            assert(
              mockAdminWallet.stubs.recordTransaction.calls.length > 0,
              "adminTokenWalletService.recordTransaction should have been called (proves admin wallet flows through handler → streamRequest → StreamChat → debitTokens)",
            );

            // userTokenWalletService.getWalletByIdAndUser called by prepareChatContext
            assert(
              mockUserWallet.stubs.getWalletByIdAndUser.calls.length > 0,
              "userTokenWalletService.getWalletByIdAndUser should have been called (proves user wallet flows through handler → streamRequest → prepareChatContext)",
            );
          },
        );

        await innerT.step(
          "old tokenWalletService field does not exist anywhere in the dependency chain",
          () => {
            const { chatDeps } = buildDepsAndParams();

            // Runtime: ChatDeps has no legacy tokenWalletService field
            assertEquals(
              "tokenWalletService" in chatDeps,
              false,
              "ChatDeps must not contain the legacy 'tokenWalletService' field",
            );

            // Confirm the new fields exist
            assertExists(chatDeps.adminTokenWalletService, "adminTokenWalletService must exist in ChatDeps");
            assertExists(chatDeps.userTokenWalletService, "userTokenWalletService must exist in ChatDeps");
          },
        );
      });

      console.log("All specified test groups completed.");

    } finally {
      await teardownTestSuiteRouter();
    }
  },
});