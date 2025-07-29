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
    identifier: { api_identifier: "gpt-3.5-turbo-test" },
    desiredState: {
      name: "GPT-3.5 Turbo (Test)",
      api_identifier: "gpt-3.5-turbo-test",
      provider: "openai",
      is_active: true,
      config: {
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } as AiModelExtendedConfig['tokenization_strategy'],
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        requires_api_key: false,
      }
    }
  },
  {
    tableName: "ai_providers",
    identifier: { api_identifier: "gpt-4-costly-test" },
    desiredState: {
      name: "GPT-4 Costly (Test)",
      api_identifier: "gpt-4-costly-test",
      provider: "openai",
      is_active: true,
      config: {
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } as AiModelExtendedConfig['tokenization_strategy'],
        input_token_cost_rate: 0.03,
        output_token_cost_rate: 0.06,
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
        tokenization_strategy: { type: "anthropic_tokenizer" } as AiModelExtendedConfig['tokenization_strategy'],
        input_token_cost_rate: 0.008,
        output_token_cost_rate: 0.024,
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
        tokenization_strategy: { type: "google_gemini_tokenizer" } as AiModelExtendedConfig['tokenization_strategy'],
        input_token_cost_rate: 0.000125,
        output_token_cost_rate: 0.000375,
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
        tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 4 } as AiModelExtendedConfig['tokenization_strategy'],
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0001,
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
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } as AiModelExtendedConfig['tokenization_strategy'],
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
  } = {}
): Promise<{ primaryUserId: string; processedResources: ProcessedResourceInfo[] }> {
  const finalConfig: TestSetupConfig = {
    ...options,
    resources: [...allDefaultTestResources, ...(options.additionalResources || [])]
  };
  if ('additionalResources' in finalConfig) {
    delete (finalConfig as any).additionalResources;
  }

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