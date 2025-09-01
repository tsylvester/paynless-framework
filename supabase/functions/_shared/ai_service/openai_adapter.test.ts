// supabase/functions/_shared/ai_service/openai_adapter.test.ts
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { APIPromise } from 'npm:openai/core';
import type { ChatCompletion } from 'npm:openai/resources/chat/completions';
import type { Model, ModelsPage } from 'npm:openai/resources/models';
import type { PagePromise } from 'npm:openai/core';
import type { CreateEmbeddingResponse } from 'npm:openai/resources/embeddings';
import OpenAI from 'npm:openai';

import { OpenAiAdapter } from './openai_adapter.ts';
import { testAdapterContract, type MockApi } from './adapter_test_contract.ts';
import type { AdapterResponsePayload, ChatApiRequest, ProviderModelInfo, AiModelExtendedConfig, EmbeddingResponse } from "../types.ts";
import { MockLogger } from "../logger.mock.ts";
import { Tables } from "../../types_db.ts";
import { isJson } from "../utils/type_guards.ts";

// --- Mock Data & Helpers ---

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'gpt-4o',
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
};
const mockLogger = new MockLogger();

if(!isJson(MOCK_MODEL_CONFIG)) {
    throw new Error('MOCK_MODEL_CONFIG is not a valid JSON object');
}

const MOCK_PROVIDER: Tables<'ai_providers'> = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12", // Unique mock ID
    provider: "openai",
    api_identifier: "openai-gpt-4o",
    name: "OpenAI GPT-4o",
    description: "A mock OpenAI model for testing.",
    is_active: true,
    is_default_embedding: false,
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: MOCK_MODEL_CONFIG,
};

const MOCK_OPENAI_SUCCESS_RESPONSE: ChatCompletion = {
  id: 'chatcmpl-xxxxxxxx',
  object: 'chat.completion',
  created: 1700000000,
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: ' \n\nGeneral Kenobi! ', refusal: null },
      logprobs: null,
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
};

const MOCK_OPENAI_MODELS_RESPONSE_DATA: Model[] = [
    { id: "gpt-4o", object: "model", created: 1715367049, owned_by: "openai-internal" },
    { id: "gpt-3.5-turbo", object: "model", created: 1677610602, owned_by: "openai" },
];

// This is the mock API that the test contract will spy on.
const mockOpenAiApi: MockApi = {
    sendMessage: async (request: ChatApiRequest): Promise<AdapterResponsePayload> => {
        const tokenUsage = MOCK_OPENAI_SUCCESS_RESPONSE.usage!;
        return {
            role: 'assistant',
            content: MOCK_OPENAI_SUCCESS_RESPONSE.choices[0].message.content!.trim(),
            ai_provider_id: request.providerId,
            system_prompt_id: request.promptId,
            token_usage: {
                prompt_tokens: tokenUsage.prompt_tokens,
                completion_tokens: tokenUsage.completion_tokens,
                total_tokens: tokenUsage.total_tokens,
            },
            finish_reason: 'stop',
        };
    },
    listModels: async (): Promise<ProviderModelInfo[]> => {
        return MOCK_OPENAI_MODELS_RESPONSE_DATA.map(m => ({
            api_identifier: `openai-${m.id}`,
            name: `OpenAI ${m.id}`,
            description: `Owned by: ${m.owned_by}`,
            config: MOCK_MODEL_CONFIG,
        }));
    }
};

// --- Run Tests ---

Deno.test("OpenAI Adapter: Contract Compliance", async (t) => {
    let sendMessageStub: Stub<OpenAiAdapter>;
    let listModelsStub: Stub<OpenAiAdapter>;

    await t.step("Setup: Stub adapter prototype", () => {
        sendMessageStub = stub(OpenAiAdapter.prototype, "sendMessage", (req, modelId) => mockOpenAiApi.sendMessage(req, modelId));
        listModelsStub = stub(OpenAiAdapter.prototype, "listModels", () => mockOpenAiApi.listModels());
    });
    
    await testAdapterContract(t, OpenAiAdapter, mockOpenAiApi, MOCK_PROVIDER);
    
    await t.step("Teardown: Restore stubs", () => {
        sendMessageStub.restore();
        listModelsStub.restore();
    });
});

// --- Provider-Specific Tests ---

