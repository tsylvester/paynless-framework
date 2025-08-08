import { assert, assertEquals, assertExists } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { stub, restore, type Stub } from "https://deno.land/std@0.170.0/testing/mock.ts";
import { callUnifiedAIModel } from "./callModel.ts";
import type { ChatHandlerSuccessResponse, ChatMessage, TokenUsage } from "../_shared/types.ts";
import type { CallUnifiedAIModelOptions, UnifiedAIResponse } from "./dialectic.interface.ts";
import type { Json } from "../types_db.ts";

Deno.test("callUnifiedAIModel - successful call to /chat", async () => {
  const mockChatFunctionUrl = "http://localhost:12345/functions/v1/chat";
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Hello, world!";
  const mockAssociatedChatId = "chat-uuid-123";
  const mockSystemPromptId = "system-prompt-uuid-456";
  const mockUserId = "user-uuid-123";

  const mockTokenUsage: TokenUsage = {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  };

  const baseMockAssistantMessage: any = {
    id: "msg-2",
    chat_id: mockAssociatedChatId,
    user_id: mockUserId,
    role: "assistant",
    content: "Hi there! This is a test response.",
    token_usage: mockTokenUsage,
    ai_provider_id: mockModelCatalogId,
    system_prompt_id: mockSystemPromptId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'sent',
    error_type: null,
    is_active_in_thread: true,
    response_to_message_id: null,
    prompt_template_id: null,
    organization_id: null,
  };

  const mockChatSuccessResponse: ChatHandlerSuccessResponse = {
    assistantMessage: baseMockAssistantMessage,
    chatId: mockAssociatedChatId,
  };

  const fetchStub: Stub<typeof globalThis> = stub(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    return await Promise.resolve(new Response(JSON.stringify(mockChatSuccessResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });

  const denoEnvStub: Stub<typeof Deno.env> = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  try {
    const result: UnifiedAIResponse = await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken
    );

    assertExists(result, "Result should not be null or undefined");
    assertEquals(result.error, null);
    assertEquals(result.content, baseMockAssistantMessage.content);
    assertEquals(result.inputTokens, mockTokenUsage.prompt_tokens);
    assertEquals(result.outputTokens, mockTokenUsage.completion_tokens);
    assertEquals(result.tokenUsage, mockTokenUsage);
    assertExists(result.processingTimeMs, "processingTimeMs should exist");
    assertEquals(result.rawProviderResponse, baseMockAssistantMessage);
    
    assert(fetchStub.calls.length === 1, "Fetch should be called once");
    const firstCall = fetchStub.calls[0];
    assertEquals(firstCall.args[0], mockChatFunctionUrl);
    const fetchOptions = firstCall.args[1];
    assertEquals(fetchOptions.method, "POST");
    assertEquals((fetchOptions.headers)["Authorization"], `Bearer ${mockAuthToken}`);
    const actualBody = JSON.parse(fetchOptions.body);
    const expectedBodyToCompare = {
        message: mockRenderedPrompt,
        providerId: mockModelCatalogId,
        promptId: "__none__",
        isDialectic: true,
        // chatId is correctly NOT included
        messages: [],
    };
    assertEquals(actualBody, expectedBodyToCompare);

  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});

Deno.test("callUnifiedAIModel - network error during fetch", async () => {
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Hello, world!";
  const mockAssociatedChatId = "chat-uuid-network-error";

  const fetchStub: Stub<typeof globalThis> = stub(globalThis, "fetch", async (_url: string | URL | Request, _options?: RequestInit): Promise<Response> => {
    return await Promise.reject(new Error("Simulated network error"));
  });

  const denoEnvStub: Stub<typeof Deno.env> = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  try {
    const result: UnifiedAIResponse = await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken
    );

    assertExists(result.error, "Error should exist for a network failure");
    assertEquals(result.content, null, "Content should be null on error");
    assertEquals(result.errorCode, "NETWORK_OR_UNHANDLED_ERROR"); 
    assert(result.error!.includes("Simulated network error"), "Error message should contain the original network error");

  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});

Deno.test("callUnifiedAIModel - non-OK HTTP response from /chat", async () => {
  const mockChatFunctionUrl = "http://localhost:12345/functions/v1/chat";
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Hello, world!";
  const mockAssociatedChatId = "chat-uuid-http-error";
  const errorPayload = { error: { message: "Internal Server Error", code: "CHAT_SERVER_ERROR" } };

  const fetchStub: Stub<typeof globalThis> = stub(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    return await Promise.resolve(new Response(JSON.stringify(errorPayload), {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json" },
    }));
  });

  const denoEnvStub: Stub<typeof Deno.env> = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  try {
    const result: UnifiedAIResponse = await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken
    );

    assertExists(result.error, "Error should exist for non-OK HTTP response");
    assertEquals(result.content, null, "Content should be null on error");
    assertEquals(result.errorCode, "CHAT_API_CALL_FAILED");
    assert(result.error!.includes("500 Internal Server Error"), "Error message should include status text");
    assert(result.error!.includes(JSON.stringify(errorPayload)), "Error message should include the error payload from /chat");

  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});

Deno.test("callUnifiedAIModel - non-JSON response from /chat", async () => {
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Hello, world!";
  const mockAssociatedChatId = "chat-uuid-non-json";

  const fetchStub: Stub<typeof globalThis> = stub(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    return await Promise.resolve(new Response("This is not JSON", {
      status: 200,
      headers: { "Content-Type": "text/plain" }, 
    }));
  });

  const denoEnvStub: Stub<typeof Deno.env> = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  try {
    const result: UnifiedAIResponse = await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken
    );

    assertExists(result.error, "Error should exist for non-JSON response");
    assertEquals(result.content, null, "Content should be null on error");
    assertEquals(result.errorCode, "RESPONSE_PARSING_ERROR"); 
    assert(result.error!.includes("returned non-JSON response"), "Error message should indicate JSON parsing failure");
    assert(result.error!.includes("This is not JSON"), "Error message should include the actual response text");

  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});

