import {
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
import type { ChatApiRequest, ChatHandlerSuccessResponse, AiModelExtendedConfig } from "../_shared/types.ts";

// Import the test group runner
import { runHappyPathTests } from './happy_path.integration.test.ts';
import { runEdgeCaseTests } from './edge_cases.integration.test.ts';
import { runSpecificConfigsTests } from './specific_configs.integration.test.ts';
import { runAuthValidationTests } from "./auth_validation.integration.test.ts";

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
      await t.step("[Test Group] Edge Cases", async (innerT: Deno.TestContext) => {
        await runEdgeCaseTests(innerT, initializeTestGroupEnvironmentRouter);
      });

      // Call the Specific Configs tests
      await t.step("[Test Group] Specific Configurations", async (innerT: Deno.TestContext) => {
        await runSpecificConfigsTests(innerT, initializeTestGroupEnvironmentRouter);
      });

      // Run Auth and Validation tests
      await t.step("[Test Group] Auth and Input Validation", async (t_auth_val) => {
        await runAuthValidationTests(t_auth_val, coreInitializeTestStep);
      });

      console.log("All specified test groups completed.");

    } finally {
      await teardownTestSuiteRouter();
    }
  },
});