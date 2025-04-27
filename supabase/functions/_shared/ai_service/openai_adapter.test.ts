import { assertEquals, assertExists, assertRejects, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { OpenAiAdapter, openAiAdapter } from './openai_adapter.ts';
import type { ChatApiRequest } from '../types.ts';
import { assertSpyCall, assertSpyCalls, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert } from "jsr:@std/assert@0.225.3";
import { OpenAI } from 'npm:openai';

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

const MOCK_OPENAI_SUCCESS_RESPONSE = {
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
  system_fingerprint: 'fp_xxxx',
};

const MOCK_OPENAI_MODELS_RESPONSE = {
    object: "list",
    data: [
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
            id: "dall-e-3", // Should be filtered out
            object: "model",
            created: 1698785189,
            owned_by: "system"
        },
        {
            id: "whisper-1", // Should be filtered out
            object: "model",
            created: 1677610602,
            owned_by: "openai-internal"
        }
    ]
};

// --- Tests ---
Deno.test("OpenAiAdapter sendMessage - Success", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(MOCK_OPENAI_SUCCESS_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new OpenAiAdapter();
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST, MOCK_MODEL_ID, MOCK_API_KEY);

    // Assert fetch was called correctly
    assertEquals(mockFetch.calls.length, 1);
    const fetchArgs = mockFetch.calls[0].args;
    assertEquals(fetchArgs[0], 'https://api.openai.com/v1/chat/completions'); // URL
    assertEquals(fetchArgs[1]?.method, 'POST');
    assertEquals((fetchArgs[1]?.headers as Record<string, string>)['Authorization'], `Bearer ${MOCK_API_KEY}`);
    const body = JSON.parse(fetchArgs[1]?.body as string);
    assertEquals(body.model, 'gpt-4o'); // Prefix removed
    assertEquals(body.messages.length, 3); // History + new message
    assertEquals(body.messages[2].role, 'user');
    assertEquals(body.messages[2].content, 'Hello there');

    // Assert result structure
    assertExists(result);
    assertEquals(result.role, 'assistant');
    assertExists(result.content);
    assertEquals(typeof result.content, "string");
    assert(result.content.length > 0, "Content should not be empty");
    assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST.providerId);
    assertEquals(result.system_prompt_id, MOCK_CHAT_REQUEST.promptId);
    assertExists(result.token_usage); // Should return token usage

    // Verify fetch call details
    assertSpyCall(mockFetch, 0);

  } finally {
    mockFetch.restore(); // Restore original fetch
  }
});

Deno.test("OpenAiAdapter sendMessage - API Error", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new OpenAiAdapter();
    await assertRejects(
      () => adapter.sendMessage(MOCK_CHAT_REQUEST, MOCK_MODEL_ID, MOCK_API_KEY),
      Error,
      "OpenAI API request failed: 401"
    );
  } finally {
    mockFetch.restore();
  }
});

Deno.test("OpenAiAdapter sendMessage - Empty Response Content", async () => {
  const mockFetch = stub(globalThis, "fetch", () => {
    const emptyResponse = { ...MOCK_OPENAI_SUCCESS_RESPONSE, choices: [{ message: { content: ' ' } }] };
    return Promise.resolve(
        new Response(JSON.stringify(emptyResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
  });
   
  try {
    const adapter = new OpenAiAdapter();
     await assertRejects(
       () => adapter.sendMessage(MOCK_CHAT_REQUEST, MOCK_MODEL_ID, MOCK_API_KEY),
       Error,
       "Received empty response from OpenAI."
     );
  } finally {
     mockFetch.restore();
  }
});

Deno.test("OpenAiAdapter listModels - Success", async () => {
    const mockFetch = stub(globalThis, "fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_OPENAI_MODELS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    try {
        const adapter = new OpenAiAdapter();
        const models = await adapter.listModels(MOCK_API_KEY);

        assertEquals(mockFetch.calls.length, 1);
        const fetchArgs = mockFetch.calls[0].args;
        assertEquals(fetchArgs[0], 'https://api.openai.com/v1/models');
        assertEquals(fetchArgs[1]?.method, 'GET');
        assertEquals((fetchArgs[1]?.headers as Record<string, string>)['Authorization'], `Bearer ${MOCK_API_KEY}`);

        assertEquals(models.length, 2); // Only GPT models included
        assertEquals(models[0].api_identifier, 'openai-gpt-4o');
        assertEquals(models[0].name, 'OpenAI gpt-4o');
        assertEquals(models[1].api_identifier, 'openai-gpt-3.5-turbo');
        assertEquals(models[1].name, 'OpenAI gpt-3.5-turbo');

    } finally {
        mockFetch.restore();
    }
});

Deno.test("OpenAiAdapter listModels - API Error", async () => {
    const mockFetch = stub(globalThis, "fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Server error' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    try {
        const adapter = new OpenAiAdapter();
        await assertRejects(
            () => adapter.listModels(MOCK_API_KEY),
            Error,
            "OpenAI API request failed fetching models: 500"
        );
    } finally {
        mockFetch.restore();
    }
});

// Test the exported instance
Deno.test("Exported openAiAdapter instance exists", () => {
  assertExists(openAiAdapter);
  assertInstanceOf(openAiAdapter, OpenAiAdapter);
}); 