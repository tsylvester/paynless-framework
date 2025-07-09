import {
    assertEquals,
    assertExists,
  } from "jsr:@std/assert@0.225.3";
  import { spy } from "jsr:@std/testing@0.225.1/mock";
  import type { Spy } from "jsr:@std/testing@0.225.1/mock";
  import type {
    ChatApiRequest,
    AdapterResponsePayload,
    AiProviderAdapter,
    TokenUsage,
    ILogger,
  } from "../_shared/types.ts";
  import { handleContinuationLoop } from "./continue.ts";
  
  // --- Test Setup: Mock Logger ---
  const mockLogger: ILogger = {
    debug: spy(() => {}),
    info: spy(() => {}),
    warn: spy(() => {}),
    error: spy(() => {}),
  };
  
  // --- Test Setup: Mock AI Provider Adapter ---
  const createMockAiAdapter = (
    responses: { content: string; finishReason: TokenUsage['finish_reason'] }[],
  ): { adapter: AiProviderAdapter, sendMessageSpy: Spy<unknown, [ChatApiRequest], Promise<AdapterResponsePayload>> } => {
    const sendMessageSpy = spy(
      async (
        _request: ChatApiRequest,
      ): Promise<AdapterResponsePayload> => {
        const responseConfig = responses.shift();
        if (!responseConfig) {
          throw new Error("Mock AI Adapter ran out of responses.");
        }
        const { content, finishReason } = responseConfig;
  
        return {
          role: "assistant",
          content: content,
          ai_provider_id: "mock-provider-id",
          system_prompt_id: "mock-prompt-id",
          token_usage: {
            prompt_tokens: 10, // Dummy value, we'll assert total below
            completion_tokens: 5, // Dummy value
            total_tokens: 15, // Dummy value
            finish_reason: finishReason,
          },
        };
      },
    );
  
    const adapter: AiProviderAdapter = {
      sendMessage: sendMessageSpy,
      listModels: async () => [],
    };
  
    return { adapter, sendMessageSpy };
  };
  
  // --- Test Suite ---
  
  Deno.test("handleContinuationLoop Logic", {
    sanitizeOps: false,
    sanitizeResources: false,
  }, async (t) => {
  
    await t.step(
      "Standard Single Call (finishReason: 'stop')",
      async () => {
        // Arrange
        const { adapter, sendMessageSpy } = createMockAiAdapter([{ content: "Complete response.", finishReason: "stop" }]);
        const initialRequest: ChatApiRequest = {
          message: "Hello",
          providerId: "mock-provider-id",
          promptId: "mock-prompt-id",
          messages: [{ role: 'user', content: 'Hello' }],
        };
  
        // Act
        const response = await handleContinuationLoop(adapter, initialRequest, "test-model", "test-key", mockLogger);
  
        // Assert
        assertEquals(response.content, "Complete response.");
        assertEquals(sendMessageSpy.calls.length, 1);
        const tokenUsage = response.token_usage as unknown as TokenUsage;
        assertEquals(tokenUsage.prompt_tokens, 10);
        assertEquals(tokenUsage.completion_tokens, 5);
      },
    );
  
    await t.step(
      "Two-Part Continuation (correctly appends history)",
      async () => {
        // Arrange
        const { adapter, sendMessageSpy } = createMockAiAdapter([
            { content: "Part 1.", finishReason: "length" },
            { content: " Part 2.", finishReason: "stop" },
        ]);
        const initialRequest: ChatApiRequest = {
          message: "Tell me a story",
          providerId: "mock-provider-id",
          promptId: "mock-prompt-id",
          messages: [{ role: 'user', content: 'Tell me a story' }],
        };
  
        // Act
        const response = await handleContinuationLoop(adapter, initialRequest, "test-model", "test-key", mockLogger);
  
        // Assert
        assertEquals(response.content, "Part 1. Part 2.");
        assertEquals(sendMessageSpy.calls.length, 2);
  
        // Assert History - THIS IS THE CRITICAL TEST
        const secondCallArgs = sendMessageSpy.calls[1].args[0] as ChatApiRequest;
        assertExists(secondCallArgs.messages);
        assertEquals(secondCallArgs.messages.length, 2);
        assertEquals(secondCallArgs.messages[0].role, "user");
        assertEquals(secondCallArgs.messages[0].content, "Tell me a story");
        assertEquals(secondCallArgs.messages[1].role, "assistant");
        assertEquals(secondCallArgs.messages[1].content, "Part 1.");
  
        // Assert Token Accumulation
        const tokenUsage = response.token_usage as unknown as TokenUsage;
        assertEquals(tokenUsage.prompt_tokens, 20); // 10 from each call
        assertEquals(tokenUsage.completion_tokens, 10); // 5 from each call
      },
    );
  
    await t.step(
      "Multi-Part Continuation (3 parts, correct history)",
      async () => {
        // Arrange
        const { adapter, sendMessageSpy } = createMockAiAdapter([
            { content: "A.", finishReason: "length" },
            { content: " B.", finishReason: "length" },
            { content: " C.", finishReason: "stop" },
        ]);
        const initialRequest: ChatApiRequest = {
          message: "A, B, C",
          providerId: "mock-provider-id",
          promptId: "mock-prompt-id",
          messages: [{ role: 'user', content: 'A, B, C' }],
        };
  
        // Act
        const response = await handleContinuationLoop(adapter, initialRequest, "test-model", "test-key", mockLogger);
  
        // Assert
        assertEquals(response.content, "A. B. C.");
        assertEquals(sendMessageSpy.calls.length, 3);
  
        // Assert History of the THIRD call
        const thirdCallArgs = sendMessageSpy.calls[2].args[0] as ChatApiRequest;
        assertExists(thirdCallArgs.messages);
        assertEquals(thirdCallArgs.messages.length, 3);
        assertEquals(thirdCallArgs.messages[0].content, "A, B, C");
        assertEquals(thirdCallArgs.messages[1].content, "A.");
        assertEquals(thirdCallArgs.messages[2].role, "assistant");
        assertEquals(thirdCallArgs.messages[2].content, " B.");
  
        // Assert Token Accumulation
        const tokenUsage = response.token_usage as unknown as TokenUsage;
        assertEquals(tokenUsage.prompt_tokens, 30);
        assertEquals(tokenUsage.completion_tokens, 15);
      },
    );
  
    await t.step(
      "Maximum Loop Iterations (Safety Break)",
      async () => {
        // Arrange
        const { adapter, sendMessageSpy } = createMockAiAdapter([
            { content: "Loop.", finishReason: "length" },
            { content: "Loop.", finishReason: "length" },
            { content: "Loop.", finishReason: "length" },
            { content: "Loop.", finishReason: "length" },
            { content: "Loop.", finishReason: "length" },
            { content: "Should not be called.", finishReason: "stop" }, 
        ]);
        const initialRequest: ChatApiRequest = {
            message: "Infinite loop",
            providerId: "mock-provider-id",
            promptId: "mock-prompt-id",
            messages: [{ role: 'user', content: 'Infinite loop' }],
        };
  
        // Act
        const response = await handleContinuationLoop(adapter, initialRequest, "test-model", "test-key", mockLogger);
  
        // Assert
        assertEquals(response.content, "Loop.Loop.Loop.Loop.Loop.");
        assertEquals(sendMessageSpy.calls.length, 5); // Total of 1 initial + 4 continuations
      },
    );
  });
