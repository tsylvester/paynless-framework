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
import type { AdapterResponsePayload, ChatApiRequest, ProviderModelInfo, AiModelExtendedConfig } from "../types.ts";
import { MockLogger } from "../logger.mock.ts";

// --- Mock Data & Helpers ---

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'gpt-4o',
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
};
const mockLogger = new MockLogger();

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
    
    await testAdapterContract(t, OpenAiAdapter, mockOpenAiApi, MOCK_MODEL_CONFIG);
    
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
        const adapter = new OpenAiAdapter('sk-test-key', mockLogger, MOCK_EMBEDDING_MODEL_CONFIG);
        const result = await adapter.getEmbedding("Hello world");

        assertEquals(createStub.calls.length, 1);
        // Verify the stub was called with the correct model from the config
        const createCallArgs = createStub.calls[0].args[0];
        assertEquals(createCallArgs.model, 'text-embedding-3-small');
        
        assertExists(result);
        assertEquals(result, MOCK_EMBEDDING_SUCCESS_RESPONSE);

    } finally {
        createStub.restore();
    }
});
