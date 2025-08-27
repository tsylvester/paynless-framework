// supabase/functions/_shared/ai_service/anthropic_adapter.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import Anthropic from 'npm:@anthropic-ai/sdk';
import type { APIPromise } from 'npm:@anthropic-ai/sdk/core';
import type { Message, MessageParam, TextBlock } from 'npm:@anthropic-ai/sdk/resources/messages';

import { AnthropicAdapter } from './anthropic_adapter.ts';
import { testAdapterContract, type MockApi } from './adapter_test_contract.ts';
import type { AdapterResponsePayload, ChatApiRequest, ProviderModelInfo, AiModelExtendedConfig } from "../types.ts";
import { MockLogger } from "../logger.mock.ts";
import { Tables } from "../../types_db.ts";
import { isJson } from "../utils/type_guards.ts";

// --- Mock Data & Helpers ---

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'claude-3-opus-20240229',
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' },
};
const mockLogger = new MockLogger();

if(!isJson(MOCK_MODEL_CONFIG)) {
    throw new Error('MOCK_MODEL_CONFIG is not a valid JSON object');
}

const MOCK_PROVIDER: Tables<'ai_providers'> = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14", // Unique mock ID
    provider: "anthropic",
    api_identifier: "anthropic-claude-3-opus-20240229",
    name: "Anthropic Claude 3 Opus",
    description: "A mock Anthropic model for testing.",
    is_active: true,
    is_default_embedding: false,
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: MOCK_MODEL_CONFIG,
};

const MOCK_ANTHROPIC_SUCCESS_RESPONSE: Message = {
  id: "msg_01A1B2C3D4E5F6G7H8I9J0K1L2",
  type: "message",
  role: "assistant",
  model: "claude-3-opus-20240229",
  content: [{ type: "text", text: " Okay, how can I help you today? " }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 75, output_tokens: 20 },
};

const MOCK_ANTHROPIC_MODELS_RESPONSE = {
    data: [
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
    ]
};

// This is the mock API that the test contract will spy on.
const mockAnthropicApi: MockApi = {
            sendMessage: async (request: ChatApiRequest): Promise<AdapterResponsePayload> => {
            const usage = MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage;
            const contentBlock = MOCK_ANTHROPIC_SUCCESS_RESPONSE.content[0];
            const content = contentBlock.type === 'text' ? contentBlock.text : '';

            return {
                role: 'assistant',
                content: content.trim(),
                ai_provider_id: request.providerId,
                system_prompt_id: request.promptId,
                token_usage: {
                    prompt_tokens: usage.input_tokens,
                    completion_tokens: usage.output_tokens,
                    total_tokens: usage.input_tokens + usage.output_tokens,
                },
                finish_reason: 'stop',
            };
        },
    listModels: async (): Promise<ProviderModelInfo[]> => {
        return MOCK_ANTHROPIC_MODELS_RESPONSE.data.map(m => ({
            api_identifier: `anthropic-${m.id}`,
            name: m.name,
            config: MOCK_MODEL_CONFIG,
        }));
    }
};

// --- Run Tests ---

Deno.test("AnthropicAdapter: Contract Compliance", async (t) => {
    let sendMessageStub: Stub<AnthropicAdapter>;
    let listModelsStub: Stub<AnthropicAdapter>;

    await t.step("Setup: Stub adapter prototype", () => {
        sendMessageStub = stub(AnthropicAdapter.prototype, "sendMessage", (req, modelId) => mockAnthropicApi.sendMessage(req, modelId));
        listModelsStub = stub(AnthropicAdapter.prototype, "listModels", () => mockAnthropicApi.listModels());
    });

    await testAdapterContract(t, AnthropicAdapter, mockAnthropicApi, MOCK_PROVIDER);

    await t.step("Teardown: Restore stubs", () => {
        sendMessageStub.restore();
        listModelsStub.restore();
    });
});

// --- Provider-Specific Tests ---

