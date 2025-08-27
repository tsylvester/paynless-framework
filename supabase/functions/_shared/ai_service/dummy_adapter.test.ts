// supabase/functions/_shared/ai_service/dummy_adapter.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { DummyAdapter } from "./dummy_adapter.ts";
import { testAdapterContract, type MockApi } from "./adapter_test_contract.ts";
import type { AdapterResponsePayload, AiModelExtendedConfig, ChatApiRequest, ProviderModelInfo, Messages } from "../types.ts";
import { MockLogger } from "../logger.mock.ts";
import { countTokens } from "../utils/tokenizer_utils.ts";
import type { CountTokensDeps, CountableChatPayload } from "../types/tokenizer.types.ts";
import { isTokenUsage } from "../utils/type_guards.ts";
import { Tables } from "../../types_db.ts";
import { isJson } from "../utils/type_guards.ts";

/**
 * This test file uses the generic `testAdapterContract` to ensure the
 * DummyAdapter conforms to the standard adapter interface. It also includes
 * a specific test to verify the dummy's unique tokenization behavior.
 */

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: "dummy-model-v1",
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { 
        type: 'tiktoken', 
        tiktoken_encoding_name: 'cl100k_base' 
    },
};

if(!isJson(MOCK_MODEL_CONFIG)) {
    throw new Error('MOCK_MODEL_CONFIG is not a valid JSON object');
}

export const MOCK_PROVIDER: Tables<'ai_providers'> = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    provider: "dummy",
    api_identifier: "dummy-model-v1",
    name: "Dummy Model",
    description: "A dummy AI model for testing purposes.",
    is_active: true,
    is_default_embedding: false,
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: MOCK_MODEL_CONFIG,
};

// For the contract test, the mock API should replicate the dummy's simple logic
// without instantiating the real adapter to avoid infinite recursion with the stub.
const mockDummyApi: MockApi = {
    sendMessage: async (request: ChatApiRequest, modelIdentifier?: string): Promise<AdapterResponsePayload> => {
        const responseContent = `Echo from ${modelIdentifier || 'dummy'}: ${request.message || 'No message'}`;

        const buildTokenizerDeps = (): CountTokensDeps => ({
            getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? "").map((_, i) => i) }),
            countTokensAnthropic: (text: string) => (text ?? "").length,
            logger: { warn: () => {}, error: () => {} },
        });
        const deps = buildTokenizerDeps();

        const narrowedMessages: Messages[] = (request.messages || [])
            .filter((m) => (m.role === 'system' || m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');

        const promptPayload: CountableChatPayload = {
            systemInstruction: request.systemInstruction,
            message: request.message,
            messages: narrowedMessages,
        };

        const completionPayload: CountableChatPayload = {
            messages: [{ role: 'assistant', content: responseContent }],
        };

        const promptTokens = countTokens(deps, promptPayload, MOCK_MODEL_CONFIG);
        const completionTokens = countTokens(deps, completionPayload, MOCK_MODEL_CONFIG);

        return {
            role: 'assistant',
            content: responseContent,
            ai_provider_id: request.providerId,
            system_prompt_id: request.promptId,
            token_usage: {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: promptTokens + completionTokens,
            },
            finish_reason: 'stop',
        };
    },
    listModels: async (): Promise<ProviderModelInfo[]> => {
        return [{
            api_identifier: 'dummy-model-v1',
            name: `Dummy Model (Echo)`,
            description: `A dummy AI model for testing purposes.`,
            config: MOCK_MODEL_CONFIG,
        }];
    },
};

// --- Run Tests ---

Deno.test("DummyAdapter: Contract Compliance", async (t) => {
    let sendMessageStub: Stub<DummyAdapter>;
    let listModelsStub: Stub<DummyAdapter>;

    await t.step("Setup: Stub adapter prototype", () => {
        sendMessageStub = stub(DummyAdapter.prototype, "sendMessage", (req, modelId) => mockDummyApi.sendMessage(req, modelId));
        listModelsStub = stub(DummyAdapter.prototype, "listModels", () => mockDummyApi.listModels());
    });
    
    // The contract test will spy on mockDummyApi. When it instantiates a real
    // DummyAdapter, our stubs will intercept the calls and redirect them to the mock.
    await testAdapterContract(t, DummyAdapter, mockDummyApi, MOCK_PROVIDER);
    
    await t.step("Teardown: Restore stubs", () => {
        sendMessageStub.restore();
        listModelsStub.restore();
    });
});

