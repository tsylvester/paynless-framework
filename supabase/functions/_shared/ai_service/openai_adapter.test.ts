import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import OpenAI from 'npm:openai';
import type { APIPromise } from 'npm:openai/core';
import type { ChatCompletion } from 'npm:openai/resources/chat/completions';
import type { Model, ModelsPage } from 'npm:openai/resources/models';
import type { PagePromise } from 'npm:openai/core';
import type { Stream } from 'npm:openai/streaming';
import type { ChatCompletionChunk } from 'npm:openai/resources/chat/completions';
import { OpenAiAdapter } from './openai_adapter.ts';
import type { ChatApiRequest, ILogger } from '../types.ts';
import type { CreateEmbeddingResponse } from 'npm:openai/resources/embeddings';

// Mock logger for testing
const mockLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function createMockChatCompletionPromise(completion: ChatCompletion): APIPromise<ChatCompletion> {
    return Promise.resolve(completion) as APIPromise<ChatCompletion>;
}

function createMockEmbeddingPromise(embeddingResponse: CreateEmbeddingResponse): APIPromise<CreateEmbeddingResponse> {
    return Promise.resolve(embeddingResponse) as APIPromise<CreateEmbeddingResponse>;
}


// Define an interface for the expected token usage structure
interface MockTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// --- Test Data ---
const MOCK_API_KEY = 'sk-test-key';
const MOCK_MODEL_ID = 'openai-gpt-4o';
const MOCK_CHAT_REQUEST: ChatApiRequest = {
  message: 'Hello there',
  providerId: 'provider-uuid-openai',
  promptId: 'prompt-uuid-123',
  chatId: 'chat-uuid-abc',
  messages: [
    { role: 'user', content: 'Previous message' },
    { role: 'assistant', content: 'Previous response' },
  ],
};

const MOCK_OPENAI_SUCCESS_RESPONSE: ChatCompletion = {
  id: 'chatcmpl-xxxxxxxx',
  object: 'chat.completion',
  created: 1700000000,
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: ' \n\nGeneral Kenobi! ',
        refusal: null,
      },
      logprobs: null,
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 10,
    total_tokens: 60,
  },
};

const MOCK_OPENAI_MODELS_RESPONSE_DATA: Model[] = [
    {
        id: "gpt-4o",
        object: "model",
        created: 1715367049,
        owned_by: "openai-internal"
    },
    {
        id: "gpt-3.5-turbo",
        object: "model",
        created: 1677610602,
        owned_by: "openai"
    },
    {
        id: "dall-e-3",
        object: "model",
        created: 1698785189,
        owned_by: "system"
    },
    {
        id: "whisper-1",
        object: "model",
        created: 1677610602,
        owned_by: "openai-internal"
    }
];

const MOCK_EMBEDDING_SUCCESS_RESPONSE: CreateEmbeddingResponse = {
    object: 'list',
    data: [
        {
            object: 'embedding',
            embedding: [0.01, 0.02, 0.03],
            index: 0,
        },
    ],
    model: 'text-embedding-3-small',
    usage: {
        prompt_tokens: 5,
        total_tokens: 5,
    },
};


// --- Tests ---
Deno.test("OpenAiAdapter sendMessage - Success", async () => {
    const createStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockChatCompletionPromise(MOCK_OPENAI_SUCCESS_RESPONSE));

    try {
        const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
        const result = await adapter.sendMessage(MOCK_CHAT_REQUEST, MOCK_MODEL_ID);

        assertEquals(createStub.calls.length, 1);
        const callArgs = createStub.calls[0].args[0];
        assertEquals(callArgs.model, 'gpt-4o');
        assertEquals(callArgs.messages.length, 3);
        assertEquals(callArgs.messages[2].role, 'user');
        assertEquals(callArgs.messages[2].content, 'Hello there');

        assertExists(result);
        assertEquals(result.role, 'assistant');
        assertEquals(result.content, 'General Kenobi!');
        assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST.providerId);
        assertEquals(result.system_prompt_id, MOCK_CHAT_REQUEST.promptId);
        assertExists(result.token_usage);
        const tokenUsage = result.token_usage as unknown as MockTokenUsage;
        assertEquals(tokenUsage.prompt_tokens, 50);
        assertEquals(tokenUsage.completion_tokens, 10);
        assertEquals(tokenUsage.total_tokens, 60);

  } finally {
    createStub.restore();
  }
});

Deno.test("OpenAiAdapter sendMessage - API Error", async () => {
    const apiError = new OpenAI.APIError(401, { error: { message: 'Invalid API key' } }, 'Error message', {});
    const createStub = stub(OpenAI.Chat.Completions.prototype, "create", () => Promise.reject(apiError) as APIPromise<ChatCompletion | Stream<ChatCompletionChunk>>);

  try {
    const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
    await assertRejects(
      () => adapter.sendMessage(MOCK_CHAT_REQUEST, MOCK_MODEL_ID),
      Error,
      "OpenAI API request failed: 401"
    );
  } finally {
    createStub.restore();
  }
});

