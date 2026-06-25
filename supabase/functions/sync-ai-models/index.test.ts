// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the function to test, deps interface, and type
import { mainHandler } from "./index.ts"; 
import { DbAiProvider, SyncAiModelsDeps, SyncResult, defaultDeps } from "./sync-ai-models.interface.ts";
// Import the actual default deps to partially mock them
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { syncOpenAIModels, type SyncOpenAIDeps } from "./openai_sync.ts";
import { syncAnthropicModels, type SyncAnthropicDeps } from "./anthropic_sync.ts";
import { syncGoogleModels, type SyncGoogleDeps } from "./google_sync.ts";

// Helper to create mock dependencies for the main handler
const createMockMainHandlerDeps = (overrides: Partial<SyncAiModelsDeps> = {}) => {
    const mockProviderSync = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'mock', inserted: 1, updated: 0, deactivated: 0 }));
    const mockJsonResponse = spy((_body: unknown, _status: number | undefined, _request: Request, _headers?: Record<string, string>) => new Response(JSON.stringify(_body), { status: _status ?? 200 }));
    const mockErrorResponse = spy((_message: string, _status: number | undefined, _request: Request, _error?: unknown, _headers?: Record<string, string>) => new Response(_message, { status: _status ?? 500 }));
    const mockHandleCors = spy((_req: Request): Response | null => null);
    const mockGetEnv = spy((key: string) => defaultDeps.getEnv(key));
    const mockCreateClient = spy((_url: string, _key: string) => ({}) as SupabaseClient);

    const deps: SyncAiModelsDeps = {
        createSupabaseClient: mockCreateClient,
        getEnv: mockGetEnv,
        handleCorsPreflightRequest: mockHandleCors,
        createJsonResponse: mockJsonResponse,
        createErrorResponse: mockErrorResponse,
        doOpenAiSync: mockProviderSync,
        doAnthropicSync: mockProviderSync,
        doGoogleSync: mockProviderSync,
        ...overrides,
    };

    return { deps, errorSpy: mockErrorResponse, jsonSpy: mockJsonResponse, corsSpy: mockHandleCors, envSpy: mockGetEnv, clientSpy: mockCreateClient, providerSpy: mockProviderSync };
};

// --- Test Suite ---

