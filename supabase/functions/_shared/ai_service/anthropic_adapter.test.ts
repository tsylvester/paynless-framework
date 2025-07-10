import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import Anthropic from 'npm:@anthropic-ai/sdk';
import type { APIPromise } from 'npm:@anthropic-ai/sdk/core';
import type { Stream } from 'npm:@anthropic-ai/sdk/streaming';
import type { Message, RawMessageStreamEvent } from 'npm:@anthropic-ai/sdk/resources/messages';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import type { ChatApiRequest, ILogger } from '../types.ts';

// Helper to create a mock APIPromise
function createMockApiPromise<T>(response: T): APIPromise<T> {
    return Promise.resolve(response) as APIPromise<T>;
}

// Define an interface for the expected token usage structure (consistent with other tests)
interface MockTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Mock logger for testing
const mockLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// --- Test Data ---
const MOCK_API_KEY = 'sk-ant-test-key';
const MOCK_MODEL_ID = 'anthropic-claude-3-opus-20240229';
const MOCK_SYSTEM_PROMPT = "You are a helpful test assistant.";
const MOCK_CHAT_REQUEST_WITH_SYSTEM: ChatApiRequest = {
  message: 'User message',
  providerId: 'provider-uuid-anthropic',
  promptId: 'prompt-uuid-system',
  chatId: 'chat-uuid-def',
  messages: [
    { role: 'system', content: MOCK_SYSTEM_PROMPT },
    { role: 'user', content: 'First user turn' },
    { role: 'assistant', content: 'First assistant turn' },
  ],
};
const MOCK_CHAT_REQUEST_NO_SYSTEM: ChatApiRequest = {
    message: 'Another user message',
    providerId: 'provider-uuid-anthropic',
    promptId: '__none__', // No system prompt selected
    chatId: 'chat-uuid-ghi',
    messages: [
      { role: 'user', content: 'Previous user turn' },
      { role: 'assistant', content: 'Previous assistant turn' },
    ],
};

const MOCK_CHAT_REQUEST_CONSECUTIVE_USER: ChatApiRequest = {
    message: 'Third user message',
    providerId: 'provider-uuid-anthropic',
    promptId: '__none__',
    chatId: 'chat-uuid-consecutive',
    messages: [
      { role: 'user', content: 'First user turn' },
      { role: 'assistant', content: 'First assistant turn' },
      { role: 'user', content: 'Second user turn' }, // Consecutive user
    ],
};

const MOCK_CHAT_REQUEST_ENDS_ASSISTANT: ChatApiRequest = {
    message: 'This should be valid',
    providerId: 'provider-uuid-anthropic',
    promptId: '__none__',
    chatId: 'chat-uuid-ends-assistant',
    messages: [
      { role: 'user', content: 'First user turn' },
      { role: 'assistant', content: 'Last message in history' },
    ],
};

const MOCK_CHAT_REQUEST_INVALID_END_ROLE: ChatApiRequest = {
    message: '', // No new message from user
    providerId: 'provider-uuid-anthropic',
    promptId: '__none__',
    chatId: 'chat-uuid-invalid-end',
    messages: [
      { role: 'user', content: 'User turn' },
      { role: 'assistant', content: 'History ends with assistant' },
    ],
};

const MOCK_ANTHROPIC_SUCCESS_RESPONSE: Message = {
  id: "msg_01A1B2C3D4E5F6G7H8I9J0K1L2",
  type: "message",
  role: "assistant",
  model: "claude-3-opus-20240229",
  content: [
    {
      type: "text",
      text: " Okay, how can I help you today? "
    }
  ],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 75,
    output_tokens: 20
  }
};

// --- Tests ---
Deno.test("AnthropicAdapter sendMessage - Success with System Prompt", async () => {
  const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockApiPromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

  try {
    const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_WITH_SYSTEM, MOCK_MODEL_ID);

    assertEquals(messagesCreateStub.calls.length, 1);
    const callArgs = messagesCreateStub.calls[0].args[0];
    assertEquals(callArgs.model, 'claude-3-opus-20240229');
    assertEquals(callArgs.system, MOCK_SYSTEM_PROMPT);
    assertEquals(callArgs.messages.length, 3);
    assertEquals(callArgs.messages[0].role, 'user');
    assertEquals(callArgs.messages[1].role, 'assistant');
    assertEquals(callArgs.messages[2].role, 'user');
    assertEquals(callArgs.messages[2].content, 'User message');

    assertExists(result);
    assertEquals(result.role, 'assistant');
    assertEquals(result.content, 'Okay, how can I help you today?');
    assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST_WITH_SYSTEM.providerId);
    assertEquals(result.system_prompt_id, MOCK_CHAT_REQUEST_WITH_SYSTEM.promptId);
    const tokens = result.token_usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    assertEquals(tokens?.prompt_tokens, 75);
    assertEquals(tokens?.completion_tokens, 20);
    assertEquals(tokens?.total_tokens, 95);

  } finally {
    messagesCreateStub.restore();
  }
});

