// supabase/functions/_shared/ai_service/openai_adapter.test.ts
import "npm:openai/shims/web";
import { assert, assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { APIPromise } from 'npm:openai/core';
import type { FinalRequestOptions } from 'npm:openai/core';
import type { ChatCompletionChunk, ChatCompletionCreateParams, ChatCompletionMessageParam } from 'npm:openai/resources/chat/completions';
import type { Model, ModelsPage } from 'npm:openai/resources/models';
import type { PagePromise } from 'npm:openai/core';
import type { CreateEmbeddingResponse } from 'npm:openai/resources/embeddings';
import OpenAI from 'npm:openai';
import { Stream } from 'npm:openai/streaming';

import { OpenAiAdapter } from './openai_adapter.ts';
import { testAdapterContract, type MockApi } from './adapter_test_contract.ts';
import type { AdapterResponsePayload, AdapterStreamChunk, ChatApiRequest, ProviderModelInfo, AiModelExtendedConfig, EmbeddingResponse } from "../types.ts";
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
    is_default_generation: false,
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: MOCK_MODEL_CONFIG,
};

/** Trimmed assistant text matching the legacy batch mock (`General Kenobi!`). */
const MOCK_OPENAI_ASSISTANT_TEXT: string = 'General Kenobi!';

const MOCK_OPENAI_STREAM_USAGE = {
  prompt_tokens: 50,
  completion_tokens: 10,
  total_tokens: 60,
};

const MOCK_CHUNK_BASE: Pick<ChatCompletionChunk, 'id' | 'object' | 'created' | 'model'> = {
  id: 'chatcmpl-xxxxxxxx',
  object: 'chat.completion.chunk',
  created: 1700000000,
  model: 'gpt-4o',
};

