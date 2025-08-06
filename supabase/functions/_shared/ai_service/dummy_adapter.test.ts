// supabase/functions/_shared/ai_service/dummy_adapter.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { DummyAdapter } from "./dummy_adapter.ts";
import { testAdapterContract, type MockApi } from "./adapter_test_contract.ts";
import type { AdapterResponsePayload, AiModelExtendedConfig, ChatApiRequest, ProviderModelInfo, MessageForTokenCounting } from "../types.ts";
import { MockLogger } from "../logger.mock.ts";
import { countTokensForMessages } from "../utils/tokenizer_utils.ts";
import { isTokenUsage } from "../utils/type_guards.ts";

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

// For the contract test, the mock API should replicate the dummy's simple logic
// without instantiating the real adapter to avoid infinite recursion with the stub.
const mockDummyApi: MockApi = {
    sendMessage: async (request: ChatApiRequest, modelIdentifier?: string): Promise<AdapterResponsePayload> => {
        const responseContent = `Echo from ${modelIdentifier || 'dummy'}: ${request.message || 'No message'}`;
        const promptMessages: MessageForTokenCounting[] = request.messages || [{ role: 'user', content: request.message }];
        const completionMessage: MessageForTokenCounting = { role: 'assistant', content: responseContent };
        
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
    await testAdapterContract(t, DummyAdapter, mockDummyApi, MOCK_MODEL_CONFIG);
    
    await t.step("Teardown: Restore stubs", () => {
        sendMessageStub.restore();
        listModelsStub.restore();
    });
});

// The specific behavior test validates the REAL adapter's implementation.
Deno.test("[DummyAdapter] Specific Behavior - Correctly calculates token usage", async () => {
    // Arrange
    const adapter = new DummyAdapter('dummy-key', new MockLogger(), MOCK_MODEL_CONFIG);
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