Deno.test("OpenAiAdapter - Specific Tests: getEmbedding", async () => {
    const MOCK_EMBEDDING_MODEL_CONFIG: AiModelExtendedConfig = {
        api_identifier: 'openai-text-embedding-3-small',
        input_token_cost_rate: 0,
        output_token_cost_rate: 0,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base', is_chatml_model: false },
    };

    if(!isJson(MOCK_EMBEDDING_MODEL_CONFIG)) {
        throw new Error('MOCK_EMBEDDING_MODEL_CONFIG is not a valid JSON object');
    }

    const MOCK_EMBEDDING_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', // Unique mock ID
        api_identifier: 'openai-text-embedding-3-small',
        config: MOCK_EMBEDDING_MODEL_CONFIG,
    };

    const MOCK_EMBEDDING_SUCCESS_RESPONSE: CreateEmbeddingResponse = {
        object: 'list',
        data: [{ object: 'embedding', embedding: [0.01, 0.02, 0.03], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 5, total_tokens: 5 },
    };
    
    function createMockEmbeddingPromise(resp: CreateEmbeddingResponse): APIPromise<CreateEmbeddingResponse> {
        return Promise.resolve(resp) as APIPromise<CreateEmbeddingResponse>;
    }

    const createStub = stub(OpenAI.Embeddings.prototype, "create", () => createMockEmbeddingPromise(MOCK_EMBEDDING_SUCCESS_RESPONSE));

    try {
        const adapter = new OpenAiAdapter(MOCK_EMBEDDING_PROVIDER, 'sk-test-key', mockLogger);
        const result: EmbeddingResponse = await adapter.getEmbedding("Hello world");

        assertEquals(createStub.calls.length, 1);
        // Verify the stub was called with the correct model from the config
        const createCallArgs = createStub.calls[0].args[0];
        assertEquals(createCallArgs.model, 'text-embedding-3-small');
        
        assertExists(result.embedding);
        assertEquals(Array.isArray(result.embedding), true);
        assertExists(result.usage);
        assertEquals(result.usage.total_tokens, MOCK_EMBEDDING_SUCCESS_RESPONSE.usage.total_tokens);

    } finally {
        createStub.restore();
    }
});

Deno.test("OpenAiAdapter - Specific Tests: uses max_completion_tokens for o-series", async () => {
    // Arrange
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    function createMockChatPromise(resp: ChatCompletion): APIPromise<ChatCompletion> {
        return Promise.resolve(resp) as APIPromise<ChatCompletion>;
    }
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", (params) => createMockChatPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

    try {
        const request: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-uuid-test',
            promptId: 'prompt-uuid-test',
            messages: [ { role: 'user', content: 'Hi' } ],
            max_tokens_to_generate: 123,
        };

        await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        let mct: unknown = undefined;
        let mt: unknown = undefined;
        if (isJson(payloadUnknown) && typeof payloadUnknown === 'object' && payloadUnknown !== null) {
            // Narrow using runtime guards and index access
            // deno-lint-ignore no-explicit-any
            const rec = payloadUnknown as any;
            mct = rec['max_completion_tokens'];
            mt = rec['max_tokens'];
        }
        assertExists(mct);
        assertEquals(mct, 123);
        assertEquals(mt === undefined || mt === null, true);
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - Specific Tests: uses max_tokens for legacy chat models", async () => {
    // Arrange a legacy model provider
    const LEGACY_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        api_identifier: 'openai-gpt-3.5-turbo',
    };

    const adapter = new OpenAiAdapter(LEGACY_PROVIDER, 'sk-test-key', mockLogger);
    function createMockChatPromise(resp: ChatCompletion): APIPromise<ChatCompletion> {
        return Promise.resolve(resp) as APIPromise<ChatCompletion>;
    }
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", (params) => createMockChatPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

    try {
        const request: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-uuid-test',
            promptId: 'prompt-uuid-test',
            messages: [ { role: 'user', content: 'Hi' } ],
            max_tokens_to_generate: 123,
        };

        await adapter.sendMessage(request, LEGACY_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        let mt: unknown = undefined;
        let mct: unknown = undefined;
        if (isJson(payloadUnknown) && typeof payloadUnknown === 'object' && payloadUnknown !== null) {
            // deno-lint-ignore no-explicit-any
            const rec = payloadUnknown as any;
            mt = rec['max_tokens'];
            mct = rec['max_completion_tokens'];
        }
        assertExists(mt);
        assertEquals(mt, 123);
        assertEquals(mct === undefined || mct === null, true);
    } finally {
        chatCreateStub.restore();
    }
});