/** Default stream: multiple deltas + final chunk with finish_reason and usage (stream_options.include_usage). */
function buildDefaultOpenAiStreamChunks(): ChatCompletionChunk[] {
  return [
    {
      ...MOCK_CHUNK_BASE,
      choices: [
        {
          index: 0,
          delta: { content: ' \n\n' },
          finish_reason: null,
        },
      ],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [
        {
          index: 0,
          delta: { content: 'General Kenobi! ' },
          finish_reason: null,
        },
      ],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ];
}

const DEFAULT_OPENAI_STREAM_CHUNKS: ChatCompletionChunk[] = buildDefaultOpenAiStreamChunks();

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

function makeStreamFromChunks(chunks: ChatCompletionChunk[]): Stream<ChatCompletionChunk> {
  const controller: AbortController = new AbortController();
  async function* iterator(): AsyncGenerator<ChatCompletionChunk> {
    for (const chunk of chunks) {
      yield chunk;
    }
  }
  return new Stream<ChatCompletionChunk>(() => iterator(), controller);
}

/** Resolves like `client.chat.completions.create({ stream: true, ... })` — `Stream<ChatCompletionChunk>`. */
function createMockStreamCompletionPromise(
  chunks: ChatCompletionChunk[],
): APIPromise<Stream<ChatCompletionChunk>> {
  const responsePromise: ApiResponsePromise = Promise.resolve(buildApiResponseProps());
  const parseResponse = (_props: ApiResponseProps) => {
    const streamBody: Stream<ChatCompletionChunk> = makeStreamFromChunks(chunks);
    return Promise.resolve(streamBody);
  };
  return new APIPromise<Stream<ChatCompletionChunk>>(responsePromise, parseResponse);
}

/** Rejects like `client.chat.completions.create` when the HTTP layer returns an OpenAI API error before a stream body. */
function createMockCreateRejectsWithApiError(): APIPromise<Stream<ChatCompletionChunk>> {
  const responsePromise: ApiResponsePromise = Promise.reject(
    new OpenAI.APIError(500, {}, "server error", undefined),
  );
  const parseResponse = (_props: ApiResponseProps) => {
    const streamBody: Stream<ChatCompletionChunk> = makeStreamFromChunks([]);
    return Promise.resolve(streamBody);
  };
  return new APIPromise<Stream<ChatCompletionChunk>>(responsePromise, parseResponse);
}

function assertStreamCreatePayload(chatCreateStub: { calls: { args: unknown[] }[] }): void {
  const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
  assertEquals(Object.getOwnPropertyDescriptor(payloadUnknown, 'stream')?.value, true);
  const streamOptions: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
    ? Object.getOwnPropertyDescriptor(payloadUnknown, 'stream_options')?.value
    : undefined;
  if (typeof streamOptions !== 'object' || streamOptions === null) {
    throw new Error('stream_options must be an object');
  }
  assertEquals(Object.getOwnPropertyDescriptor(streamOptions, 'include_usage')?.value, true);
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
        return {
            role: 'assistant',
            content: MOCK_OPENAI_ASSISTANT_TEXT,
            ai_provider_id: request.providerId,
            system_prompt_id: request.promptId,
            token_usage: {
                prompt_tokens: MOCK_OPENAI_STREAM_USAGE.prompt_tokens,
                completion_tokens: MOCK_OPENAI_STREAM_USAGE.completion_tokens,
                total_tokens: MOCK_OPENAI_STREAM_USAGE.total_tokens,
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
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

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
        assertStreamCreatePayload(chatCreateStub);
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
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

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
        assertStreamCreatePayload(chatCreateStub);
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
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [
                { id: 'd1', content: 'Doc A content' },
                { id: 'd2', content: 'Doc B content' },
            ],
        };

        await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        assertStreamCreatePayload(chatCreateStub);
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
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [
                { id: 'd1', content: 'Doc content', document_key: 'success_metrics', stage_slug: 'thesis', type: 'rendered_document' },
            ],
        };

        await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        assertStreamCreatePayload(chatCreateStub);
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
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

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
        assertStreamCreatePayload(chatCreateStub);
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

// --- max_completion_tokens vs max_tokens model coverage ---

Deno.test("OpenAiAdapter - Specific Tests: uses max_completion_tokens for gpt-5.2", async () => {
    const GPT5_CONFIG: AiModelExtendedConfig = {
        api_identifier: 'openai-gpt-5.2',
        input_token_cost_rate: 5.0,
        output_token_cost_rate: 15.0,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    };

    if (!isJson(GPT5_CONFIG)) {
        throw new Error('GPT5_CONFIG is not a valid JSON object');
    }

    const GPT5_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        api_identifier: 'openai-gpt-5.2',
        config: GPT5_CONFIG,
    };

    const adapter = new OpenAiAdapter(GPT5_PROVIDER, 'sk-test-key', mockLogger);
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const request: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-uuid-test',
            promptId: 'prompt-uuid-test',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens_to_generate: 200,
        };

        await adapter.sendMessage(request, GPT5_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        assertStreamCreatePayload(chatCreateStub);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        const mct: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_completion_tokens')?.value
            : undefined;
        const mt: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_tokens')?.value
            : undefined;
        assertExists(mct);
        assertEquals(mct, 200);
        assertEquals(mt === undefined || mt === null, true);
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - Specific Tests: uses max_completion_tokens for gpt-5.2-mini", async () => {
    const GPT5_MINI_CONFIG: AiModelExtendedConfig = {
        api_identifier: 'openai-gpt-5.2-mini',
        input_token_cost_rate: 2.0,
        output_token_cost_rate: 8.0,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    };

    if (!isJson(GPT5_MINI_CONFIG)) {
        throw new Error('GPT5_MINI_CONFIG is not a valid JSON object');
    }

    const GPT5_MINI_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        api_identifier: 'openai-gpt-5.2-mini',
        config: GPT5_MINI_CONFIG,
    };

    const adapter = new OpenAiAdapter(GPT5_MINI_PROVIDER, 'sk-test-key', mockLogger);
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const request: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-uuid-test',
            promptId: 'prompt-uuid-test',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens_to_generate: 150,
        };

        await adapter.sendMessage(request, GPT5_MINI_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        assertStreamCreatePayload(chatCreateStub);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        const mct: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_completion_tokens')?.value
            : undefined;
        const mt: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_tokens')?.value
            : undefined;
        assertExists(mct);
        assertEquals(mct, 150);
        assertEquals(mt === undefined || mt === null, true);
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - Specific Tests: uses max_completion_tokens for o1 model", async () => {
    const O1_CONFIG: AiModelExtendedConfig = {
        api_identifier: 'openai-o1',
        input_token_cost_rate: 5.0,
        output_token_cost_rate: 15.0,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    };

    if (!isJson(O1_CONFIG)) {
        throw new Error('O1_CONFIG is not a valid JSON object');
    }

    const O1_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        api_identifier: 'openai-o1',
        config: O1_CONFIG,
    };

    const adapter = new OpenAiAdapter(O1_PROVIDER, 'sk-test-key', mockLogger);
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const request: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-uuid-test',
            promptId: 'prompt-uuid-test',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens_to_generate: 300,
        };

        await adapter.sendMessage(request, O1_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        assertStreamCreatePayload(chatCreateStub);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        const mct: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_completion_tokens')?.value
            : undefined;
        const mt: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_tokens')?.value
            : undefined;
        assertExists(mct);
        assertEquals(mct, 300);
        assertEquals(mt === undefined || mt === null, true);
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - Specific Tests: uses max_tokens for gpt-4-turbo", async () => {
    const GPT4_TURBO_CONFIG: AiModelExtendedConfig = {
        api_identifier: 'openai-gpt-4-turbo',
        input_token_cost_rate: 2.5,
        output_token_cost_rate: 10.0,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    };

    if (!isJson(GPT4_TURBO_CONFIG)) {
        throw new Error('GPT4_TURBO_CONFIG is not a valid JSON object');
    }

    const GPT4_TURBO_PROVIDER: Tables<'ai_providers'> = {
        ...MOCK_PROVIDER,
        api_identifier: 'openai-gpt-4-turbo',
        config: GPT4_TURBO_CONFIG,
    };

    const adapter = new OpenAiAdapter(GPT4_TURBO_PROVIDER, 'sk-test-key', mockLogger);
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const request: ChatApiRequest = {
            message: 'Hello',
            providerId: 'provider-uuid-test',
            promptId: 'prompt-uuid-test',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens_to_generate: 100,
        };

        await adapter.sendMessage(request, GPT4_TURBO_PROVIDER.api_identifier);

        assertEquals(chatCreateStub.calls.length, 1);
        assertStreamCreatePayload(chatCreateStub);
        const payloadUnknown: unknown = chatCreateStub.calls[0].args[0];
        const mt: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_tokens')?.value
            : undefined;
        const mct: unknown = typeof payloadUnknown === 'object' && payloadUnknown !== null
            ? Object.getOwnPropertyDescriptor(payloadUnknown, 'max_completion_tokens')?.value
            : undefined;
        assertExists(mt);
        assertEquals(mt, 100);
        assertEquals(mct === undefined || mct === null, true);
    } finally {
        chatCreateStub.restore();
    }
});