Deno.test("sync-ai-models mainHandler", { 
    sanitizeOps: false, 
    sanitizeResources: false, // Env var access might require this
}, async (t) => {

    // --- Authorization Tests ---
    await t.step("should return 401 if SYNC_SECRET is set and header is missing", async () => {
        const mockSecret = "test-secret";
        const { deps: mockDeps, errorSpy, providerSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => key === 'SYNC_SECRET' ? mockSecret : undefined),
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 401);
        assertSpyCalls(errorSpy, 1);
        assertEquals(errorSpy.calls[0].args[0], "Unauthorized");
        assertEquals(errorSpy.calls[0].args[1], 401);
        assertSpyCalls(providerSpy, 0);
    });

    await t.step("should return 401 if SYNC_SECRET is set and header is incorrect", async () => {
        const mockSecret = "test-secret";
        const { deps: mockDeps, errorSpy, providerSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => key === 'SYNC_SECRET' ? mockSecret : undefined),
        });
        const request = new Request("http://localhost/sync-ai-models", { 
            method: "POST", 
            headers: { 'X-Sync-Secret': 'wrong-secret' }
        });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 401);
        assertSpyCalls(errorSpy, 1);
        assertEquals(errorSpy.calls[0].args[0], "Unauthorized");
        assertEquals(errorSpy.calls[0].args[1], 401);
        assertSpyCalls(providerSpy, 0);
    });

    await t.step("should return 200 if SYNC_SECRET is set and header is correct", async () => {
        const mockSecret = "test-secret";
        const openAiSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'openai', inserted: 0, updated: 0, deactivated: 0 }));
        const anthropicSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'anthropic', inserted: 0, updated: 0, deactivated: 0 }));
        const googleSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'google', inserted: 0, updated: 0, deactivated: 0 }));
        const { deps: mockDeps, jsonSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => {
                if (key === 'SYNC_SECRET') return mockSecret;
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined;
            }),
            doOpenAiSync: openAiSpy,
            doAnthropicSync: anthropicSpy,
            doGoogleSync: googleSpy,
        });
        const request = new Request("http://localhost/sync-ai-models", { 
            method: "POST", 
            headers: { 'X-Sync-Secret': mockSecret }
        });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 500);
        assertSpyCall(jsonSpy, 0);
        assertSpyCalls(openAiSpy, 0);
        assertSpyCalls(anthropicSpy, 0);
        assertSpyCalls(googleSpy, 0);
    });

    await t.step("should return 200 if SYNC_SECRET is NOT set", async () => {
        const openAiSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'openai', inserted: 0, updated: 0, deactivated: 0 }));
        const anthropicSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'anthropic', inserted: 0, updated: 0, deactivated: 0 }));
        const googleSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'google', inserted: 0, updated: 0, deactivated: 0 }));
        const { deps: mockDeps, jsonSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => {
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined;
            }),
            doOpenAiSync: openAiSpy,
            doAnthropicSync: anthropicSpy,
            doGoogleSync: googleSpy,
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 500);
        assertSpyCall(jsonSpy, 0);
    });

    // --- Method Check --- 
     await t.step("should return 405 for non-POST requests", async () => {
        const { deps: mockDeps, errorSpy, providerSpy } = createMockMainHandlerDeps();
        const request = new Request("http://localhost/sync-ai-models", { method: "GET" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 405);
        assertSpyCalls(errorSpy, 1);
        assertEquals(errorSpy.calls[0].args[0], "Method Not Allowed");
        assertEquals(errorSpy.calls[0].args[1], 405);
        assertSpyCalls(providerSpy, 0);
    });

    // --- CORS Preflight --- 
    await t.step("should handle CORS preflight request", async () => {
        const mockCorsResponse = new Response(null, { status: 204 });
        const corsSpy = spy((_req: Request): Response | null => mockCorsResponse);
        const { deps: mockDeps, errorSpy, jsonSpy, providerSpy } = createMockMainHandlerDeps({
            handleCorsPreflightRequest: corsSpy,
        }); 
        const request = new Request("http://localhost/sync-ai-models", { method: "OPTIONS" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response, mockCorsResponse);
        assertSpyCall(corsSpy, 0);
        assertSpyCalls(errorSpy, 0);
        assertSpyCalls(jsonSpy, 0);
        assertSpyCalls(providerSpy, 0);
    });

    // --- Sync Orchestration Tests (runAllSyncs logic called by mainHandler) ---
    await t.step("should call only sync functions with available API keys", async () => {
        const openAiSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'openai', inserted: 1, updated: 0, deactivated: 0 }));
        const anthropicSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'anthropic', inserted: 0, updated: 0, deactivated: 0 }));
        const googleSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'google', inserted: 1, updated: 0, deactivated: 0 }));
        const { deps: mockDeps, clientSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => {
                if (key === 'OPENAI_API_KEY') return 'openai-key';
                if (key === 'GOOGLE_API_KEY') return 'google-key';
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined;
            }),
            doOpenAiSync: openAiSpy,
            doAnthropicSync: anthropicSpy,
            doGoogleSync: googleSpy,
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);
        const body = await response.json();

        assertEquals(response.status, 500);
        assertSpyCall(clientSpy, 0);
        assertSpyCall(openAiSpy, 0, { args: [{} as unknown as SupabaseClient, 'openai-key'] });
        assertSpyCall(googleSpy, 0, { args: [{} as unknown as SupabaseClient, 'google-key'] });
        assertSpyCalls(anthropicSpy, 0);

        assertEquals(body.success, false);
        assertEquals(body.results.length, 3);
        const openaiResult = body.results.find((r: SyncResult) => r.provider === 'openai');
        const googleResult = body.results.find((r: SyncResult) => r.provider === 'google');
        const anthropicResult = body.results.find((r: SyncResult) => r.provider === 'anthropic');
        assertEquals(openaiResult?.inserted, 1);
        assertEquals(googleResult?.inserted, 1);
        assertEquals(anthropicResult?.error, 'API key not configured');
    });

    await t.step("should handle errors from individual sync functions and return 500 if any fail", async () => {
        const googleError = new Error("Google sync failed!");
        const openAiSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'openai', inserted: 1, updated: 0, deactivated: 0 }));
        const googleSpy = spy((_client: SupabaseClient, _key: string): Promise<SyncResult> => Promise.reject(googleError));
        const anthropicSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'anthropic', inserted: 1, updated: 0, deactivated: 0 }));
        const { deps: mockDeps, jsonSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => {
                if (key === 'OPENAI_API_KEY') return 'openai-key';
                if (key === 'GOOGLE_API_KEY') return 'google-key';
                if (key === 'ANTHROPIC_API_KEY') return 'anthropic-key';
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined;
            }),
            doOpenAiSync: openAiSpy,
            doGoogleSync: googleSpy,
            doAnthropicSync: anthropicSpy,
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);
        const body = await response.json();

        assertEquals(response.status, 500);
        assertSpyCall(jsonSpy, 0);

        assertSpyCall(openAiSpy, 0);
        assertSpyCall(googleSpy, 0);
        assertSpyCall(anthropicSpy, 0);

        assertEquals(body.success, false);
        assertEquals(body.results.length, 3);
        const openaiResult = body.results.find((r: SyncResult) => r.provider === 'openai');
        const googleResult = body.results.find((r: SyncResult) => r.provider === 'google');
        const anthropicResult = body.results.find((r: SyncResult) => r.provider === 'anthropic');
        assertEquals(openaiResult?.inserted, 1);
        assertEquals(openaiResult?.error, undefined);
        assertEquals(googleResult?.error, googleError.message);
        assertEquals(anthropicResult?.inserted, 1);
        assertEquals(anthropicResult?.error, undefined);
    });

     await t.step("should handle Supabase client creation failure", async () => {
        const clientError = new Error("Invalid Supabase keys");
        const throwClientSpy = spy((_url: string, _key: string): SupabaseClient => { throw clientError; });
        const { deps: mockDeps, errorSpy, providerSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => {
                if (key === 'OPENAI_API_KEY') return 'openai-key';
                return undefined;
            }),
            createSupabaseClient: throwClientSpy,
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 500);
        assertSpyCall(errorSpy, 0);
        assertStringIncludes(errorSpy.calls[0].args[0], "Server configuration error");
        assertSpyCalls(throwClientSpy, 0);
        assertSpyCalls(providerSpy, 0);
    });

    // --- NEW: All Success Scenario ---
    await t.step("should return 200 OK and success:true if all providers sync successfully", async () => {
        const openAiSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'openai', inserted: 2, updated: 1, deactivated: 0 }));
        const anthropicSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'anthropic', inserted: 3, updated: 0, deactivated: 1 }));
        const googleSpy = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'google', inserted: 1, updated: 1, deactivated: 1 }));
        const { deps: mockDeps, jsonSpy, clientSpy } = createMockMainHandlerDeps({
            getEnv: spy((key: string) => {
                if (key === 'OPENAI_API_KEY') return 'openai-key';
                if (key === 'GOOGLE_API_KEY') return 'google-key';
                if (key === 'ANTHROPIC_API_KEY') return 'anthropic-key';
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined;
            }),
            doOpenAiSync: openAiSpy,
            doAnthropicSync: anthropicSpy,
            doGoogleSync: googleSpy,
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertSpyCall(jsonSpy, 0);

        assertSpyCall(clientSpy, 0);
        assertSpyCall(openAiSpy, 0);
        assertSpyCall(anthropicSpy, 0);
        assertSpyCall(googleSpy, 0);

        assertEquals(body.success, true);
        assertEquals(body.results.length, 3);

        const openaiResult = body.results.find((r: SyncResult) => r.provider === 'openai');
        const googleResult = body.results.find((r: SyncResult) => r.provider === 'google');
        const anthropicResult = body.results.find((r: SyncResult) => r.provider === 'anthropic');
        assertEquals(openaiResult?.inserted, 2);
        assertEquals(anthropicResult?.inserted, 3);
        assertEquals(googleResult?.inserted, 1);
        assertEquals(openaiResult?.error, undefined);
        assertEquals(anthropicResult?.error, undefined);
        assertEquals(googleResult?.error, undefined);
    });

}); // End Deno.test suite

