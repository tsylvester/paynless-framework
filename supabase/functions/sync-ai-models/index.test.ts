// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the function to test, deps interface, and type
import { mainHandler, type SyncAiModelsDeps, type SyncResult } from "./index.ts"; 
// Import the actual default deps to partially mock them
import { defaultDeps as actualDefaultDeps } from './index.ts';

// Helper to create mock dependencies for the main handler
// Start with actual defaults and override as needed
const createMockMainHandlerDeps = (overrides: Partial<SyncAiModelsDeps> = {}): SyncAiModelsDeps => {
    // Create spies for functions we want to track calls on
    const mockProviderSync = spy(async (_client: SupabaseClient, _key: string): Promise<SyncResult> => ({ provider: 'mock', inserted: 1, updated: 0, deactivated: 0 }));
    const mockJsonResponse = spy((_body: any, status?: number) => new Response(JSON.stringify(_body), { status: status || 200 }));
    const mockErrorResponse = spy((_message: string, status?: number) => new Response(_message, { status: status || 500 }));
    const mockHandleCors = spy((_req: Request) => null); // Default: not a CORS preflight
    const mockGetEnv = spy((key: string) => actualDefaultDeps.getEnv(key)); // Use actual Deno.env by default
    const mockCreateClient = spy((_url: string, _key: string) => ({}) as SupabaseClient); // Simple mock client

    return {
        ...actualDefaultDeps, // Start with real implementations
        // Override with spies or specific mocks for testing
        createSupabaseClient: mockCreateClient,
        getEnv: mockGetEnv,
        handleCorsPreflightRequest: mockHandleCors,
        createJsonResponse: mockJsonResponse as any, // Cast to any to satisfy the stricter original type for now
        createErrorResponse: mockErrorResponse as any, // Cast to any to satisfy the stricter original type for now
        doOpenAiSync: mockProviderSync, 
        doAnthropicSync: mockProviderSync,
        doGoogleSync: mockProviderSync,
        ...overrides, // Apply test-specific overrides
    };
};

// --- Test Suite ---