// --- resourceDocuments validation tests ---

Deno.test("OpenAiAdapter - resourceDocuments: throws when document_key is empty", async () => {
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [
                { id: 'd1', content: 'Doc content', document_key: '', stage_slug: 'thesis', type: 'rendered_document' },
            ],
        };

        await assertRejects(
            () => adapter.sendMessage(request, MOCK_PROVIDER.api_identifier),
            Error,
            'document_key',
        );
    } finally {
        chatCreateStub.restore();
    }
});

Deno.test("OpenAiAdapter - resourceDocuments: throws when stage_slug is empty", async () => {
    const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS));

    try {
        const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
        const request: ChatApiRequest = {
            message: 'User prompt',
            providerId: 'test-provider',
            promptId: '__none__',
            resourceDocuments: [
                { id: 'd1', content: 'Doc content', document_key: 'success_metrics', stage_slug: '', type: 'rendered_document' },
            ],
        };

        await assertRejects(
            () => adapter.sendMessage(request, MOCK_PROVIDER.api_identifier),
            Error,
            'stage_slug',
        );
    } finally {
        chatCreateStub.restore();
    }
});

// --- stream-to-buffer (SDK mock: async iterable ChatCompletionChunk) ---

function createMockStreamCompletionPromiseThrowingAfterFirstDelta(): APIPromise<Stream<ChatCompletionChunk>> {
  const responsePromise: ApiResponsePromise = Promise.resolve(buildApiResponseProps());
  const parseResponse = (_props: ApiResponseProps) => {
    const controller: AbortController = new AbortController();
    async function* iterator(): AsyncGenerator<ChatCompletionChunk> {
      yield {
        ...MOCK_CHUNK_BASE,
        choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
      };
      throw new Error('simulated stream failure');
    }
    const streamBody: Stream<ChatCompletionChunk> = new Stream<ChatCompletionChunk>(() => iterator(), controller);
    return Promise.resolve(streamBody);
  };
  return new APIPromise<Stream<ChatCompletionChunk>>(responsePromise, parseResponse);
}