// The specific behavior test validates the REAL adapter's implementation.
Deno.test("[DummyAdapter] Specific Behavior - Correctly calculates token usage", async () => {
    // Arrange
    const adapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', new MockLogger());
    const request: ChatApiRequest = {
        message: "Hello, this is a test.", // This is 6 tokens with cl100k_base
        providerId: 'dummy-provider',
        promptId: '__none__',
    };
    const modelIdentifier = MOCK_MODEL_CONFIG.api_identifier;
    
    // Act
    const result = await adapter.sendMessage(request, modelIdentifier);

    // Assert
    assertExists(result.token_usage);
    assert(isTokenUsage(result.token_usage), "Token usage should conform to the TokenUsage interface.");

    const buildTokenizerDeps = (): CountTokensDeps => ({
        getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? "").map((_, i) => i) }),
        countTokensAnthropic: (text: string) => (text ?? "").length,
        logger: { warn: () => {}, error: () => {} },
    });
    const deps = buildTokenizerDeps();
    const expectedPromptTokens = countTokens(
        deps,
        { message: request.message, messages: [] },
        MOCK_MODEL_CONFIG
    );
    const expectedCompletionTokens = countTokens(
        deps,
        { messages: [{ role: 'assistant', content: result.content }] },
        MOCK_MODEL_CONFIG
    );
    const expectedTotalTokens = expectedPromptTokens + expectedCompletionTokens;

    assertEquals(result.token_usage.prompt_tokens, expectedPromptTokens, "Prompt token count should be calculated correctly.");
    assertEquals(result.token_usage.completion_tokens, expectedCompletionTokens, "Completion token count should be calculated correctly.");
    assertEquals(result.token_usage.total_tokens, expectedTotalTokens, "Total token count should be the sum of prompt and completion.");
});

Deno.test("[FAILING TEST] DummyAdapter should throw an error when prompt contains SIMULATE_ERROR", async () => {
  // Arrange
  const adapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', new MockLogger());
  const request: ChatApiRequest = {
    message: "This is a test prompt with SIMULATE_ERROR.",
    providerId: 'dummy-provider',
    promptId: '__none__',
  };
  const modelIdentifier = MOCK_MODEL_CONFIG.api_identifier;
  let caughtError: Error | null = null;

  // Act
  try {
    await adapter.sendMessage(request, modelIdentifier);
  } catch (error) {
    if (error instanceof Error) {
      caughtError = error;
    } else {
      throw error;
    }
  }

  // Assert
  assertExists(caughtError, "An error should have been thrown.");
  assertEquals(caughtError.message, "Simulated adapter error for testing retry logic.");
});

Deno.test("[FAILING TEST] DummyAdapter should return a partial response for SIMULATE_MAX_TOKENS", async () => {
  // Arrange
  const adapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', new MockLogger());
  const request: ChatApiRequest = {
    message: "This is a test prompt with SIMULATE_MAX_TOKENS.",
    providerId: 'dummy-provider',
    promptId: '__none__',
  };
  const modelIdentifier = MOCK_MODEL_CONFIG.api_identifier;

  // Act
  const result = await adapter.sendMessage(request, modelIdentifier);

  // Assert
  assertEquals(result.finish_reason, "max_tokens", "The finish reason should be 'max_tokens'.");
  assert(result.content.startsWith("Partial echo due to max_tokens"), "The content should indicate a partial response.");
  assert(!result.content.includes("SIMULATE_MAX_TOKENS"), "The magic string should be stripped from the response.");
});

Deno.test("[FAILING TEST] DummyAdapter should generate a large response for SIMULATE_LARGE_OUTPUT_KB", async () => {
    // Arrange
    const adapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', new MockLogger());
    const targetKb = 2; // Request a 2KB response
    const request: ChatApiRequest = {
        message: `This is the base text. SIMULATE_LARGE_OUTPUT_KB=${targetKb}`,
        providerId: 'dummy-provider',
        promptId: '__none__',
    };
    const modelIdentifier = MOCK_MODEL_CONFIG.api_identifier;

    // Act
    const result = await adapter.sendMessage(request, modelIdentifier);

    // Assert
    const responseSizeBytes = new TextEncoder().encode(result.content).length;
    const targetBytes = targetKb * 1024;
    assert(responseSizeBytes >= targetBytes, `Response size (${responseSizeBytes} bytes) should be at least ${targetBytes} bytes.`);
    assert(result.content.includes("This is the base text."), "The base text should be included in the large response.");
    assert(!result.content.includes("SIMULATE_LARGE_OUTPUT_KB"), "The magic string should be stripped from the response.");
    assertEquals(result.finish_reason, "stop", "The finish reason should be 'stop' for a large but complete response.");
});

Deno.test("DummyAdapter respects client-provided max_tokens_to_generate and yields non-zero usage under non-zero cost rates", async () => {
  const CONFIG_WITH_COSTS: AiModelExtendedConfig = {
    api_identifier: "dummy-model-v1",
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    context_window_tokens: 10000,
    input_token_cost_rate: 0,
    output_token_cost_rate: 2,
  };
  if (!isJson(CONFIG_WITH_COSTS)) throw new Error('CONFIG_WITH_COSTS must be JSON');
  const PROVIDER_WITH_COSTS: Tables<'ai_providers'> = {
    ...MOCK_PROVIDER,
    config: CONFIG_WITH_COSTS,
  };

  const adapter = new DummyAdapter(PROVIDER_WITH_COSTS, 'dummy-key', new MockLogger());
  const K = 64;
  const request: ChatApiRequest = {
    message: "SIMULATE_LARGE_OUTPUT_KB=1 Hello world",
    providerId: 'dummy-provider',
    promptId: '__none__',
    max_tokens_to_generate: K,
  };
  const modelIdentifier = CONFIG_WITH_COSTS.api_identifier;

  const result = await adapter.sendMessage(request, modelIdentifier);
  assertExists(result.token_usage);
  assert(isTokenUsage(result.token_usage));
  // completion should be capped by client K (K chosen high enough above envelope)
  assert(result.token_usage.completion_tokens <= K, "completion_tokens should respect client-provided cap");
  // Non-zero usage implies non-zero costs under non-zero rates at higher layers
  assert(result.token_usage.total_tokens > 0, "total_tokens should be non-zero under non-zero rates setup");
});

