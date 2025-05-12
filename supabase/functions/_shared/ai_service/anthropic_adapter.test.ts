import { assertEquals, assertExists, assertRejects, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, stub, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { AnthropicAdapter, anthropicAdapter } from './anthropic_adapter.ts';
import type { ChatApiRequest } from '../types.ts';

// Define an interface for the expected token usage structure (consistent with other tests)
interface MockTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

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
      // Add token assertions
      assertExists(result.token_usage);
      const tokens = result.token_usage as unknown as MockTokenUsage; // Cast
      assertEquals(tokens.prompt_tokens, MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.input_tokens, "Prompt tokens mismatch");
      assertEquals(tokens.completion_tokens, MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.output_tokens, "Completion tokens mismatch");
      assertEquals(tokens.total_tokens, MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.input_tokens + MOCK_ANTHROPIC_SUCCESS_RESPONSE.usage.output_tokens, "Total tokens mismatch");
      assertExists(result.created_at);

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
    // History ends with assistant, BUT we add a new user message, making the sequence valid.
    // Therefore, validation should pass, and fetch should be called.
    // The test needs to mock a successful response.
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
        const result = await adapter.sendMessage(MOCK_CHAT_REQUEST_ENDS_ASSISTANT, MOCK_MODEL_ID, MOCK_API_KEY);

        // Assert fetch was called
        assertEquals(mockFetch.calls.length, 1);
        const fetchArgs = mockFetch.calls[0].args;
        const body = JSON.parse(fetchArgs[1]?.body as string);
        assertEquals(body.messages.length, 3); // History + new message
        assertEquals(body.messages[0].role, 'user');
        assertEquals(body.messages[1].role, 'assistant');
        assertEquals(body.messages[2].role, 'user'); // The new message
        assertEquals(body.messages[2].content, 'This should fail'); 

        // Assert result (using the standard mock success response)
        assertExists(result);
        assertEquals(result.role, 'assistant');
        assertEquals(result.content, 'Okay, how can I help you today?');

    } finally {
        mockFetch.restore();
    }
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
        assertEquals(mockFetch.calls.length, 0, "Fetch should NOT have been called due to validation error.");
        // Restore the original fetch function AFTER checking call count
        mockFetch.restore();
        // Now assert the error message
        assertExists(thrownError, "sendMessage should have thrown an error.");
        assertInstanceOf(thrownError, Error, "Thrown object should be an Error instance.");
        // Check if the error message matches the one thrown by the validation logic
        assertEquals(thrownError.message, "Cannot send request to Anthropic: message history format invalid.", "Error message mismatch.");
    }
});

Deno.test("AnthropicAdapter listModels - Failure on API Error", async () => {
    // This test verifies that listModels throws an error if the API call fails.
    // We expect listModels to TRY fetching, fail (no mock = real call = 401),
    // and throw the resulting error.
    const adapter = new AnthropicAdapter();

    // Assert that the call rejects because the underlying fetch will fail (e.g., 401)
    await assertRejects(
      async () => await adapter.listModels('invalid-api-key'), // Use an invalid key to ensure failure
      Error, // Expect an Error object to be thrown
      "Anthropic API request failed fetching models: 401" // Check for part of the expected error message
    );

    // No need to check the returned value as it should throw.
    // No need for spy/restore here as we aren't checking fetch calls specifically, just the rejection.
});

// Test the exported instance
Deno.test("Exported anthropicAdapter instance exists", () => {
  assertExists(anthropicAdapter);
  assertInstanceOf(anthropicAdapter, AnthropicAdapter);
}); 