// supabase/functions/_shared/ai_service/openai_adapter.test.ts
import "npm:openai/shims/web";
import { assert, assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { APIPromise } from 'npm:openai/core';
import type { FinalRequestOptions } from 'npm:openai/core';
import type { ChatCompletion, ChatCompletionCreateParams, ChatCompletionMessageParam } from 'npm:openai/resources/chat/completions';
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

import { Page } from 'npm:openai/pagination';

// --- Mock Data & Helpers ---

const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'openai-gpt-4o',
    input_token_cost_rate: 2.5,
    output_token_cost_rate: 10.0,
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

function isChatCompletionCreateParams(val: unknown): val is ChatCompletionCreateParams {
    if (typeof val !== 'object' || val === null) return false;
    const messages: unknown = Object.getOwnPropertyDescriptor(val, 'messages')?.value;
    if (!Array.isArray(messages)) return false;
    return true;
}

function getMessageTextContent(msg: ChatCompletionMessageParam): string {
    const content: unknown = Object.getOwnPropertyDescriptor(msg, 'content')?.value;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    let out = '';
    for (const part of content) {
        if (typeof part !== 'object' || part === null) continue;
        const text: unknown = Object.getOwnPropertyDescriptor(part, 'text')?.value;
        if (typeof text === 'string') out += text;
    }
    return out;
}

type ApiResponsePromise = ConstructorParameters<typeof APIPromise>[0];
type ApiResponseProps = Awaited<ApiResponsePromise>;

function buildApiResponseProps(): ApiResponseProps {
    const response = new Response();
    const options: FinalRequestOptions = { method: 'post', path: '/v1/chat/completions' };
    const controller = new AbortController();
    return { response, options, controller };
}

function createMockAPIPromise<T extends object>(resp: T): APIPromise<T> {
    const responsePromise: ApiResponsePromise = Promise.resolve(buildApiResponseProps());
    const requestId = 'test-request-id';
    const parseResponse = (_props: ApiResponseProps) =>
        Promise.resolve(Object.assign({}, resp, { _request_id: requestId }));
    return new APIPromise<T>(responsePromise, parseResponse as any);
} 

class MockPagePromise<T extends Page<Item>, Item> extends APIPromise<T> implements PagePromise<T, Item> {
    constructor(private page: T) {
        super(
            Promise.resolve(buildApiResponseProps()),
            (() => Promise.resolve(Object.assign(page, { _request_id: 'req' }))) as any
        );
    }
    
    async *[Symbol.asyncIterator](): AsyncGenerator<Item, any, unknown> {
        for (const item of this.page.getPaginatedItems()) {
            yield item;
        }
    }

    getPaginatedItems(): Item[] {
        return this.page.getPaginatedItems();
    }
    
    hasNextPage(): boolean {
        return this.page.hasNextPage();
    }
    
    nextPageParams(): Partial<Record<string, unknown>> | null {
        return this.page.nextPageParams();
    }
    
    nextPageInfo(): Record<string, unknown> | null {
        return this.page.nextPageInfo();
    }
}

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
    
    const createStub = stub(OpenAI.Embeddings.prototype, "create", () => createMockAPIPromise(MOCK_EMBEDDING_SUCCESS_RESPONSE));

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
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockAPIPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

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
        const mct: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_completion_tokens')?.value
            : undefined;
        const mt: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_tokens')?.value
            : undefined;
        assertExists(mct);
        assertEquals(mct, 123);
        assertEquals(mt === undefined || mt === null, true);
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - Specific Tests: uses max_tokens for legacy chat models", async () => {

    const LEGACY_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        api_identifier: 'openai-gpt-3.5-turbo',
        config: Object.assign({}, MOCK_MODEL_CONFIG, {
            api_identifier: 'openai-gpt-3.5-turbo',
        }),
    };

    const adapter = new OpenAiAdapter(LEGACY_PROVIDER, 'sk-test-key', mockLogger);
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockAPIPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

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
        const mt: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_tokens')?.value
            : undefined;
        const mct: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_completion_tokens')?.value
            : undefined;
        assertExists(mt);
        assertEquals(mt, 123);
        assertEquals(mct === undefined || mct === null, true);
    } finally {
        chatCreateStub.restore();
    }
});

