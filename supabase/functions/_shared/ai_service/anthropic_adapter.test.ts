// supabase/functions/_shared/ai_service/anthropic_adapter.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import Anthropic from 'npm:@anthropic-ai/sdk';
import { APIPromise } from 'npm:@anthropic-ai/sdk@0.71.2/core/api-promise';
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
  content: [{ type: "text", text: " Okay, how can I help you today? ", citations: [] }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
      input_tokens: 75,
      output_tokens: 20,
      cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: 0 },
      service_tier: "standard",
  },
};

const MOCK_ANTHROPIC_MODELS_RESPONSE = {
    data: [
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
    ]
};

function createMockMessagePromise(msg: Message): APIPromise<Message> {
    const client = new Anthropic({ apiKey: 'sk-ant-test-key' });
    const response = new Response(JSON.stringify(msg), {
        headers: { 'request-id': 'test-request-id' },
    });
    type ResponsePromise = ConstructorParameters<typeof APIPromise>[1];
    type ResponseProps = Awaited<ResponsePromise>;

    const props: ResponseProps = {
        response,
        options: {
            method: 'post',
            path: '/v1/messages',
        },
        controller: new AbortController(),
        requestLogID: 'test-request-log-id',
        retryOfRequestLogID: undefined,
        startTime: Date.now(),
    };

    const responsePromise: ResponsePromise = Promise.resolve(props);
    const parseResponse = () => msg;
    return new APIPromise<Message>(client, responsePromise, parseResponse);
}

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

// --- resourceDocuments tests ---

Deno.test("AnthropicAdapter - resourceDocuments: when present appear as type document blocks in API call", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockMessagePromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
        const adapter = new AnthropicAdapter(MOCK_PROVIDER, 'sk-ant-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            max_tokens_to_generate: 200,
            resourceDocuments: [
                { id: 'd1', content: 'Doc A content', document_key: 'business_case', stage_slug: 'thesis' },
                { id: 'd2', content: 'Doc B content', document_key: 'feature_spec', stage_slug: 'thesis' },
            ],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        assertEquals(messagesCreateStub.calls.length, 1);
        const callArgs = messagesCreateStub.calls[0].args[0];
        const firstMessage = callArgs.messages[0];
        assert(Array.isArray(firstMessage.content), 'First message content must be array');
        const content = firstMessage.content;
        assert(content.length >= 2, 'Must have at least 2 document blocks');
        assert(content[0].type === 'document', 'First block must be type document');
        assert(content[1].type === 'document', 'Second block must be type document');
        assert(content[0].source.type === 'text', 'Document source must be PlainTextSource');
        assertEquals(content[0].source.media_type, 'text/plain');
        assertEquals(content[0].source.data, 'Doc A content');
        assertEquals(content[0].title, 'business_case');
        assertEquals(content[0].context, 'thesis');
        assertEquals(content[1].title, 'feature_spec');
        assertEquals(content[1].context, 'thesis');
        const textBlock = content.find((c) => c.type === 'text');
        assert(textBlock && textBlock.type === 'text', 'Must have text block after document blocks');
        assert(typeof textBlock.text === 'string' && textBlock.text.includes('User prompt'), 'Text block must contain user message');
    } finally {
        messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter - resourceDocuments: empty resourceDocuments does not add document blocks", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockMessagePromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
        const adapter = new AnthropicAdapter(MOCK_PROVIDER, 'sk-ant-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            max_tokens_to_generate: 200,
            resourceDocuments: [],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        assertEquals(messagesCreateStub.calls.length, 1);
        const callArgs = messagesCreateStub.calls[0].args[0];
        const firstMessage = callArgs.messages[0];
        assert(Array.isArray(firstMessage.content), 'First message content must be array');
        const content = firstMessage.content;
        const documentBlocks = content.filter((c) => c.type === 'document');
        assertEquals(documentBlocks.length, 0, 'Must not add document blocks when resourceDocuments is empty');
    } finally {
        messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter - resourceDocuments: document blocks prepended before user text content", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockMessagePromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
        const adapter = new AnthropicAdapter(MOCK_PROVIDER, 'sk-ant-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            max_tokens_to_generate: 200,
            resourceDocuments: [{ content: 'Doc content', document_key: 'key', stage_slug: 'thesis' }],
        };

        await adapter.sendMessage(request, MOCK_MODEL_CONFIG.api_identifier);

        const callArgs = messagesCreateStub.calls[0].args[0];
        const msgContent = callArgs.messages[0].content;
        assert(Array.isArray(msgContent), 'First message content must be array');
        const content = msgContent;
        const documentIndex = content.findIndex((c) => c.type === 'document');
        const textIndex = content.findIndex((c) => c.type === 'text');
        assert(documentIndex >= 0, 'Must have document block');
        assert(textIndex >= 0, 'Must have text block');
        assert(documentIndex < textIndex, 'Document blocks must be prepended before text content');
    } finally {
        messagesCreateStub.restore();
    }
});