Deno.test("OpenAiAdapter sendMessage - Empty Response Content", async () => {
  const emptyResponse: ChatCompletion = { ...MOCK_OPENAI_SUCCESS_RESPONSE, choices: [{...MOCK_OPENAI_SUCCESS_RESPONSE.choices[0], message: { role: 'assistant' as const, content: ' ', refusal: null } }] };
  const createStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockChatCompletionPromise(emptyResponse));
   
  try {
    const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
     await assertRejects(
       () => adapter.sendMessage(MOCK_CHAT_REQUEST, MOCK_MODEL_ID),
       Error,
       "OpenAI response content is empty or missing."
     );
  } finally {
     createStub.restore();
  }
});

Deno.test("OpenAiAdapter listModels - Success", async () => {
    const mockPage: ModelsPage = {
        data: MOCK_OPENAI_MODELS_RESPONSE_DATA,
        object: 'list',
        hasNextPage: () => false,
        getNextPage: () => Promise.resolve(mockPage),
        [Symbol.asyncIterator]: async function* () {
            for (const item of MOCK_OPENAI_MODELS_RESPONSE_DATA) {
                yield item;
            }
        },
    } as ModelsPage;

    const mockPromise = Promise.resolve(mockPage) as unknown as PagePromise<ModelsPage, Model>;
    (mockPromise as any)[Symbol.asyncIterator] = async function* () {
        for (const item of MOCK_OPENAI_MODELS_RESPONSE_DATA) {
            yield item;
        }
    };

    const listStub = stub(OpenAI.Models.prototype, "list", () => mockPromise);

    try {
        const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
        const models = await adapter.listModels();

        assertEquals(listStub.calls.length, 1);
        assertEquals(models.length, 2);
        assertEquals(models[0].api_identifier, 'openai-gpt-4o');
        assertEquals(models[0].name, 'OpenAI gpt-4o');
        assertEquals(models[1].api_identifier, 'openai-gpt-3.5-turbo');
        assertEquals(models[1].name, 'OpenAI gpt-3.5-turbo');

    } finally {
        listStub.restore();
    }
});

Deno.test("OpenAiAdapter listModels - API Error", async () => {
    const apiError = new OpenAI.APIError(500, { error: { message: 'Server error' } }, 'Error message', {});
    
    const rejectedPromise = Promise.reject(apiError) as unknown as PagePromise<ModelsPage, Model>;
    (rejectedPromise as any)[Symbol.asyncIterator] = async function* () {}; // Required for type compliance

    const listStub = stub(OpenAI.Models.prototype, "list", () => rejectedPromise);

    try {
        const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
        await assertRejects(
            () => adapter.listModels(),
            Error,
            "Failed to fetch models from OpenAI."
        );
    } finally {
        listStub.restore();
    }
});

Deno.test("OpenAiAdapter sendMessage - Finish Reason Length", async () => {
    const mockResponse: ChatCompletion = {
        ...MOCK_OPENAI_SUCCESS_RESPONSE,
        choices: [
            {
                ...MOCK_OPENAI_SUCCESS_RESPONSE.choices[0],
                finish_reason: 'length',
                message: {
                    role: 'assistant',
                    content: 'This is a partial response...',
                    refusal: null,
                },
            },
        ],
    };

    const createStub = stub(OpenAI.Chat.Completions.prototype, "create", () => createMockChatCompletionPromise(mockResponse));

    try {
        const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
        const result = await adapter.sendMessage(MOCK_CHAT_REQUEST, MOCK_MODEL_ID);

        assertEquals(result.content, 'This is a partial response...');
        assertEquals(result.finish_reason, 'length');
    } finally {
        createStub.restore();
    }
});

Deno.test("OpenAiAdapter getEmbedding - Success", async () => {
    const createStub = stub(OpenAI.Embeddings.prototype, "create", () => createMockEmbeddingPromise(MOCK_EMBEDDING_SUCCESS_RESPONSE));

    try {
        const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
        const result = await adapter.getEmbedding("Hello world");

        assertEquals(createStub.calls.length, 1);
        const callArgs = createStub.calls[0].args[0];
        assertEquals(callArgs.model, 'text-embedding-3-small');
        assertEquals(callArgs.input, 'Hello world');
        
        assertExists(result);
        assertEquals(result, MOCK_EMBEDDING_SUCCESS_RESPONSE);

    } finally {
        createStub.restore();
    }
});

Deno.test("OpenAiAdapter getEmbedding - API Error", async () => {
    const apiError = new OpenAI.APIError(401, { error: { message: 'Invalid API key' } }, 'Error message', {});
    const createStub = stub(OpenAI.Embeddings.prototype, "create", () => Promise.reject(apiError) as APIPromise<CreateEmbeddingResponse>);

    try {
        const adapter = new OpenAiAdapter(MOCK_API_KEY, mockLogger);
        await assertRejects(
            () => adapter.getEmbedding("Hello world"),
            Error,
            "OpenAI API request failed: 401 Error"
        );
    } finally {
        createStub.restore();
    }
});