Deno.test("callUnifiedAIModel - /chat response missing assistantMessage", async () => {
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Hello, world!";
  const mockAssociatedChatId = "chat-uuid-missing-assistant-message";
  
  const malformedPayload = { chatId: mockAssociatedChatId, someOtherField: "some value" };

  const fetchStub: Stub<typeof globalThis> = stub(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    return await Promise.resolve(new Response(JSON.stringify(malformedPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" }, 
    }));
  });

  const denoEnvStub: Stub<typeof Deno.env> = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  try {
    const result: UnifiedAIResponse = await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken
    );

    assertExists(result.error, "Error should exist when assistantMessage is missing");
    assertEquals(result.content, null, "Content should be null on error");
    assertEquals(result.errorCode, "CHAT_API_INVALID_RESPONSE");
    assert(result.error!.includes("did not include an assistantMessage"), "Error message should indicate missing assistantMessage");

  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});

Deno.test("callUnifiedAIModel - with continueUntilComplete: true", async () => {
    const mockAuthToken = "test-auth-token-continue";
    const mockModelCatalogId = "gpt-4-provider-id-continue";
    const mockRenderedPrompt = "This is a long prompt that needs continuation.";
    const mockAssociatedChatId = "chat-uuid-continue-true";
  
    const mockChatSuccessResponse: ChatHandlerSuccessResponse = {
      assistantMessage: { 
        id: "msg-continue-true", 
        content: "Continued response.", 
        role: 'assistant',
        chat_id: mockAssociatedChatId,
        created_at: new Date().toISOString(),
        error_type: null,
        is_active_in_thread: true,
        response_to_message_id: null,
        user_id: null,
        ai_provider_id: mockModelCatalogId,
        system_prompt_id: null,
        token_usage: null,
        updated_at: new Date().toISOString(),
      },
      chatId: mockAssociatedChatId,
    };
  
    const fetchStub = stub(globalThis, "fetch", async () => {
      return await Promise.resolve(new Response(JSON.stringify(mockChatSuccessResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
  
    const denoEnvStub = stub(Deno.env, "get", (variable: string): string | undefined => {
      if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
      if (variable === "SUPABASE_URL") return "http://localhost:12345";
      return undefined;
    });
  
    try {
      await callUnifiedAIModel(
        mockModelCatalogId,
        mockRenderedPrompt,
        mockAssociatedChatId,
        mockAuthToken,
        undefined, // options
        true // continueUntilComplete
      );
  
      assertEquals(fetchStub.calls.length, 1);
      const firstCall = fetchStub.calls[0];
      const fetchOptions = firstCall.args[1];
      if (typeof fetchOptions?.body === "string") {
        const actualBody = JSON.parse(fetchOptions.body);
        assertEquals(actualBody.continue_until_complete, true);
      } else {
        assert(false, "Body is not a string.");
      }
  
    } finally {
      fetchStub.restore();
      denoEnvStub.restore();
    }
  });

Deno.test("callUnifiedAIModel - with continueUntilComplete: false", async () => {
    const mockAuthToken = "test-auth-token-continue";
    const mockModelCatalogId = "gpt-4-provider-id-continue";
    const mockRenderedPrompt = "This is a short prompt.";
    const mockAssociatedChatId = "chat-uuid-continue-false";

    const mockChatSuccessResponse: ChatHandlerSuccessResponse = {
      assistantMessage: { 
        id: "msg-continue-false", 
        content: "Short response.", 
        role: 'assistant',
        chat_id: mockAssociatedChatId,
        created_at: new Date().toISOString(),
        error_type: null,
        is_active_in_thread: true,
        response_to_message_id: null,
        user_id: null,
        ai_provider_id: mockModelCatalogId,
        system_prompt_id: null,
        token_usage: null,
        updated_at: new Date().toISOString(),
      },
      chatId: mockAssociatedChatId,
    };

    const fetchStub = stub(globalThis, "fetch", async () => {
      return await Promise.resolve(new Response(JSON.stringify(mockChatSuccessResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });

    const denoEnvStub = stub(Deno.env, "get", (variable: string): string | undefined => {
      if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
      if (variable === "SUPABASE_URL") return "http://localhost:12345";
      return undefined;
    });

    try {
      await callUnifiedAIModel(
        mockModelCatalogId,
        mockRenderedPrompt,
        mockAssociatedChatId,
        mockAuthToken,
        undefined, // options
        false // continueUntilComplete
      );

      assertEquals(fetchStub.calls.length, 1);
      const firstCall = fetchStub.calls[0];
      const fetchOptions = firstCall.args[1];
      if (typeof fetchOptions?.body === "string") {
        const actualBody = JSON.parse(fetchOptions.body);
        assertEquals(actualBody.continue_until_complete, false);
      } else {
        assert(false, "Body is not a string.");
      }

    } finally {
      fetchStub.restore();
      denoEnvStub.restore();
    }
});

Deno.test("callUnifiedAIModel - with options.historyMessages", async () => {
  const mockChatFunctionUrl = "http://localhost:12345/functions/v1/chat";
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Follow up question.";
  const mockAssociatedChatId = "chat-uuid-history";
  const mockUserId = "user-uuid-options";

  const mockHistoryMessages: ChatMessage[] = [
    {
      id: "hist-msg-1",
      chat_id: mockAssociatedChatId,
      user_id: mockUserId,
      role: "user",
      content: "Initial question.",
      token_usage: null,
      ai_provider_id: null,
      system_prompt_id: null,
      created_at: new Date(Date.now() - 10000).toISOString(),
      updated_at: new Date(Date.now() - 10000).toISOString(),
      status: 'sent',
      error_type: null,
      is_active_in_thread: true,
      response_to_message_id: null,
    }, 
  ];

  const mockTokenUsage: TokenUsage = { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 };
  const baseMockAssistantMessage: any = {
    id: "msg-options-1",
    chat_id: mockAssociatedChatId,
    user_id: mockUserId,
    role: "assistant",
    content: "Response to follow up.",
    token_usage: mockTokenUsage,
    ai_provider_id: mockModelCatalogId,
    system_prompt_id: null, 
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'sent',
    error_type: null,
    is_active_in_thread: true,
    response_to_message_id: null,
    prompt_template_id: null,
    organization_id: null,
  };

  const mockChatSuccessResponse: ChatHandlerSuccessResponse = {
    assistantMessage: baseMockAssistantMessage,
    chatId: mockAssociatedChatId,
  };

  const fetchStub: Stub<typeof globalThis> = stub(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    return await Promise.resolve(new Response(JSON.stringify(mockChatSuccessResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });

  const denoEnvStub: Stub<typeof Deno.env> = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  const options: CallUnifiedAIModelOptions = {
    customParameters: {
      historyMessages: mockHistoryMessages,
    }
  };

  try {
    const result: UnifiedAIResponse = await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken,
      options
    );

    assertExists(result);
    assertEquals(result.error, null);
    assertEquals(result.content, baseMockAssistantMessage.content);

    assert(fetchStub.calls.length === 1, "Fetch should be called once");
    const firstCall = fetchStub.calls[0];
    assertEquals(firstCall.args[0], mockChatFunctionUrl);
    const fetchOptions = firstCall.args[1];
    const actualBodyForHistory = JSON.parse(fetchOptions.body);
    const expectedBodyForHistory = {
        message: mockRenderedPrompt,
        providerId: mockModelCatalogId,
        promptId: "__none__", 
        isDialectic: true,
        // chatId is correctly NOT included
        messages: mockHistoryMessages.map(m => ({ 
            role: m.role,
            content: m.content,
        })),
    };
    assertEquals(actualBodyForHistory, expectedBodyForHistory);

  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});

Deno.test("callUnifiedAIModel - with options.currentStageSystemPromptId and options.maxTokensToGenerate", async () => {
  const mockChatFunctionUrl = "http://localhost:12345/functions/v1/chat";
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Generate a short story.";
  const mockAssociatedChatId = "chat-uuid-system-prompt-options";
  const mockSystemPromptId = "custom-system-prompt-from-options-uuid";
  const mockMaxTokens = 150;
  const mockUserId = "user-uuid-options-2";
  const mockWalletId = "wallet-uuid-test-123";

  const mockTokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 145, total_tokens: 155 }; 
  const baseMockAssistantMessage: any = {
    id: "msg-options-2",
    chat_id: mockAssociatedChatId,
    user_id: mockUserId,
    role: "assistant",
    content: "Here is a short story...",
    token_usage: mockTokenUsage,
    ai_provider_id: mockModelCatalogId,
    system_prompt_id: "this-should-be-overridden-by-options", 
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'sent',
    error_type: null,
    is_active_in_thread: true,
    response_to_message_id: null,
    prompt_template_id: null,
    organization_id: null,
  };

  const mockChatSuccessResponse: ChatHandlerSuccessResponse = {
    assistantMessage: baseMockAssistantMessage,
    chatId: mockAssociatedChatId,
  };

  const fetchStub: Stub<typeof globalThis> = stub(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
    return await Promise.resolve(new Response(JSON.stringify(mockChatSuccessResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });

  const denoEnvStub: Stub<typeof Deno.env> = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  const options: CallUnifiedAIModelOptions = {
    customParameters: {
      max_tokens_to_generate: mockMaxTokens,
    },
    currentStageSystemPromptId: mockSystemPromptId,
    walletId: mockWalletId,
  };

  try {
    const result: UnifiedAIResponse = await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken,
      options
    );

    assertExists(result);
    assertEquals(result.error, null);
    assertEquals(result.content, baseMockAssistantMessage.content);

    assert(fetchStub.calls.length === 1, "Fetch should be called once");
    const firstCall = fetchStub.calls[0];
    assertEquals(firstCall.args[0], mockChatFunctionUrl);
    const fetchOptions = firstCall.args[1];
    const expectedBody = {
        message: mockRenderedPrompt,
        providerId: mockModelCatalogId,
        promptId: mockSystemPromptId, 
        isDialectic: true,
        // chatId is correctly NOT included
        messages: [], 
        max_tokens_to_generate: mockMaxTokens,
        walletId: mockWalletId
    };
    assertEquals(JSON.parse(fetchOptions.body), expectedBody);

  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});

Deno.test("callUnifiedAIModel - should not pass chatId for dialectic jobs to prevent history masking", async () => {
  const mockChatFunctionUrl = "http://localhost:12345/functions/v1/chat";
  const mockAuthToken = "test-auth-token";
  const mockModelCatalogId = "gpt-4-provider-id";
  const mockRenderedPrompt = "Hello, world!";
  const mockAssociatedChatId = "chat-uuid-123";

  const mockChatSuccessResponse: ChatHandlerSuccessResponse = {
    assistantMessage: { 
      id: "msg-no-chat-id", 
      content: "Response.", 
      role: 'assistant', 
      chat_id: null, 
      created_at: new Date().toISOString(), 
      error_type: null, 
      is_active_in_thread: true, 
      response_to_message_id: null, 
      user_id: null, 
      ai_provider_id: mockModelCatalogId,
      system_prompt_id: null, 
      updated_at: new Date().toISOString(), 
      token_usage: null 
    },
    chatId: mockAssociatedChatId,
  };

    const fetchStub = stub(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
        return await Promise.resolve(new Response(JSON.stringify(mockChatSuccessResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }));
    });

  const denoEnvStub = stub(Deno.env, "get", (variable: string): string | undefined => {
    if (variable === "SUPABASE_INTERNAL_FUNCTIONS_URL") return "http://localhost:12345";
    if (variable === "SUPABASE_URL") return "http://localhost:12345";
    return undefined;
  });

  try {
    await callUnifiedAIModel(
      mockModelCatalogId,
      mockRenderedPrompt,
      mockAssociatedChatId,
      mockAuthToken
    );

    assertEquals(fetchStub.calls.length, 1, "Fetch should be called once");
    const firstCall = fetchStub.calls[0];
    const fetchOptions = firstCall.args[1];
    
    if(typeof fetchOptions?.body === 'string') {
        const actualBody = JSON.parse(fetchOptions.body);
        // This is the key assertion for the desired state. It will fail initially.
        assertEquals(actualBody.chatId, undefined, "chatId should be undefined to prevent history masking");
    } else {
        assert(false, "Body is not string");
    }


  } finally {
    fetchStub.restore();
    denoEnvStub.restore();
  }
});