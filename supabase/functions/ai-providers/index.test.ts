import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, type Spy, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the handler and dependency types from the refactored index.ts
import { mainHandler, type AiProvidersHandlerDeps, defaultDeps as realDefaultDeps } from './index.ts';

// --- Mock Data ---
const mockSupabaseUrl = 'http://localhost:54321'; // Needed for client creation check
const mockAnonKey = 'test-anon-key';
const mockOpenAiKey = 'test-openai-key';
const mockAnthropicKey = 'test-anthropic-key';
const mockGoogleKey = 'test-google-key';

// Sample provider data from DB
const mockDbProviders = [
    { id: '1', name: 'OpenAI GPT-4o', description: 'Test OpenAI', api_identifier: 'openai-gpt-4o', provider: 'openai' },
    { id: '2', name: 'Anthropic Claude 3', description: 'Test Anthropic', api_identifier: 'claude-3-opus', provider: 'anthropic' },
    { id: '3', name: 'Google Gemini Pro', description: 'Test Google', api_identifier: 'gemini-pro', provider: 'google' },
    { id: '4', name: 'Unknown Provider Model', description: 'Test Unknown', api_identifier: 'unknown-model', provider: 'some_unknown_provider' }, // Unknown provider string
    { id: '5', name: 'OpenAI GPT-3.5', description: 'Test OpenAI 2', api_identifier: 'openai-gpt-3.5-turbo', provider: 'openai' }, // Another OpenAI model
    { id: '6', name: 'Provider Without Key', description: 'No Key Test', api_identifier: 'no-key-model', provider: 'openai' }, // This OpenAI model should be included if OPENAI_API_KEY is set
    { id: '7', name: 'Provider With Null String', description: 'Null String', api_identifier: 'null-string-model', provider: null }, // Provider string is null
];

// --- Mock Setup ---

// Helper to create a mock Supabase Client specifically for this function
const createMockSupaClientForProviders = (providersData: any[] | null, error: Error | null = null): SupabaseClient => {
    const mockQueryBuilder: any = {
        eq: spy(() => mockQueryBuilder),
        select: spy(() => mockQueryBuilder),
        // Mock the promise-like behavior for await
        then: spy((resolve: (result: { data: any[] | null, error: Error | null }) => void) => {
            Promise.resolve().then(() => resolve({ data: providersData, error }));
        }),
    };
    // Simulate the await directly on the query builder returning the result
    (mockQueryBuilder as any)[Symbol.asyncIterator] = async function*() {
        yield { data: providersData, error };
    };

    const mockClient: Partial<SupabaseClient> = {
        from: spy((tableName: string) => {
            assertEquals(tableName, 'ai_providers'); // Ensure only correct table is queried
            return mockQueryBuilder;
        }),
    };
    return mockClient as SupabaseClient;
};

// Helper to create mocked dependencies for a specific test case
const createTestDeps = (
    dbResult: { data: any[] | null; error: Error | null },
    envVars: Record<string, string | undefined>
): AiProvidersHandlerDeps => {

    const mockSupabaseClient = createMockSupaClientForProviders(dbResult.data, dbResult.error);
    const mockGetEnv = spy((key: string): string | undefined => envVars[key]);

    // Return the deps object, overriding only what's necessary for the test
    return {
        ...realDefaultDeps, // Start with real dependencies (like response creators)
        createSupabaseClient: spy(() => mockSupabaseClient) as any, // Mock client creation
        getEnv: mockGetEnv, // Mock environment variable access
    };
};