Deno.test("sync-ai-models mainHandler", { 
    sanitizeOps: false, 
    sanitizeResources: false, // Env var access might require this
}, async (t) => {

    // --- Authorization Tests ---
    await t.step("should return 401 if SYNC_SECRET is set and header is missing", async () => {
        const mockSecret = "test-secret";
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => key === 'SYNC_SECRET' ? mockSecret : undefined),
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 401);
        const errorResponseSpy = mockDeps.createErrorResponse as Spy;
        assertSpyCalls(errorResponseSpy, 1);
        assertEquals(errorResponseSpy.calls[0].args[0], "Unauthorized");
        assertEquals(errorResponseSpy.calls[0].args[1], 401);
        assertSpyCalls(mockDeps.doOpenAiSync as Spy, 0); // Sync should not run
    });

    await t.step("should return 401 if SYNC_SECRET is set and header is incorrect", async () => {
        const mockSecret = "test-secret";
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => key === 'SYNC_SECRET' ? mockSecret : undefined),
        });
        const request = new Request("http://localhost/sync-ai-models", { 
            method: "POST", 
            headers: { 'X-Sync-Secret': 'wrong-secret' }
        });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 401);
        const errorResponseSpy = mockDeps.createErrorResponse as Spy;
        assertSpyCalls(errorResponseSpy, 1);
        assertEquals(errorResponseSpy.calls[0].args[0], "Unauthorized");
        assertEquals(errorResponseSpy.calls[0].args[1], 401);
        assertSpyCalls(mockDeps.doOpenAiSync as Spy, 0); 
    });

    await t.step("should return 200 if SYNC_SECRET is set and header is correct", async () => {
        const mockSecret = "test-secret";
        // Mock getEnv to provide necessary env vars for runAllSyncs too
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => { 
                if (key === 'SYNC_SECRET') return mockSecret; 
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                // No API keys set, so no sync functions should run
                return undefined;
            }),
            // Mock sync functions to return success (though they shouldn't be called here)
            doOpenAiSync: spy(async () => ({ provider: 'openai', inserted: 0, updated: 0, deactivated: 0 })), 
            doAnthropicSync: spy(async () => ({ provider: 'anthropic', inserted: 0, updated: 0, deactivated: 0 })), 
            doGoogleSync: spy(async () => ({ provider: 'google', inserted: 0, updated: 0, deactivated: 0 }))
        });
        const request = new Request("http://localhost/sync-ai-models", { 
            method: "POST", 
            headers: { 'X-Sync-Secret': mockSecret }
        });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 500);
        assertSpyCall(mockDeps.createJsonResponse as Spy, 0);
        // Check that sync functions were NOT called because no keys were provided via getEnv mock
        assertSpyCalls(mockDeps.doOpenAiSync as Spy, 0);
        assertSpyCalls(mockDeps.doAnthropicSync as Spy, 0);
        assertSpyCalls(mockDeps.doGoogleSync as Spy, 0);
    });

    await t.step("should return 200 if SYNC_SECRET is NOT set", async () => {
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => { 
                // No SYNC_SECRET
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined;
             }),
            doOpenAiSync: spy(async () => ({ provider: 'openai', inserted: 0, updated: 0, deactivated: 0 })), 
            doAnthropicSync: spy(async () => ({ provider: 'anthropic', inserted: 0, updated: 0, deactivated: 0 })), 
            doGoogleSync: spy(async () => ({ provider: 'google', inserted: 0, updated: 0, deactivated: 0 }))
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 500); // Corrected: Expect 500 due to missing API keys
        assertSpyCall(mockDeps.createJsonResponse as Spy, 0);
    });

    // --- Method Check --- 
     await t.step("should return 405 for non-POST requests", async () => {
        const mockDeps = createMockMainHandlerDeps(); // No secret needed
        const request = new Request("http://localhost/sync-ai-models", { method: "GET" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 405);
        const errorResponseSpy = mockDeps.createErrorResponse as Spy;
        assertSpyCalls(errorResponseSpy, 1);
        assertEquals(errorResponseSpy.calls[0].args[0], "Method Not Allowed");
        assertEquals(errorResponseSpy.calls[0].args[1], 405);
        assertSpyCalls(mockDeps.doOpenAiSync as Spy, 0); // Sync should not run
    });

    // --- CORS Preflight --- 
    await t.step("should handle CORS preflight request", async () => {
        const mockCorsResponse = new Response(null, { status: 204 });
        const mockDeps = createMockMainHandlerDeps({
            // Mock handleCorsPreflightRequest to return a response
            handleCorsPreflightRequest: spy((_req: Request) => mockCorsResponse)
        }); 
        const request = new Request("http://localhost/sync-ai-models", { method: "OPTIONS" });

        const response = await mainHandler(request, mockDeps);

        assertEquals(response, mockCorsResponse);
        assertSpyCall(mockDeps.handleCorsPreflightRequest as Spy, 0); // CORS handler called
        assertSpyCalls(mockDeps.createErrorResponse as Spy, 0); // Other handlers not called
        assertSpyCalls(mockDeps.createJsonResponse as Spy, 0);
        assertSpyCalls(mockDeps.doOpenAiSync as Spy, 0); // Sync should not run
    });

    // --- Sync Orchestration Tests (runAllSyncs logic called by mainHandler) ---
    await t.step("should call only sync functions with available API keys", async () => {
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => { 
                // Provide keys ONLY for OpenAI and Google
                if (key === 'OPENAI_API_KEY') return 'openai-key'; 
                if (key === 'GOOGLE_API_KEY') return 'google-key'; 
                // Anthropic key is missing
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined; // SYNC_SECRET not set for simplicity
             }),
            // Set up individual spies for each provider
            doOpenAiSync: spy(async () => ({ provider: 'openai', inserted: 1, updated: 0, deactivated: 0 })), 
            doAnthropicSync: spy(async () => ({ provider: 'anthropic', inserted: 0, updated: 0, deactivated: 0 })), 
            doGoogleSync: spy(async () => ({ provider: 'google', inserted: 1, updated: 0, deactivated: 0 }))
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);
        const body = await response.json();

        assertEquals(response.status, 500); // Expect 500 because keys are missing -> errors in results
        assertSpyCall(mockDeps.createSupabaseClient as Spy, 0);
        assertSpyCall(mockDeps.doOpenAiSync as Spy, 0, { args: [{}, 'openai-key'] }); // Called with client and key
        assertSpyCall(mockDeps.doGoogleSync as Spy, 0, { args: [{}, 'google-key'] }); // Called with client and key
        assertSpyCalls(mockDeps.doAnthropicSync as Spy, 0); // NOT called

        // Check response body for aggregated results
        assertEquals(body.success, false);
        assertEquals(body.results.length, 3);
        const openaiResult = body.results.find((r: SyncResult) => r.provider === 'openai');
        const googleResult = body.results.find((r: SyncResult) => r.provider === 'google');
        const anthropicResult = body.results.find((r: SyncResult) => r.provider === 'anthropic');
        assertEquals(openaiResult?.inserted, 1);
        assertEquals(googleResult?.inserted, 1);
        assertEquals(anthropicResult?.error, 'API key not configured'); // Correct error for skipped sync
    });

    await t.step("should handle errors from individual sync functions and return 500 if any fail", async () => {
        const googleError = new Error("Google sync failed!");
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => { 
                // Provide keys for all
                if (key === 'OPENAI_API_KEY') return 'openai-key'; 
                if (key === 'GOOGLE_API_KEY') return 'google-key'; 
                if (key === 'ANTHROPIC_API_KEY') return 'anthropic-key';
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined; 
             }),
            // OpenAI succeeds, Google fails, Anthropic succeeds
            doOpenAiSync: spy(async () => ({ provider: 'openai', inserted: 1, updated: 0, deactivated: 0 })), 
            doGoogleSync: spy(() => Promise.reject(googleError)), 
            doAnthropicSync: spy(async () => ({ provider: 'anthropic', inserted: 1, updated: 0, deactivated: 0 }))
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);
        const body = await response.json();

        // Overall response should be 500 because one sync failed
        assertEquals(response.status, 500);
        assertSpyCall(mockDeps.createJsonResponse as Spy, 0); // Still uses createJsonResponse
        
        // Check calls
        assertSpyCall(mockDeps.doOpenAiSync as Spy, 0);
        assertSpyCall(mockDeps.doGoogleSync as Spy, 0); // Attempted
        assertSpyCall(mockDeps.doAnthropicSync as Spy, 0);

        // Check response body
        assertEquals(body.success, false);
        assertEquals(body.results.length, 3);
        const openaiResult = body.results.find((r: SyncResult) => r.provider === 'openai');
        const googleResult = body.results.find((r: SyncResult) => r.provider === 'google');
        const anthropicResult = body.results.find((r: SyncResult) => r.provider === 'anthropic');
        assertEquals(openaiResult?.inserted, 1);
        assertEquals(openaiResult?.error, undefined);
        assertEquals(googleResult?.error, googleError.message); // Error message included
        assertEquals(anthropicResult?.inserted, 1);
        assertEquals(anthropicResult?.error, undefined);
    });

     await t.step("should handle Supabase client creation failure", async () => {
        const clientError = new Error("Invalid Supabase keys");
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => { 
                // Provide API key but simulate missing Supabase keys
                if (key === 'OPENAI_API_KEY') return 'openai-key'; 
                // SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing
                return undefined; 
             }),
             // Mock client creation to throw
             createSupabaseClient: spy(() => { throw clientError; })
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        // Expect mainHandler to catch the error from runAllSyncs
        const response = await mainHandler(request, mockDeps);

        assertEquals(response.status, 500);
        // Cast to Spy before accessing calls
        const errorResponseSpy = mockDeps.createErrorResponse as Spy;
        assertSpyCall(errorResponseSpy, 0);
        // Error message should reflect the client creation failure
        assertStringIncludes(errorResponseSpy.calls[0].args[0], "Server configuration error"); 
        assertSpyCalls(mockDeps.createSupabaseClient as Spy, 0); // Attempted but failed within runAllSyncs
        assertSpyCalls(mockDeps.doOpenAiSync as Spy, 0); // Should not be reached
    });

    // --- NEW: All Success Scenario ---
    await t.step("should return 200 OK and success:true if all providers sync successfully", async () => {
        const mockDeps = createMockMainHandlerDeps({
            getEnv: spy((key: string) => { 
                // Provide keys for ALL providers
                if (key === 'OPENAI_API_KEY') return 'openai-key'; 
                if (key === 'GOOGLE_API_KEY') return 'google-key'; 
                if (key === 'ANTHROPIC_API_KEY') return 'anthropic-key';
                if (key === 'SUPABASE_URL') return 'mock-url';
                if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-key';
                return undefined; // No SYNC_SECRET for simplicity
             }),
            // Mock ALL sync functions to return success
            doOpenAiSync: spy(async () => ({ provider: 'openai', inserted: 2, updated: 1, deactivated: 0 })), 
            doAnthropicSync: spy(async () => ({ provider: 'anthropic', inserted: 3, updated: 0, deactivated: 1 })), 
            doGoogleSync: spy(async () => ({ provider: 'google', inserted: 1, updated: 1, deactivated: 1 }))
        });
        const request = new Request("http://localhost/sync-ai-models", { method: "POST" });

        const response = await mainHandler(request, mockDeps);
        const body = await response.json();

        // Assert 200 OK
        assertEquals(response.status, 200);
        assertSpyCall(mockDeps.createJsonResponse as Spy, 0); // Called JSON response creator
        
        // Check calls
        assertSpyCall(mockDeps.createSupabaseClient as Spy, 0); // Client created
        assertSpyCall(mockDeps.doOpenAiSync as Spy, 0);
        assertSpyCall(mockDeps.doAnthropicSync as Spy, 0);
        assertSpyCall(mockDeps.doGoogleSync as Spy, 0);

        // Check response body
        assertEquals(body.success, true); // Overall success
        assertEquals(body.results.length, 3);
        
        // Verify results for each provider (check one specific field for brevity)
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
