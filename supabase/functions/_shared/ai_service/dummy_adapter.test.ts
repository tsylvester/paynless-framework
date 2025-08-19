// supabase/functions/_shared/ai_service/dummy_adapter.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { DummyAdapter } from "./dummy_adapter.ts";
import { testAdapterContract, type MockApi } from "./adapter_test_contract.ts";
import type { AdapterResponsePayload, AiModelExtendedConfig, ChatApiRequest, ProviderModelInfo, Messages } from "../types.ts";
import { MockLogger } from "../logger.mock.ts";
import { countTokensForMessages } from "../utils/tokenizer_utils.ts";
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
        const promptMessages: Messages[] = request.messages || [{ role: 'user', content: request.message }];
        const completionMessage: Messages = { role: 'assistant', content: responseContent };
        
        const promptTokens = countTokensForMessages(promptMessages, MOCK_MODEL_CONFIG);
        const completionTokens = countTokensForMessages([completionMessage], MOCK_MODEL_CONFIG);

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

    const expectedPromptTokens = countTokensForMessages(
        [{ role: 'user', content: request.message }],
        MOCK_MODEL_CONFIG
    );
    const expectedCompletionTokens = countTokensForMessages(
        [{ role: 'assistant', content: result.content }],
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
