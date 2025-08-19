import {
    assertEquals,
    assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { handlePostRequest } from "./handlePostRequest.ts";
import { ChatApiRequest, ChatHandlerDeps, ChatHandlerSuccessResponse, ChatMessageRow } from "../_shared/types.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { logger } from "../_shared/logger.ts";
import { SuccessfulChatContext } from "./prepareChatContext.ts";
import { getMockAiProviderAdapter } from '../_shared/ai_service/ai_provider.mock.ts';

// --- Reusable Mock Data ---

const mockSuccessfulChatContext: SuccessfulChatContext = {
    wallet: { walletId: 'wallet-id', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: 'test-user' },
    aiProviderAdapter: getMockAiProviderAdapter(logger, { api_identifier: 'test-model', input_token_cost_rate: null, output_token_cost_rate: null, tokenization_strategy: { type: 'none' } }).instance,
    modelConfig: { api_identifier: 'test-model', input_token_cost_rate: null, output_token_cost_rate: null, tokenization_strategy: { type: 'none' } },
    actualSystemPromptText: 'system prompt',
    finalSystemPromptIdForDb: 'prompt-id',
    apiKey: 'test-api-key',
    providerApiIdentifier: 'test-model',
};

const mockAssistantMessage: ChatMessageRow = {
    id: 'mock-assistant-message-id',
    chat_id: 'mock-chat-id',
    user_id: 'test-user',
    created_at: new Date().toISOString(),
    role: 'assistant',
    content: 'Mock response',
    ai_provider_id: 'provider-id',
    system_prompt_id: 'prompt-id',
    token_usage: null,
    error_type: null,
    response_to_message_id: null,
    is_active_in_thread: true,
    updated_at: new Date().toISOString(),
};

const mockSuccessResponse: ChatHandlerSuccessResponse = {
    chatId: 'mock-chat-id',
    assistantMessage: mockAssistantMessage,
};


Deno.test("handlePostRequest: should call handleNormalPath and pass runtime deps", async () => {
    // Arrange
    const prepareChatContextFactorySpy = spy(
        (
            _requestBody: ChatApiRequest,
            _userId: string,
            _deps: ChatHandlerDeps,
        ) => Promise.resolve(mockSuccessfulChatContext)
    );
    const prepareChatContextRuntimeSpy = spy(
        (
            _requestBody: ChatApiRequest,
            _userId: string,
            _deps: ChatHandlerDeps,
        ) => Promise.resolve(mockSuccessfulChatContext)
    );

    const handleNormalPathSpy = spy(() => Promise.resolve(mockSuccessResponse));
    const handleRewindPathSpy = spy(() => Promise.resolve(mockSuccessResponse));
    const handleDialecticPathSpy = spy(() => Promise.resolve(mockSuccessResponse));

    const handlePostRequestForTest = handlePostRequest;

    const getAiProviderAdapterSpy = spy(() => null);
    const deps: ChatHandlerDeps = {
        logger,
        prepareChatContext: prepareChatContextRuntimeSpy,
        handleNormalPath: handleNormalPathSpy,
        handleRewindPath: handleRewindPathSpy,
        handleDialecticPath: handleDialecticPathSpy,
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        getAiProviderAdapter: getAiProviderAdapterSpy,
        verifyApiKey: spy(() => Promise.resolve(true)),
        countTokensForMessages: spy(() => 10),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "Hello", providerId: "provider-id", promptId: "prompt-id" };
    const mockSupabase = createMockSupabaseClient("test-user-id");
    const supabaseClient = mockSupabase.client as unknown as SupabaseClient;

    // Act
    await handlePostRequestForTest(requestBody, supabaseClient, "test-user-id", deps);

    // Assert
    assertEquals(prepareChatContextFactorySpy.calls.length, 0, "Factory spy should NOT have been called");
    assertEquals(prepareChatContextRuntimeSpy.calls.length, 1, "Runtime spy should have been called");

    const passedDeps = prepareChatContextRuntimeSpy.calls[0].args[2];
    assert(passedDeps, "Deps object should have been passed to prepareChatContext");

    // Verify that all original dependencies are present in the passed dependencies
    for (const key in deps) {
        const typedKey = key as keyof ChatHandlerDeps;
        if (Object.prototype.hasOwnProperty.call(deps, typedKey)) {
            assertEquals(
                passedDeps[typedKey],
                deps[typedKey],
                `Dependency "${typedKey}" was not passed down correctly.`,
            );
        }
    }

    assertEquals(handleNormalPathSpy.calls.length, 1, "handleNormalPath should have been called once");
    assertEquals(handleRewindPathSpy.calls.length, 0, "handleRewindPath should not have been called");
});

Deno.test("handlePostRequest: should call handleRewindPath when rewindFromMessageId is provided", async () => {
    // Arrange
    const prepareChatContextSpy = spy(
        (
            _requestBody: ChatApiRequest,
            _userId: string,
            _deps: ChatHandlerDeps,
        ) => Promise.resolve(mockSuccessfulChatContext)
    );
    const handleNormalPathSpy = spy(() => Promise.resolve(mockSuccessResponse));
    const handleRewindPathSpy = spy(() => Promise.resolve(mockSuccessResponse));
    const handleDialecticPathSpy = spy(() => Promise.resolve(mockSuccessResponse));

    const handlePostRequestForTest = handlePostRequest;

    const deps: ChatHandlerDeps = {
        logger,
        prepareChatContext: prepareChatContextSpy,
        handleNormalPath: handleNormalPathSpy,
        handleRewindPath: handleRewindPathSpy,
        handleDialecticPath: handleDialecticPathSpy,
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        getAiProviderAdapter: spy(),
        verifyApiKey: spy(() => Promise.resolve(true)),
        countTokensForMessages: spy(() => 10),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "Hello", providerId: "provider-id", promptId: "prompt-id", rewindFromMessageId: "rewind-id" };
    const mockSupabase = createMockSupabaseClient("test-user-id");
    const supabaseClient = mockSupabase.client as unknown as SupabaseClient;

    // Act
    await handlePostRequestForTest(requestBody, supabaseClient, "test-user-id", deps);

    // Assert
    assertEquals(prepareChatContextSpy.calls.length, 1);
    assertEquals(handleNormalPathSpy.calls.length, 0, "handleNormalPath should not have been called");
    assertEquals(handleRewindPathSpy.calls.length, 1, "handleRewindPath should have been called once");
});

Deno.test("handlePostRequest: should return error and not call path handlers if prepareChatContext fails", async () => {
    // Arrange
    const error = { message: "Context preparation failed", status: 500 };
    const prepareChatContextSpy = spy(() => Promise.resolve({ error }));
    const handleNormalPathSpy = spy(() => Promise.resolve(mockSuccessResponse));
    const handleRewindPathSpy = spy(() => Promise.resolve(mockSuccessResponse));
    const handleDialecticPathSpy = spy(() => Promise.resolve(mockSuccessResponse));

    const handlePostRequestForTest = handlePostRequest;
    
    const deps: ChatHandlerDeps = {
        logger,
        prepareChatContext: prepareChatContextSpy,
        handleNormalPath: handleNormalPathSpy,
        handleRewindPath: handleRewindPathSpy,
        handleDialecticPath: handleDialecticPathSpy,
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        getAiProviderAdapter: spy(),
        verifyApiKey: spy(() => Promise.resolve(true)),
        countTokensForMessages: spy(() => 10),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "Hello", providerId: "provider-id", promptId: "prompt-id" };
    const mockSupabase = createMockSupabaseClient("test-user-id");
    const supabaseClient = mockSupabase.client as unknown as SupabaseClient;

    // Act
    const result = await handlePostRequestForTest(requestBody, supabaseClient, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error, error);
    assertEquals(prepareChatContextSpy.calls.length, 1);
    assertEquals(handleNormalPathSpy.calls.length, 0, "handleNormalPath should not have been called after context error");
    assertEquals(handleRewindPathSpy.calls.length, 0, "handleRewindPath should not have been called after context error");
});