Deno.test("OpenAiAdapter - stream: content is concatenation of multiple delta.content events", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result: AdapterResponsePayload = await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

    assertEquals(chatCreateStub.calls.length, 1);
    assertStreamCreatePayload(chatCreateStub);
    assertEquals(result.content.trim(), MOCK_OPENAI_ASSISTANT_TEXT);
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - stream: token_usage is taken from final chunk usage field", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result: AdapterResponsePayload = await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

    assertExists(result.token_usage);
    if (typeof result.token_usage !== 'object' || result.token_usage === null) {
      throw new Error('token_usage must be a non-null object');
    }
    const usage: object = result.token_usage;
    const promptTokens: unknown = Object.getOwnPropertyDescriptor(usage, 'prompt_tokens')?.value;
    const completionTokens: unknown = Object.getOwnPropertyDescriptor(usage, 'completion_tokens')?.value;
    const totalTokens: unknown = Object.getOwnPropertyDescriptor(usage, 'total_tokens')?.value;
    assertEquals(promptTokens, MOCK_OPENAI_STREAM_USAGE.prompt_tokens);
    assertEquals(completionTokens, MOCK_OPENAI_STREAM_USAGE.completion_tokens);
    assertEquals(totalTokens, MOCK_OPENAI_STREAM_USAGE.total_tokens);
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - stream: maps finish_reason stop from streamed chunks", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result: AdapterResponsePayload = await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

    assertEquals(result.finish_reason, 'stop');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - stream: maps finish_reason length from streamed chunks", async () => {
  const lengthChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: 'trunc' }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(lengthChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result: AdapterResponsePayload = await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

    assertEquals(result.finish_reason, 'length');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - stream: maps finish_reason content_filter from streamed chunks", async () => {
  const filterChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: 'blocked' }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(filterChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result: AdapterResponsePayload = await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

    assertEquals(result.finish_reason, 'content_filter');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - stream: chunks with null delta.content are skipped without error", async () => {
  const nullDeltaChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: null }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(nullDeltaChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const result: AdapterResponsePayload = await adapter.sendMessage(request, MOCK_PROVIDER.api_identifier);

    assertEquals(result.content.trim(), 'hello');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - stream: empty text stream throws descriptive error", async () => {
  const emptyTextChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(emptyTextChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    await assertRejects(
      () => adapter.sendMessage(request, MOCK_PROVIDER.api_identifier),
      Error,
      'empty',
    );
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - stream: error during stream iteration propagates", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromiseThrowingAfterFirstDelta()
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    await assertRejects(
      () => adapter.sendMessage(request, MOCK_PROVIDER.api_identifier),
      Error,
      'simulated stream failure',
    );
  } finally {
    chatCreateStub.restore();
  }
});

// --- sendMessageStream (AdapterStreamChunk) ---

