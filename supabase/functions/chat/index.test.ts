import {
    assertEquals,
    assert,
    assertInstanceOf,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, stub, assertSpyCall } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { createChatServiceHandler, defaultDeps } from "./index.ts";
import {
    createTestDeps,
    ChatTestConstants,
    mockSupaConfigBase,
    createMockAiAdapter,
} from './_chat.test.utils.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ChatHandlerDeps, FactoryDependencies, AiProviderAdapter, AiProviderAdapterInstance, ChatHandlerSuccessResponse, ChatMessageRow, ChatApiRequest } from "../_shared/types.ts";
import { ILogger } from "../_shared/types.ts";
import { Tables } from "../types_db.ts";
import { AdapterResponsePayload } from "../_shared/types.ts";
import { ProviderModelInfo } from "../_shared/types.ts";
import { DummyAdapter } from "../_shared/ai_service/dummy_adapter.ts";
import { testProviderMap, defaultProviderMap } from "../_shared/ai_service/factory.ts";

Deno.test("Chat Service Handler", async (t) => {

    const setup = (supaConfig = mockSupaConfigBase, depOverrides: Partial<ChatHandlerDeps> = {}) => {
        const mockAdminClient = createMockSupabaseClient('admin-user', supaConfig).client;
        const mockUserClientSetup = createMockSupabaseClient(supaConfig.mockUser?.id || 'test-user', supaConfig);
        const getSupabaseClientSpy = spy((_token: string | null) => mockUserClientSetup.client as unknown as SupabaseClient);

        const testDeps: ChatHandlerDeps = { ...defaultDeps, ...depOverrides };

        const handler = createChatServiceHandler(
            testDeps,
            getSupabaseClientSpy,
            mockAdminClient as unknown as SupabaseClient
        );

        return { handler, mockUserClientSetup, getSupabaseClientSpy };
    };

    await t.step("General: should handle CORS preflight OPTIONS request", async () => {
        const { handler } = setup();
        const req = new Request("http://localhost/chat", {
            method: "OPTIONS",
            headers: { "Origin": "http://localhost:5173" }
        });
        const res = await handler(req);

        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
    });

    await t.step("General: should return 401 for requests without an auth header", async () => {
        const { handler } = setup({
            ...mockSupaConfigBase,
            getUserResult: { data: { user: null }, error: { message: 'auth error', name: 'AuthError' } }
        });

        const req = new Request("http://localhost/chat", {
            method: "POST",
            body: JSON.stringify({ message: "Hi" }),
            headers: { 'Content-Type': 'application/json' },
        });

        const res = await handler(req);
        assertEquals(res.status, 401);
        const body = await res.json();
        assertEquals(body.error, "Authentication required");
        assertEquals(body.code, "AUTH_REQUIRED");
    });

    await t.step("General: should return 401 for invalid authentication credentials", async () => {
        const authError = Object.assign(new Error('Invalid JWT'), { status: 401 });
        authError.name = 'AuthError';

        const { handler } = setup({
            ...mockSupaConfigBase,
            simulateAuthError: authError
        });
        
        const req = new Request("http://localhost/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "Hi",
                providerId: ChatTestConstants.testProviderId,
                promptId: ChatTestConstants.testPromptId
            }),
            headers: { Authorization: "Bearer invalid-token", "Content-Type": "application/json" },
        });
        const res = await handler(req);
        assertEquals(res.status, 401);
        const body = await res.json();
        assertEquals(body.error, "Authentication required");
    });


    await t.step("POST: should return 400 for invalid JSON", async () => {
        const { handler } = setup();
        const req = new Request("http://localhost/chat", {
            method: "POST",
            body: "{ not json }",
            headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        });
        const res = await handler(req);
        assertEquals(res.status, 400);
        const body = await res.json();
        assertEquals(body.error, "Invalid JSON format in request body.");
    });

    await t.step("POST: should return 400 for schema validation failure", async () => {
        const { handler } = setup();
        const req = new Request("http://localhost/chat", {
            method: "POST",
            body: JSON.stringify({ invalid_prop: "some value" }),
            headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        });
        const res = await handler(req);
        assertEquals(res.status, 400);
        const body = await res.json();
        assert(body.error.startsWith("Invalid request body:"));
    });

    await t.step("POST: should successfully process a valid request", async () => {
        const mockAssistantMessage: ChatMessageRow = {
            id: 'asst_test-message-id',
            chat_id: ChatTestConstants.testChatId,
            user_id: ChatTestConstants.testUserId,
            created_at: new Date().toISOString(),
            role: 'assistant',
            content: 'Success',
            ai_provider_id: ChatTestConstants.testProviderId,
            system_prompt_id: ChatTestConstants.testPromptId,
            token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            error_type: null,
            response_to_message_id: 'user_test-message-id',
            is_active_in_thread: true,
            updated_at: new Date().toISOString(),
        };

        const mockSuccessResponse: ChatHandlerSuccessResponse = {
            chatId: ChatTestConstants.testChatId,
            assistantMessage: mockAssistantMessage,
        };

        const handlePostRequestStub = stub(
            defaultDeps,
            "handlePostRequest",
            () => Promise.resolve(mockSuccessResponse)
        ) as any;

        const { handler } = setup(
            mockSupaConfigBase,
            { handlePostRequest: handlePostRequestStub }
        );

        const req = new Request("http://localhost/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "Hi",
                providerId: ChatTestConstants.testProviderId,
                promptId: ChatTestConstants.testPromptId
            }),
            headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        });
        const res = await handler(req);
        assertEquals(res.status, 200);
        const body = await res.json();
        assertEquals(body.chatId, ChatTestConstants.testChatId);

        handlePostRequestStub.restore();
    });

    await t.step("DELETE: should return 400 if chat ID is missing", async () => {
        const { handler } = setup();
        const req = new Request("http://localhost/chat/", {
            method: "DELETE",
            headers: { Authorization: "Bearer test-token" },
        });
        const res = await handler(req);
        assertEquals(res.status, 400);
        const body = await res.json();
        assertEquals(body.error, "Missing chat ID in URL path for DELETE request.");
    });

    await t.step("DELETE: should successfully process a valid request", async () => {
        const { handler, mockUserClientSetup } = setup({
            ...mockSupaConfigBase,
            rpcResults: {
                delete_chat_and_messages: { data: null, error: null }
            }
        });
        const rpcSpy = mockUserClientSetup.spies.rpcSpy;

        const req = new Request(`http://localhost/chat/${ChatTestConstants.testChatId}`, {
            method: "DELETE",
            headers: { Authorization: "Bearer test-token" },
        });
        const res = await handler(req);
        assertEquals(res.status, 204);
        assertSpyCall(rpcSpy, 0, {
            args: ['delete_chat_and_messages', {
                p_chat_id: ChatTestConstants.testChatId,
                p_user_id: ChatTestConstants.testUserId
            }]
        });
    });

    await t.step("DELETE: should return 403 on permission denied error", async () => {
        const { handler } = setup({
            ...mockSupaConfigBase,
            rpcResults: {
                delete_chat_and_messages: { error: { message: "permission denied for view", name: "PostgrestError" } }
            }
        });
        const req = new Request(`http://localhost/chat/${ChatTestConstants.testChatId}`, {
            method: "DELETE",
            headers: { Authorization: "Bearer test-token" },
        });
        const res = await handler(req);
        assertEquals(res.status, 403);
        const body = await res.json();
        assertEquals(body.error, "Permission denied to delete this chat.");
    });

    await t.step("defaultDeps.getAiProviderAdapter should use the providerMap from dependencies", () => {
        const dummyProvider: Tables<'ai_providers'> = {
            id: '02e45bc4-c584-52a0-b647-77570c2208cd',
            api_identifier: 'dummy-echo-v1',
            name: 'Dummy Echo v1',
            provider: 'dummy',
            config: {
                "mode": "echo",
                "modelId": "dummy-echo-v1",
                "api_identifier": "dummy-echo-v1",
                "basePromptTokens": 2,
                "input_token_cost_rate": 1,
                "tokenization_strategy": {
                    "type": "tiktoken",
                    "tiktoken_encoding_name": "cl100k_base"
                },
                "output_token_cost_rate": 1,
                "provider_max_input_tokens": 4096,
                "provider_max_output_tokens": 4096
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true,
            is_default_embedding: false,
            is_enabled: true,
            description: 'Dummy provider for testing',
        };

        const adapter = defaultDeps.getAiProviderAdapter({
            provider: dummyProvider,
            apiKey: 'test-key',
            logger: defaultDeps.logger,
            providerMap: testProviderMap,
        });

        assertInstanceOf(adapter, DummyAdapter);
    });

    await t.step("handler should inject testProviderMap when X-Test-Mode header is present", async () => {
        // Arrange
        const mockSuccessResponse: ChatHandlerSuccessResponse = {
            chatId: ChatTestConstants.testChatId,
            assistantMessage: {
                id: 'asst_test-message-id',
                chat_id: ChatTestConstants.testChatId,
                user_id: ChatTestConstants.testUserId,
                created_at: new Date().toISOString(),
                role: 'assistant',
                content: 'Success',
                ai_provider_id: ChatTestConstants.testProviderId,
                system_prompt_id: ChatTestConstants.testPromptId,
                token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                error_type: null,
                response_to_message_id: 'user_test-message-id',
                is_active_in_thread: true,
                updated_at: new Date().toISOString(),
            },
        };

        const handlePostRequestSpy = spy((
            _requestBody: ChatApiRequest,
            _supabaseClient: SupabaseClient,
            _userId: string,
            _deps: ChatHandlerDeps
        ) => Promise.resolve(mockSuccessResponse));

        const depsWithSpy = { ...defaultDeps, handlePostRequest: handlePostRequestSpy };

        const { handler } = setup(
            mockSupaConfigBase,
            depsWithSpy
        );

        // Create a mock "real" provider to test the injected function
        const openAiProvider: Tables<'ai_providers'> = {
            id: ChatTestConstants.testProviderId, // Using a real UUID to pass validation
            api_identifier: 'openai-gpt-4o',
            provider: 'openai',
            name: 'Test OpenAI',
            config: {
                "api_identifier": "openai-gpt-4o",
                "tokenization_strategy": { "type": "tiktoken", "tiktoken_encoding_name": "cl100k_base" },
                "input_token_cost_rate": 0.001,
                "output_token_cost_rate": 0.002
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true,
            is_default_embedding: false,
            is_enabled: true,
            description: 'Test provider',
        };

        const req = new Request("http://localhost/chat", {
            method: "POST",
            body: JSON.stringify({
                message: "Hi",
                providerId: ChatTestConstants.testProviderId, // A real provider that should be overridden
                promptId: ChatTestConstants.testPromptId
            }),
            headers: {
                'Authorization': 'Bearer test-token',
                'Content-Type': 'application/json',
                'X-Test-Mode': 'true'
            },
        });

        // Act
        await handler(req);

        // Assert
        assertSpyCall(handlePostRequestSpy, 0);
        const passedDeps = handlePostRequestSpy.calls[0].args[3];
        
        const adapter = passedDeps.getAiProviderAdapter({
            provider: openAiProvider,
            apiKey: 'test-key',
            logger: defaultDeps.logger,
            providerMap: defaultProviderMap, // The injected function should ignore this and use the test map
        });

        assertInstanceOf(adapter, DummyAdapter, "The injected getAiProviderAdapter should have returned a DummyAdapter for a real provider");
    });
});