// --- Test Suite ---
Deno.test("ai-providers Function Tests", async (t) => {

    // No global setup/teardown needed as deps are created per test

    await t.step("OPTIONS request should return CORS headers", async () => {
        const deps = createTestDeps({ data: [], error: null }, {}); // Minimal deps needed
        const req = new Request('http://localhost/ai-providers', { method: 'OPTIONS' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 204); // Correct status for CORS preflight
        assertEquals(await response.text(), ''); // Expect empty body for 204 No Content
        assertExists(response.headers.get('Access-Control-Allow-Origin'));
        assertExists(response.headers.get('Access-Control-Allow-Headers'));
    });

    await t.step("POST request should return 405 Method Not Allowed", async () => {
        const deps = createTestDeps({ data: [], error: null }, {}); // Minimal deps needed
        const req = new Request('http://localhost/ai-providers', { method: 'POST' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 405);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, 'Method Not Allowed');
    });

    await t.step("GET Success - All Keys Set: Returns all known, filterable providers", async () => {
        const envVars = {
            SUPABASE_URL: mockSupabaseUrl, // Needed for client creation
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey,
            ANTHROPIC_API_KEY: mockAnthropicKey,
            GOOGLE_API_KEY: mockGoogleKey,
        };
        const dbResponse = { data: [...mockDbProviders], error: null };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        // Expecting 3 known (OpenAI, Anthropic, Google) + 2 extra OpenAI = 5 providers
        // IDs: 1, 2, 3, 5, 6 (all have known provider strings and keys set)
        assertEquals(body.providers.length, 5, `Expected 5 providers, got ${body.providers.length}`); 
        assert(body.providers.some((p: any) => p.id === '1')); // OpenAI
        assert(body.providers.some((p: any) => p.id === '2')); // Anthropic
        assert(body.providers.some((p: any) => p.id === '3')); // Google
        assert(body.providers.some((p: any) => p.id === '5')); // OpenAI
        assert(body.providers.some((p: any) => p.id === '6')); // OpenAI (key is set)
        // Ensure unknown/null provider ones are NOT present
        assert(!body.providers.some((p: any) => p.id === '4'), "Provider ID 4 (unknown string) should be filtered");
        assert(!body.providers.some((p: any) => p.id === '7'), "Provider ID 7 (null string) should be filtered");

        // Verify getEnv was called for the relevant keys
        const getEnvSpy = deps.getEnv as Spy<any>;
        // 5 provider checks (IDs 1,2,3,5,6) + 2 Supabase client checks = 7
        assertSpyCalls(getEnvSpy, 7); 
        assert(getEnvSpy.calls.some(call => call.args[0] === 'OPENAI_API_KEY'));
        assert(getEnvSpy.calls.some(call => call.args[0] === 'ANTHROPIC_API_KEY'));
        assert(getEnvSpy.calls.some(call => call.args[0] === 'GOOGLE_API_KEY'));
    });

    await t.step("GET Filtering - Only OpenAI Key Set: Returns only OpenAI providers", async () => {
        const envVars = {
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey,
            // ANTHROPIC & GOOGLE keys NOT set
        };
        const dbResponse = { data: [...mockDbProviders], error: null };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 3); // Expecting 3 OpenAI providers (IDs: 1, 5, 6)
        assert(body.providers.every((p: any) => p.provider === 'openai'));
        assert(body.providers.some((p: any) => p.id === '1'));
        assert(body.providers.some((p: any) => p.id === '5'));
        assert(body.providers.some((p: any) => p.id === '6'));
    });

    await t.step("GET Filtering - Only Anthropic Key Set: Returns only Anthropic providers", async () => {
        const envVars = { 
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            ANTHROPIC_API_KEY: mockAnthropicKey 
        };
        const dbResponse = { data: [...mockDbProviders], error: null };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 1);
        assertEquals(body.providers[0].id, '2');
        assertEquals(body.providers[0].provider, 'anthropic');
    });

    await t.step("GET Filtering - Only Google Key Set: Returns only Google providers", async () => {
         const envVars = { 
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            GOOGLE_API_KEY: mockGoogleKey 
        };
        const dbResponse = { data: [...mockDbProviders], error: null };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 1);
        assertEquals(body.providers[0].id, '3');
        assertEquals(body.providers[0].provider, 'google');
    });

    await t.step("GET Filtering - OpenAI + Google Keys Set: Returns corresponding providers", async () => {
        const envVars = {
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey,
            GOOGLE_API_KEY: mockGoogleKey,
            // ANTHROPIC_API_KEY is NOT set
        };
        const dbResponse = { data: [...mockDbProviders], error: null };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 4); // 3 OpenAI + 1 Google
        assert(body.providers.filter((p: any) => p.provider === 'openai').length === 3);
        assert(body.providers.filter((p: any) => p.provider === 'google').length === 1);
        assert(body.providers.filter((p: any) => p.provider === 'anthropic').length === 0);
    });

    await t.step("GET Filtering - No Keys Set: Returns empty list", async () => {
        const envVars = { 
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            // No provider keys set
        };
        const dbResponse = { data: [...mockDbProviders], error: null };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 0);
    });

     await t.step("GET Filtering - Unknown Provider String: Skips provider", async () => {
         // This is implicitly tested in the "All Keys Set" test where ID 4 is excluded.
         // Adding explicit check for clarity is good practice but redundant here.
         assert(true); // Placeholder assertion
     });

     await t.step("GET Filtering - Null Provider String: Skips provider", async () => {
        // This is implicitly tested in the "All Keys Set" test where ID 7 is excluded.
        assert(true); // Placeholder assertion
    });

    await t.step("GET DB Error: Returns 500", async () => {
        const envVars = { 
            SUPABASE_URL: mockSupabaseUrl, 
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey // Set a key just in case filter is reached before error
        };
        const dbError = new Error("Database connection failed");
        const dbResponse = { data: null, error: dbError };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        // Check the message property of the error object
        assertEquals((await response.json()).error.message, dbError.message);
    });

    await t.step("GET Empty DB Result: Returns empty list", async () => {
         const envVars = { 
            SUPABASE_URL: mockSupabaseUrl, 
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey // Set a key just in case
        };
        const dbResponse = { data: [], error: null }; // DB returns empty array
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 0);
    });
}); 