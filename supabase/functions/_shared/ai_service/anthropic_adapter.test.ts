import { assertEquals, assertExists, assertRejects, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { AnthropicAdapter, anthropicAdapter } from './anthropic_adapter.ts';
import type { ChatApiRequest } from '../types.ts';

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
    message: 'This should fail',
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

const MOCK_ANTHROPIC_SUCCESS_RESPONSE = {
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
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(MOCK_ANTHROPIC_SUCCESS_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new AnthropicAdapter();
    const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_WITH_SYSTEM, MOCK_MODEL_ID, MOCK_API_KEY);

    // Assert fetch was called correctly
    assertEquals(mockFetch.calls.length, 1);
    const fetchArgs = mockFetch.calls[0].args;
    assertEquals(fetchArgs[0], 'https://api.anthropic.com/v1/messages');
    assertEquals(fetchArgs[1]?.method, 'POST');
    assertEquals((fetchArgs[1]?.headers as Record<string, string>)['x-api-key'], MOCK_API_KEY);
    assertEquals((fetchArgs[1]?.headers as Record<string, string>)['anthropic-version'], '2023-06-01');
    const body = JSON.parse(fetchArgs[1]?.body as string);
    assertEquals(body.model, 'claude-3-opus-20240229'); // Prefix removed
    assertEquals(body.system, MOCK_SYSTEM_PROMPT);
    assertEquals(body.messages.length, 3); // System prompt removed, history + new message
    assertEquals(body.messages[0].role, 'user');
    assertEquals(body.messages[1].role, 'assistant');
    assertEquals(body.messages[2].role, 'user');
    assertEquals(body.messages[2].content, 'User message');

    // Assert result structure
    assertExists(result);
    assertEquals(result.role, 'assistant');
    assertEquals(result.content, 'Okay, how can I help you today?'); // Trimmed
    assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST_WITH_SYSTEM.providerId);
    assertEquals(result.system_prompt_id, MOCK_CHAT_REQUEST_WITH_SYSTEM.promptId);
    // Cast token_usage to expected shape for testing
    const tokens = result.token_usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    assertEquals(tokens?.prompt_tokens, 75);
    assertEquals(tokens?.completion_tokens, 20);
    assertEquals(tokens?.total_tokens, 95); // Calculated
    assertExists(result.created_at);

  } finally {
    mockFetch.restore();
  }
});

Deno.test("AnthropicAdapter sendMessage - Success without System Prompt", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_ANTHROPIC_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    try {
      const adapter = new AnthropicAdapter();
      const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_NO_SYSTEM, MOCK_MODEL_ID, MOCK_API_KEY);

      // Assert fetch was called correctly
      assertEquals(mockFetch.calls.length, 1);
      const fetchArgs = mockFetch.calls[0].args;
      const body = JSON.parse(fetchArgs[1]?.body as string);
      assertEquals(body.system, undefined); // System prompt should be omitted
      assertEquals(body.messages.length, 3);
      assertEquals(body.messages[2].role, 'user');
      assertEquals(body.messages[2].content, 'Another user message');

      // Assert result structure (content is same mock response)
      assertExists(result);
      assertEquals(result.role, 'assistant');
      assertEquals(result.content, 'Okay, how can I help you today?');
      assertEquals(result.ai_provider_id, MOCK_CHAT_REQUEST_NO_SYSTEM.providerId);
      assertEquals(result.system_prompt_id, null); // Should be null as promptId was '__none__'

    } finally {
      mockFetch.restore();
    }
});

Deno.test("AnthropicAdapter sendMessage - API Error", async () => {
  const mockFetch = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  try {
    const adapter = new AnthropicAdapter();
    await assertRejects(
      () => adapter.sendMessage(MOCK_CHAT_REQUEST_WITH_SYSTEM, MOCK_MODEL_ID, MOCK_API_KEY),
      Error,
      "Anthropic API request failed: 401"
    );
  } finally {
    mockFetch.restore();
  }
});