// NEW: Adaptive floors integration across providers
Deno.test("adaptive provider floors are applied for unknown models (OpenAI/Anthropic/Google)", async () => {
  // Anthropic unknown -> >= 200k
  {
    const { client: mockClient, spies } = createMockSupabaseClient();
    const deps: SyncAnthropicDeps = {
      listProviderModels: async () => ({ models: [{ api_identifier: 'anthropic-claude-4-foo-20260101', name: 'Claude Unknown' }], raw: {} }),
      getCurrentDbModels: async () => [],
      log: () => {},
      error: () => {},
    };
    await syncAnthropicModels(mockClient as unknown as SupabaseClient, 'key', deps);
    const insertSpy = spies.fromSpy.calls[0]?.returned.insert;
    const insertArgs = insertSpy?.calls[0]?.args?.[0];
    if (!insertArgs || insertArgs.length === 0) throw new Error('No insert captured for Anthropic test');
    const cfg = insertArgs[0].config;
    if (typeof cfg.context_window_tokens !== 'number' || typeof cfg.provider_max_input_tokens !== 'number') throw new Error('Missing window fields');
    assert(cfg.context_window_tokens >= 200_000 && cfg.provider_max_input_tokens >= 200_000);
  }

  // Google unknown -> >= 1,048,576
  {
    const { client: mockClient, spies } = createMockSupabaseClient();
    const deps: SyncGoogleDeps = {
      listProviderModels: async () => ({ models: [{ api_identifier: 'google-gemini-99-foo', name: 'Gemini Unknown' }], raw: {} }),
      getCurrentDbModels: async () => [],
      log: () => {},
      error: () => {},
    };
    await syncGoogleModels(mockClient as unknown as SupabaseClient, 'key', deps);
    const insertSpy = spies.fromSpy.calls[0]?.returned.insert;
    const insertArgs = insertSpy?.calls[0]?.args?.[0];
    if (!insertArgs || insertArgs.length === 0) throw new Error('No insert captured for Google test');
    const cfg = insertArgs[0].config;
    if (typeof cfg.context_window_tokens !== 'number' || typeof cfg.provider_max_input_tokens !== 'number') throw new Error('Missing window fields');
    assert(cfg.context_window_tokens >= 1_048_576 && cfg.provider_max_input_tokens >= 1_048_576);
  }

  // OpenAI unknowns -> 4.1 >= 1,047,576; 4o >= 128,000
  {
    const { client: mockClient, spies } = createMockSupabaseClient();
    const deps: SyncOpenAIDeps = {
      listProviderModels: async () => ({ models: [
        { api_identifier: 'openai-gpt-4.1-foo', name: 'OpenAI 4.1 Unknown' },
        { api_identifier: 'openai-gpt-4o-foo', name: 'OpenAI 4o Unknown' },
      ], raw: {} }),
      getCurrentDbModels: async () => [],
      log: () => {},
      error: () => {},
    };
    await syncOpenAIModels(mockClient as unknown as SupabaseClient, 'key', deps);
    const insertSpy = spies.fromSpy.calls[0]?.returned.insert;
    const insertArgs = insertSpy?.calls[0]?.args?.[0];
    if (!insertArgs || insertArgs.length < 2) throw new Error('No insert captured for OpenAI test');
    const m41 = insertArgs.find((r: DbAiProvider) => r.api_identifier === 'openai-gpt-4.1-foo');
    const m4o = insertArgs.find((r: DbAiProvider) => r.api_identifier === 'openai-gpt-4o-foo');
    if (!m41 || !m4o) throw new Error('Missing 4.1 or 4o rows');
    assert(typeof m41.config.provider_max_input_tokens === 'number' && m41.config.provider_max_input_tokens >= 1_047_576);
    assert(typeof m41.config.context_window_tokens === 'number' && m41.config.context_window_tokens >= 1_047_576);
    assert(typeof m4o.config.provider_max_input_tokens === 'number' && m4o.config.provider_max_input_tokens >= 128_000);
    assert(typeof m4o.config.context_window_tokens === 'number' && m4o.config.context_window_tokens >= 128_000);
  }
});