// --- resourceDocuments tests ---

Deno.test("OpenAiAdapter - resourceDocuments: when present appear as text in messages", async () => {
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockAPIPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

    try {
        const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [
                { id: 'd1', content: 'Doc A content', document_key: 'business_case', stage_slug: 'thesis' },
                { id: 'd2', content: 'Doc B content', document_key: 'feature_spec', stage_slug: 'thesis' },
            ],
        };

        await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        if (!isChatCompletionCreateParams(payloadUnknown)) throw new Error('payload must be ChatCompletionCreateParams');
        const allContent = payloadUnknown.messages.map(getMessageTextContent).join('\n');
        assert(allContent.includes('Doc A content'), 'Document content must appear as text in messages');
        assert(allContent.includes('Doc B content'), 'Document content must appear as text in messages');
        assert(allContent.includes('User prompt'), 'User message must be present');
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - resourceDocuments: document labels are present in message content", async () => {
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockAPIPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

    try {
        const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [
                { content: 'Doc content', document_key: 'success_metrics', stage_slug: 'thesis' },
            ],
        };

        await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        if (!isChatCompletionCreateParams(payloadUnknown)) throw new Error('payload must be ChatCompletionCreateParams');
        const allContent = payloadUnknown.messages.map(getMessageTextContent).join('\n');
        assert(allContent.includes('[Document:'), 'Document label must be present');
        assert(allContent.includes('from thesis]'), 'Document stage must be present in label');
        assert(allContent.includes('success_metrics'), 'document_key must be present in label');
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - resourceDocuments: empty resourceDocuments does not add placeholder messages", async () => {
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockAPIPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

    try {
        const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [],
        };

        await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        if (!isChatCompletionCreateParams(payloadUnknown)) throw new Error('payload must be ChatCompletionCreateParams');
        assertEquals(payloadUnknown.messages.length, 1, 'Must not add extra messages when resourceDocuments is empty');
        assertEquals(getMessageTextContent(payloadUnknown.messages[0]), 'User prompt', 'Only user message must be present');
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - Specific Tests: listModels returns clean config (does not spread provider config)", async () => {
    const DIRTY_MODEL_CONFIG: AiModelExtendedConfig = {
        api_identifier: 'openai-gpt-4o', 
        input_token_cost_rate: 1000, 
        output_token_cost_rate: 2000, 
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
        context_window_tokens: 500,
    };
    
    if(!isJson(DIRTY_MODEL_CONFIG)) {
        throw new Error('DIRTY_MODEL_CONFIG is not a valid JSON object');
    }

    const DIRTY_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        id: 'dirty-provider-id',
        config: DIRTY_MODEL_CONFIG,
    };

    const adapter = new OpenAiAdapter(DIRTY_PROVIDER, 'sk-test-key', mockLogger);

    // Create a valid Page object using the OpenAI library
    const client = new OpenAI({ apiKey: 'mock' });
    const response = new Response();
    const body = { data: MOCK_OPENAI_MODELS_RESPONSE_DATA, object: 'list' };
    const options: FinalRequestOptions = { method: 'get', path: '/v1/models' };
    
    const realPage = new Page<Model>(client, response, body, options);
    
    // Stub Models.list to return the mock page promise
    const listStub = stub(OpenAI.Models.prototype, "list", () => new MockPagePromise(realPage));
    
    try {
        const models = await adapter.listModels();
        
        assertEquals(listStub.calls.length, 1);
        
        const gpt4o = models.find(m => m.api_identifier === 'openai-gpt-4o');
        assertExists(gpt4o);
        
        // Assert it does NOT have any config property (it should be undefined)
        // This ensures no dirty values from the provider are leaked, and no fake defaults are invented.
        assertEquals(gpt4o.config, undefined, "config should be undefined");
        
    } finally {
        listStub.restore();
    }
});