Deno.test("AnthropicAdapter sendMessage - Consecutive User Messages", async () => {
    const mockFetch = stub(globalThis, "fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_ANTHROPIC_SUCCESS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    try {
        const adapter = new AnthropicAdapter();
        await adapter.sendMessage(MOCK_CHAT_REQUEST_CONSECUTIVE_USER, MOCK_MODEL_ID, MOCK_API_KEY);

        assertEquals(mockFetch.calls.length, 1);
        const fetchArgs = mockFetch.calls[0].args;
        const body = JSON.parse(fetchArgs[1]?.body as string);
        assertEquals(body.messages.length, 3);
        assertEquals(body.messages[0].role, 'user');
        assertEquals(body.messages[0].content, 'First user turn'); 
        assertEquals(body.messages[1].role, 'assistant');
        assertEquals(body.messages[1].content, 'First assistant turn');
        assertEquals(body.messages[2].role, 'user'); 
        assertEquals(body.messages[2].content, 'Second user turn'); // The newest message ('Third...') was skipped by filter

    } finally {
        mockFetch.restore();
    }
});

Deno.test("AnthropicAdapter sendMessage - History Ends With Assistant", async () => {
    const adapter = new AnthropicAdapter();
    // No fetch mock needed here, the error should be thrown before the API call
    await assertRejects(
        () => adapter.sendMessage(MOCK_CHAT_REQUEST_ENDS_ASSISTANT, MOCK_MODEL_ID, MOCK_API_KEY),
        Error,
        "Cannot send request to Anthropic: message history format invalid."
    );
});

Deno.test("AnthropicAdapter sendMessage - History Ends With Assistant (Invalid Format)", async () => {
    const mockFetch = spy(globalThis, "fetch");
    const adapter = new AnthropicAdapter();
    let thrownError: Error | null = null;

    try {
        // Attempt the call that should fail before fetching
        await adapter.sendMessage(MOCK_CHAT_REQUEST_INVALID_END_ROLE, MOCK_MODEL_ID, MOCK_API_KEY);
        // If this line is reached, the expected error wasn't thrown. Fail explicitly.
        throw new Error("Test failed: Expected sendMessage to throw validation error, but it completed.");
    } catch (error) {
        // Catch the expected error - check if it's an Error instance
        if (error instanceof Error) {
            thrownError = error;
        } else {
            // If something else was thrown, record it as an unexpected error type
            thrownError = new Error(`Unexpected throw type: ${typeof error}`);
        }
    } finally {
        // CRITICAL: Check fetch call count *before* restoring.
        // This assertion MUST pass if the pre-flight validation worked.
        assertEquals(mockFetch.calls.length, 0, "Fetch should NOT have been called due to invalid input format.");
        mockFetch.restore(); // Restore fetch regardless of outcome
    }

    // Assert that an Error was caught and it has the correct message
    assertExists(thrownError, "Error was expected but none was caught or assigned.");
    assertInstanceOf(thrownError, Error, "Caught object was not an Error instance.");
    assertEquals(thrownError.message, "Cannot send request to Anthropic: message history format invalid.");
});

Deno.test("AnthropicAdapter listModels - Success (Hardcoded)", async () => {
    // No fetch call is expected as list is hardcoded currently
    const mockFetch = spy(globalThis, "fetch");

    try {
        const adapter = new AnthropicAdapter();
        const models = await adapter.listModels(MOCK_API_KEY);

        assertEquals(mockFetch.calls.length, 0); // Verify fetch was NOT called

        assertExists(models);
        assertEquals(models.length, 3); // Check number of hardcoded models
        assertEquals(models[0].api_identifier, 'anthropic-claude-3-opus-20240229');
        assertEquals(models[0].name, 'Anthropic Claude 3 Opus');
        assertEquals(models[1].api_identifier, 'anthropic-claude-3-sonnet-20240229');
        assertEquals(models[2].api_identifier, 'anthropic-claude-3-haiku-20240307');

    } finally {
        // Restore spy if needed, though not strictly necessary if no calls made
        mockFetch.restore();
    }
});

// Test the exported instance
Deno.test("Exported anthropicAdapter instance exists", () => {
  assertExists(anthropicAdapter);
  assertInstanceOf(anthropicAdapter, AnthropicAdapter);
}); 