async function collectAdapterStreamChunks(
  stream: AsyncGenerator<AdapterStreamChunk>,
): Promise<AdapterStreamChunk[]> {
  const chunks: AdapterStreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

Deno.test("OpenAiAdapter - sendMessageStream: yields text_delta chunks for each ChatCompletionChunk with choices[0].delta.content present", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const chunks: AdapterStreamChunk[] = await collectAdapterStreamChunks(
      adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier),
    );
    const textDeltas: string[] = [];
    for (const c of chunks) {
      if (c.type === 'text_delta') {
        textDeltas.push(c.text);
      }
    }
    assertEquals(textDeltas, [' \n\n', 'General Kenobi! ']);
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: yields usage chunk from stream chunk where chunk.usage is present (stream_options.include_usage)", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const chunks: AdapterStreamChunk[] = await collectAdapterStreamChunks(
      adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier),
    );
    const usageIdx: number = chunks.findIndex((c) => c.type === 'usage');
    const doneIdx: number = chunks.findIndex((c) => c.type === 'done');
    assert(usageIdx !== -1);
    assert(doneIdx !== -1);
    assert(usageIdx < doneIdx);
    const usageChunk: AdapterStreamChunk | undefined = chunks[usageIdx];
    assertExists(usageChunk);
    assert(usageChunk.type === 'usage');
    assertEquals(usageChunk.tokenUsage, {
      prompt_tokens: MOCK_OPENAI_STREAM_USAGE.prompt_tokens,
      completion_tokens: MOCK_OPENAI_STREAM_USAGE.completion_tokens,
      total_tokens: MOCK_OPENAI_STREAM_USAGE.total_tokens,
    });
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: yields done with finish_reason stop when OpenAI finish_reason is stop", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const chunks: AdapterStreamChunk[] = await collectAdapterStreamChunks(
      adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier),
    );
    const doneChunk: AdapterStreamChunk | undefined = chunks.find((c) => c.type === 'done');
    assertExists(doneChunk);
    assert(doneChunk.type === 'done');
    assertEquals(doneChunk.finish_reason, 'stop');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: yields done with finish_reason length when OpenAI finish_reason is length", async () => {
  const lengthChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: 'trunc' }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(lengthChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const chunks: AdapterStreamChunk[] = await collectAdapterStreamChunks(
      adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier),
    );
    const doneChunk: AdapterStreamChunk | undefined = chunks.find((c) => c.type === 'done');
    assertExists(doneChunk);
    assert(doneChunk.type === 'done');
    assertEquals(doneChunk.finish_reason, 'length');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: yields done with finish_reason content_filter when OpenAI finish_reason is content_filter", async () => {
  const filterChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: 'blocked' }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(filterChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const chunks: AdapterStreamChunk[] = await collectAdapterStreamChunks(
      adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier),
    );
    const doneChunk: AdapterStreamChunk | undefined = chunks.find((c) => c.type === 'done');
    assertExists(doneChunk);
    assert(doneChunk.type === 'done');
    assertEquals(doneChunk.finish_reason, 'content_filter');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: yields done with finish_reason unknown for unrecognized OpenAI finish_reason", async () => {
  const unknownChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: 'x' }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'unrecognized_vendor_finish_reason',
        },
      ],
      usage: MOCK_OPENAI_STREAM_USAGE,
    },
  ] as ChatCompletionChunk[];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(unknownChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    const chunks: AdapterStreamChunk[] = await collectAdapterStreamChunks(
      adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier),
    );
    const doneChunk: AdapterStreamChunk | undefined = chunks.find((c) => c.type === 'done');
    assertExists(doneChunk);
    assert(doneChunk.type === 'done');
    assertEquals(doneChunk.finish_reason, 'unknown');
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: OpenAI APIError becomes wrapped Error", async () => {
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockCreateRejectsWithApiError()
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    await assertRejects(
      async () => {
        for await (const _ of adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier)) {
          // drain
        }
      },
      Error,
      "OpenAI API request failed:",
    );
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: same chat.completions.create payload as sendMessage (model strip, resource docs, max_tokens vs max_completion_tokens)", async () => {
  const LEGACY_PROVIDER: Tables<'ai_providers'> = {
    ...MOCK_PROVIDER,
    api_identifier: 'openai-gpt-3.5-turbo',
    config: Object.assign({}, MOCK_MODEL_CONFIG, {
      api_identifier: 'openai-gpt-3.5-turbo',
    }),
  };

  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(DEFAULT_OPENAI_STREAM_CHUNKS)
  );

  try {
    const adapter = new OpenAiAdapter(LEGACY_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'User prompt',
      providerId: 'provider-uuid-test',
      promptId: '__none__',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens_to_generate: 123,
      resourceDocuments: [
        { id: 'd1', content: 'Doc body', document_key: 'success_metrics', stage_slug: 'thesis', type: 'rendered_document' },
      ],
    };

    await adapter.sendMessage(request, LEGACY_PROVIDER.api_identifier);
    await collectAdapterStreamChunks(adapter.sendMessageStream(request, LEGACY_PROVIDER.api_identifier));

    assertEquals(chatCreateStub.calls.length, 2);
    assertEquals(chatCreateStub.calls[0].args[0], chatCreateStub.calls[1].args[0]);
  } finally {
    chatCreateStub.restore();
  }
});

Deno.test("OpenAiAdapter - sendMessageStream: throws when no stream chunk includes usage", async () => {
  const noUsageChunks: ChatCompletionChunk[] = [
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: { content: 'only' }, finish_reason: null }],
    },
    {
      ...MOCK_CHUNK_BASE,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  ];
  const chatCreateStub = stub(OpenAI.Chat.Completions.prototype, "create", () =>
    createMockStreamCompletionPromise(noUsageChunks)
  );

  try {
    const adapter = new OpenAiAdapter(MOCK_PROVIDER, 'sk-test-key', mockLogger);
    const request: ChatApiRequest = {
      message: 'Hello',
      providerId: 'provider-uuid-test',
      promptId: 'prompt-uuid-test',
      messages: [{ role: 'user', content: 'Hi' }],
    };
    await assertRejects(
      async () => {
        for await (const _ of adapter.sendMessageStream(request, MOCK_PROVIDER.api_identifier)) {
          // drain
        }
      },
      Error,
      'usage data',
    );
  } finally {
    chatCreateStub.restore();
  }
});
