import {
    assertEquals,
    assert,
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
import type { ChatHandlerDeps } from "../_shared/types.ts";

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
        const mockAdapter = createMockAiAdapter(ChatTestConstants.mockAdapterSuccessResponse);
        const { handler } = setup(
            mockSupaConfigBase,
            { getAiProviderAdapter: () => mockAdapter }
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
});