Deno.test("AnthropicAdapter sendMessage - Success without System Prompt", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockApiPromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
      const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
      const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_NO_SYSTEM, MOCK_MODEL_ID);

      assertEquals(messagesCreateStub.calls.length, 1);
      const callArgs = messagesCreateStub.calls[0].args[0];
      assertEquals(callArgs.system, undefined);
      assertEquals(callArgs.messages.length, 3);
      assertEquals(callArgs.messages[2].role, 'user');
      assertEquals(callArgs.messages[2].content, 'Another user message');

      assertExists(result);
      assertEquals(result.role, 'assistant');
      assertEquals(result.content, 'Okay, how can I help you today?');
      assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST_NO_SYSTEM.providerId);
      assertEquals(result.system_prompt_id, null);
      assertExists(result.token_usage);
      const tokens = result.token_usage as unknown as MockTokenUsage;
      assertEquals(tokens.prompt_tokens, MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.input_tokens);
      assertEquals(tokens.completion_tokens, MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.output_tokens);
      assertEquals(tokens.total_tokens, MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.input_tokens + MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.output_tokens);

    } finally {
      messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter sendMessage - API Error", async () => {
    const apiError = new Anthropic.APIError(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'Error message', {});
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => Promise.reject(apiError) as APIPromise<Message | Stream<RawMessageStreamEvent>>);
  
    try {
      const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
      await assertRejects(
        () => adapter.sendMessage(MOCK_CHAT_REQUEST_WITH_SYSTEM, MOCK_MODEL_ID),
        Error,
        "Anthropic API request failed: 401 Error"
      );
    } finally {
      messagesCreateStub.restore();
    }
  });

Deno.test("AnthropicAdapter sendMessage - Consecutive User Messages Skipped", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockApiPromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
        const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
        await adapter.sendMessage(MOCK_CHAT_REQUEST_CONSECUTIVE_USER, MOCK_MODEL_ID);

        assertEquals(messagesCreateStub.calls.length, 1);
        const callArgs = messagesCreateStub.calls[0].args[0];
        assertEquals(callArgs.messages.length, 3);
        assertEquals(callArgs.messages[0].role, 'user');
        assertEquals(callArgs.messages[0].content, 'First user turn'); 
        assertEquals(callArgs.messages[1].role, 'assistant');
        assertEquals(callArgs.messages[1].content, 'First assistant turn');
        assertEquals(callArgs.messages[2].role, 'user');
        assertEquals(callArgs.messages[2].content, 'Second user turn');

    } finally {
        messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter sendMessage - History Ends With Assistant is Valid with new message", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockApiPromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));
    
    try {
        const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
        const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_ENDS_ASSISTANT, MOCK_MODEL_ID);

        assertEquals(messagesCreateStub.calls.length, 1);
        const callArgs = messagesCreateStub.calls[0].args[0];
        assertEquals(callArgs.messages.length, 3);
        assertEquals(callArgs.messages[0].role, 'user');
        assertEquals(callArgs.messages[1].role, 'assistant');
        assertEquals(callArgs.messages[2].role, 'user');
        assertEquals(callArgs.messages[2].content, 'This should be valid'); 

        assertExists(result);
        assertEquals(result.role, 'assistant');
        assertEquals(result.content, 'Okay, how can I help you today?');

    } finally {
        messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter sendMessage - Rejects when history ends with assistant and no new message", async () => {
    const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockApiPromise(MOCK_ANTHROPIC_SUCCESS_RESPONSE));

    try {
        const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
        await assertRejects(
            () => adapter.sendMessage(MOCK_CHAT_REQUEST_INVALID_END_ROLE, MOCK_MODEL_ID),
            Error,
            "Cannot send request to Anthropic: message history format invalid." 
        );
        assertEquals(messagesCreateStub.calls.length, 0);
    } finally {
        messagesCreateStub.restore();
    }
});

Deno.test("AnthropicAdapter sendMessage - Finish Reason Max Tokens", async () => {
  const mockMaxTokensResponse: Message = {
    ...MOCK_ANTHROPIC_SUCCESS_RESPONSE,
    stop_reason: "max_tokens",
    content: [{ type: "text", text: "This is a partial response..." }],
  };

  const messagesCreateStub = stub(Anthropic.Messages.prototype, "create", () => createMockApiPromise(mockMaxTokensResponse));

  try {
    const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_WITH_SYSTEM, MOCK_MODEL_ID);

    assertEquals(result.content, "This is a partial response...");
    assertEquals(result.finish_reason, 'length');
  } finally {
    messagesCreateStub.restore();
  }
});

Deno.test("AnthropicAdapter listModels - Success", async () => {
  const mockModelsResponse = {
    data: [
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
    ]
  };
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(mockModelsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
    const models = await adapter.listModels();

    assertEquals(mockFetch.calls.length, 1);
    const fetchArgs = mockFetch.calls[0].args;
    assertEquals(fetchArgs[0], 'https://api.anthropic.com/v1/models');
    assertEquals(fetchArgs[1]?.method, 'GET');

    assertExists(models);
    assertEquals(models.length, 2);
    assertEquals(models[0].api_identifier, 'anthropic-claude-3-opus-20240229');
    assertEquals(models[0].name, 'Claude 3 Opus');
    assertEquals(models[1].api_identifier, 'anthropic-claude-3-sonnet-20240229');
    assertEquals(models[1].name, 'Claude 3 Sonnet');
  } finally {
    mockFetch.restore();
  }
});

Deno.test("AnthropicAdapter listModels - API Error", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ type: 'error', error: { message: 'Auth error' } }), {
        status: 401,
      })
    )
  );

  try {
    const adapter = new AnthropicAdapter(MOCK_API_KEY, mockLogger);
    await assertRejects(
      () => adapter.listModels(),
      Error,
      "Anthropic API request failed fetching models: 401"
    );
  } finally {
    mockFetch.restore();
  }
}); 