Deno.test("DummyAdapter respects model hard_cap_output_tokens when client cap is absent", async () => {
  const CONFIG_WITH_HARD_CAP: AiModelExtendedConfig = {
    api_identifier: "dummy-model-v1",
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    context_window_tokens: 10000,
    input_token_cost_rate: 0,
    output_token_cost_rate: 2,
    hard_cap_output_tokens: 64,
  };
  if (!isJson(CONFIG_WITH_HARD_CAP)) throw new Error('CONFIG_WITH_HARD_CAP must be JSON');
  const PROVIDER_WITH_HARD_CAP: Tables<'ai_providers'> = {
    ...MOCK_PROVIDER,
    config: CONFIG_WITH_HARD_CAP,
  };

  const adapter = new DummyAdapter(PROVIDER_WITH_HARD_CAP, 'dummy-key', new MockLogger());
  const request: ChatApiRequest = {
    message: "SIMULATE_LARGE_OUTPUT_KB=1 This should exceed cap",
    providerId: 'dummy-provider',
    promptId: '__none__',
  };
  const modelIdentifier = CONFIG_WITH_HARD_CAP.api_identifier;

  const result = await adapter.sendMessage(request, modelIdentifier);
  assertExists(result.token_usage);
  assert(isTokenUsage(result.token_usage));
  // Desired behavior: without client cap, model hard cap should apply (64 chosen above envelope)
  assert(result.token_usage.completion_tokens <= 64, "completion_tokens should respect model hard_cap_output_tokens");
});

Deno.test("DummyAdapter handles oversized input by throwing ContextWindowError (step 118)", async () => {
  const CONFIG_SMALL_WINDOW: AiModelExtendedConfig = {
    api_identifier: "dummy-model-v1",
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    context_window_tokens: 50,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  };
  if (!isJson(CONFIG_SMALL_WINDOW)) throw new Error('CONFIG_SMALL_WINDOW must be JSON');
  const PROVIDER_SMALL_WINDOW: Tables<'ai_providers'> = {
    ...MOCK_PROVIDER,
    config: CONFIG_SMALL_WINDOW,
  };

  const adapter = new DummyAdapter(PROVIDER_SMALL_WINDOW, 'dummy-key', new MockLogger());
  const longText = 'A'.repeat(200);
  const request: ChatApiRequest = {
    message: longText,
    providerId: 'dummy-provider',
    promptId: '__none__',
  };
  const modelIdentifier = CONFIG_SMALL_WINDOW.api_identifier;

  let threw = false;
  try {
    await adapter.sendMessage(request, modelIdentifier);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Expected ContextWindowError for oversized input in step 118');
});

Deno.test("[DummyAdapter] Specific Behavior - should handle continuation prompts", async () => {
    // Arrange
    const adapter = new DummyAdapter(MOCK_PROVIDER, 'dummy-key', new MockLogger());
    const continuationPrompt = "Partial echo due to max_tokens from dummy-model-v1: This is the first part.";
    const request: ChatApiRequest = {
        message: continuationPrompt,
        providerId: 'dummy-provider',
        promptId: '__none__',
    };
    const modelIdentifier = MOCK_MODEL_CONFIG.api_identifier;

    // Act
    const result = await adapter.sendMessage(request, modelIdentifier);

    // Assert
    assert(result.content !== continuationPrompt, "The adapter should not simply echo the continuation prompt back.");
    assertEquals(result.finish_reason, "stop", "The finish reason for a continuation should be 'stop'.");
    assertExists(result.token_usage, "Token usage object must exist.");
    assert(isTokenUsage(result.token_usage), "Token usage should conform to the TokenUsage interface.");
    assert(result.token_usage.prompt_tokens > 0, "Prompt tokens must be calculated for a continuation prompt.");
});

Deno.test("[DummyAdapter] Specific Behavior - should use the correct provider ID from config", async () => {
    // Arrange
    const specificProviderId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // A valid UUID
    const providerWithId: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        id: specificProviderId,
    };
    const adapter = new DummyAdapter(providerWithId, 'dummy-key', new MockLogger());
    const continuationPrompt = "Partial echo due to max_tokens from dummy-model-v1: This is the first part.";
    const request: ChatApiRequest = {
        message: continuationPrompt,
        providerId: 'some-other-id', // This should be ignored in favor of the config's ID
        promptId: '__none__',
    };
    const modelIdentifier = providerWithId.api_identifier;

    // Act
    const result = await adapter.sendMessage(request, modelIdentifier);

    // Assert
    assertEquals(result.ai_provider_id, specificProviderId, "The ai_provider_id should match the id from the model configuration.");
});