Deno.test("AnthropicAdapter - Specific Tests: Alternating Role Filtering", async () => {
    // For this specific test, we need to stub the underlying client library `create` method
    // because we are testing the internal logic of the REAL sendMessage method, not the contract.
    function createMockMessagePromise(msg: Message): APIPromise<Message> {
        return Promise.resolve(msg) as APIPromise<Message>;
    }
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockMessagePromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));
            
    try {
        const adapter = new AnthropicAdapter(MOCK_PROVIDER, 'sk-ant-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'Third user message',
            providerId: 'test-provider',
            promptId: '__none__',
            max_tokens_to_generate: 200,
            messages: [
              { role: 'user', content: 'First user turn' },
              { role: 'assistant', content: 'First assistant turn' },
              { role: 'user', content: 'Second user turn, which is consecutive' },
            ],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);
        
        assertEquals(messagesCreateStub.calls.length, 1);
        const callArgs = messagesCreateStub.calls[0].args[0];
        
        // The adapter merges the last two user messages.
        assertEquals(callArgs.messages.length, 3, "Should have 3 messages after combining");

        const assertTextBlockContent = (message: MessageParam, expectedText: string) => {
            assert(Array.isArray(message.content) && message.content[0].type === 'text', `Message content is not a TextBlock`);
            assert((message.content[0].text).includes(expectedText));
        }

        assertTextBlockContent(callArgs.messages[0], 'First user turn');
        assertTextBlockContent(callArgs.messages[1], 'First assistant turn');
        assertTextBlockContent(callArgs.messages[2], 'Second user turn, which is consecutive');
        assertTextBlockContent(callArgs.messages[2], 'Third user message');
        
    } finally {
        messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter - Specific Tests: forwards client max_tokens_to_generate to Anthropic", async () => {
    function createMockMessagePromise(msg: Message): APIPromise<Message> {
        return Promise.resolve(msg) as APIPromise<Message>;
    }
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockMessagePromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
        const adapter = new AnthropicAdapter(MOCK_PROVIDER, 'sk-ant-test-key', mockLogger);
        const K = 123;
        const request: ChatApiRequest = {
            message: 'Hello max tokens',
            providerId: 'test-provider',
            promptId: '__none__',
            max_tokens_to_generate: K,
            messages: [ { role: 'user', content: 'u1' } ],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        assertEquals(messagesCreateStub.calls.length, 1);
        const callArgs = messagesCreateStub.calls[0].args[0];
        assertEquals(callArgs.max_tokens, K, 'Anthropic payload must use client-provided max_tokens_to_generate');
    } finally {
        messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter - Specific Tests: does NOT inject 4096 default when client cap is absent", async () => {
    function createMockMessagePromise(msg: Message): APIPromise<Message> {
        return Promise.resolve(msg) as APIPromise<Message>;
    }
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockMessagePromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
        // Provide a provider config with a model hard cap so the adapter need not inject 4096
        const PROVIDER_WITH_HARD_CAP: Tables<'ai_providers'> = {
            id: MOCK_PROVIDER.id,
            provider: MOCK_PROVIDER.provider,
            api_identifier: MOCK_PROVIDER.api_identifier,
            name: MOCK_PROVIDER.name,
            description: MOCK_PROVIDER.description,
            is_active: MOCK_PROVIDER.is_active,
            is_default_embedding: MOCK_PROVIDER.is_default_embedding,
            is_enabled: MOCK_PROVIDER.is_enabled,
            created_at: MOCK_PROVIDER.created_at,
            updated_at: MOCK_PROVIDER.updated_at,
            config: {
                api_identifier: MOCK_MODEL_CONFIG.api_identifier,
                input_token_cost_rate: MOCK_MODEL_CONFIG.input_token_cost_rate,
                output_token_cost_rate: MOCK_MODEL_CONFIG.output_token_cost_rate,
                tokenization_strategy: MOCK_MODEL_CONFIG.tokenization_strategy,
                hard_cap_output_tokens: 250,
            },
        };
        const adapter = new AnthropicAdapter(PROVIDER_WITH_HARD_CAP, 'sk-ant-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'No cap provided',
            providerId: 'test-provider',
            promptId: '__none__',
            messages: [ { role: 'user', content: 'u1' } ],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        assertEquals(messagesCreateStub.calls.length, 1);
        const callArgs = messagesCreateStub.calls[0].args[0];
        // With no client cap, adapter should use model hard cap (not 4096 fallback)
        assertEquals(callArgs.max_tokens, 250, 'Adapter must use model hard cap when client cap is absent');
    } finally {
        messagesCreateStub.restore();
    }
});
