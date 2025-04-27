import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import { spy, type Spy, assertSpyCall, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the handler and dependency types from the refactored index.ts
import { mainHandler, type AiProvidersHandlerDeps, defaultDeps as realDefaultDeps } from './index.ts';

// --- Mock Data ---
const mockSupabaseUrl = 'http://localhost:54321'; // Needed for client creation check
const mockAnonKey = 'test-anon-key';
const mockOpenAiKey = 'test-openai-key';
const mockAnthropicKey = 'test-anthropic-key';
const mockGoogleKey = 'test-google-key';

// Sample provider data from DB - now including is_enabled
const mockDbProviders = [
    { id: '1', name: 'OpenAI GPT-4o', description: 'Test OpenAI', api_identifier: 'openai-gpt-4o', provider: 'openai', is_active: true, is_enabled: true }, // Active, Enabled, Key Set
    { id: '2', name: 'Anthropic Claude 3', description: 'Test Anthropic', api_identifier: 'claude-3-opus', provider: 'anthropic', is_active: true, is_enabled: false }, // Active, DISABLED
    { id: '3', name: 'Google Gemini Pro', description: 'Test Google', api_identifier: 'gemini-pro', provider: 'google', is_active: true, is_enabled: true }, // Active, Enabled, Key Set
    { id: '4', name: 'Unknown Provider Model', description: 'Test Unknown', api_identifier: 'unknown-model', provider: 'some_unknown_provider', is_active: true, is_enabled: true }, // Active, Enabled, Unknown Provider
    { id: '5', name: 'OpenAI GPT-3.5', description: 'Test OpenAI 2', api_identifier: 'openai-gpt-3.5-turbo', provider: 'openai', is_active: true, is_enabled: true }, // Active, Enabled, Key Set
    { id: '6', name: 'Provider Without Key', description: 'No Key Test', api_identifier: 'no-key-model', provider: 'openai', is_active: true, is_enabled: true }, // Active, Enabled, Key MAYBE Set
    { id: '7', name: 'Provider With Null String', description: 'Null String', api_identifier: 'null-string-model', provider: null, is_active: true, is_enabled: true }, // Active, Enabled, Null Provider
    { id: '8', name: 'Inactive Enabled Google', description: 'Inactive Google', api_identifier: 'gemini-inactive', provider: 'google', is_active: false, is_enabled: true }, // INACTIVE, Enabled
    { id: '9', name: 'Inactive Disabled OpenAI', description: 'Inactive OpenAI', api_identifier: 'openai-inactive', provider: 'openai', is_active: false, is_enabled: false }, // INACTIVE, DISABLED
];

// --- Mock Setup ---

// Helper to create a mock Supabase Client specifically for this function
const createMockSupaClientForProviders = (providersData: any[] | null, error: Error | null = null): SupabaseClient => {
    let filters: { column: string; value: any }[] = [];

    const mockQueryBuilder: any = {
        eq: spy((column: string, value: any) => {
            filters.push({ column, value });
            return mockQueryBuilder; // Return self for chaining
        }),
        select: spy(() => mockQueryBuilder),
        // Mock the promise-like behavior for await
        then: spy((resolve: (result: { data: any[] | null, error: Error | null }) => void) => {
            // Apply filters before resolving
            let filteredData = providersData;
            if (providersData && !error) {
                filteredData = providersData.filter(row => 
                    filters.every(filter => row[filter.column] === filter.value)
                );
            }
            Promise.resolve().then(() => resolve({ data: filteredData, error }));
        }),
    };
    // Simulate the await directly on the query builder returning the result
    (mockQueryBuilder as any)[Symbol.asyncIterator] = async function*() {
        // Apply filters before yielding
        let filteredData = providersData;
        if (providersData && !error) {
            filteredData = providersData.filter(row => 
                filters.every(filter => row[filter.column] === filter.value)
            );
        }
        yield { data: filteredData, error };
    };

    const mockClient: Partial<SupabaseClient> = {
        from: spy((tableName: string) => {
            assertEquals(tableName, 'ai_providers');
            filters = []; // Reset filters for each new query chain
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

    // Return the deps object, overriding necessary functions and spying on others
    return {
        // Explicitly wrap the real response helpers with spies
        handleCorsPreflightRequest: spy(realDefaultDeps.handleCorsPreflightRequest), 
        createJsonResponse: spy(realDefaultDeps.createJsonResponse), 
        createErrorResponse: spy(realDefaultDeps.createErrorResponse), 
        // Mock client creation
        createSupabaseClient: spy(() => mockSupabaseClient) as any, 
        // Mock environment variable access
        getEnv: mockGetEnv, 
    };
};

// --- Test Suite ---
Deno.test("ai-providers Function Tests", async (t) => {

    // No global setup/teardown needed as deps are created per test

    await t.step("OPTIONS request should return CORS headers", async () => {
        const deps = createTestDeps({ data: [], error: null }, {}); // Minimal deps needed
        const req = new Request('http://localhost/ai-providers', { 
            method: 'OPTIONS', 
            headers: { 'Origin': 'http://localhost:5173' } 
        });
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
        assertEquals((await response.json()).error, 'Method Not Allowed');
    });

    await t.step("GET Success - All Keys Set: Returns ONLY known, active, enabled providers", async () => {
        const envVars = {
            SUPABASE_URL: mockSupabaseUrl, 
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey,
            ANTHROPIC_API_KEY: mockAnthropicKey, // Key set, but model 2 is disabled
            GOOGLE_API_KEY: mockGoogleKey,
        };
        // Provide the full mock data, the function should filter it
        const dbResponse = { data: [...mockDbProviders], error: null };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 200);
        const body = await response.json();

        assertExists(body.providers);
        // Expecting models 1, 3, 5, 6 (Active=true, Enabled=true, Known Provider, Key Set)
        assertEquals(body.providers.length, 4, `Expected 4 providers, got ${body.providers.length}`); 
        assert(body.providers.some((p: any) => p.id === '1')); // OpenAI GPT-4o
        assert(body.providers.some((p: any) => p.id === '3')); // Google Gemini Pro
        assert(body.providers.some((p: any) => p.id === '5')); // OpenAI GPT-3.5
        assert(body.providers.some((p: any) => p.id === '6')); // OpenAI NoKey Model

        // Explicitly check excluded ones:
        assert(!body.providers.some((p: any) => p.id === '2'), "Provider ID 2 (Anthropic disabled) should be filtered");
        assert(!body.providers.some((p: any) => p.id === '4'), "Provider ID 4 (unknown string) should be filtered");
        assert(!body.providers.some((p: any) => p.id === '7'), "Provider ID 7 (null string) should be filtered");
        assert(!body.providers.some((p: any) => p.id === '8'), "Provider ID 8 (inactive) should be filtered");
        assert(!body.providers.some((p: any) => p.id === '9'), "Provider ID 9 (inactive) should be filtered");

        // Verify the .eq() calls on the mock client
        const mockClient = deps.createSupabaseClient(mockSupabaseUrl, mockAnonKey);
        const fromSpy = mockClient.from as Spy;
        assertSpyCalls(fromSpy, 1);
        const eqSpy = fromSpy.calls[0].returned.eq as Spy;
        assertSpyCalls(eqSpy, 2);
        assertSpyCall(eqSpy, 0, { args: ['is_active', true] });
        assertSpyCall(eqSpy, 1, { args: ['is_enabled', true] });

        // Verify getEnv was called for the relevant keys
        const getEnvSpy = deps.getEnv as Spy<any>;
        // Expected calls for: SUPABASE_URL, SUPABASE_ANON_KEY, + 4 returned providers (1,3,5,6)
        assertSpyCalls(getEnvSpy, 6); 
        assert(getEnvSpy.calls.some(call => call.args[0] === 'OPENAI_API_KEY'));
        assert(getEnvSpy.calls.some(call => call.args[0] === 'GOOGLE_API_KEY'));
        // ANTHROPIC_API_KEY should NOT be checked as model 2 was filtered by is_enabled=false
    });

    await t.step("GET Filtering - Only OpenAI Key Set: Returns active, enabled OpenAI providers", async () => {
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
        // Expecting models 1, 5, 6 (Active=true, Enabled=true, Provider=openai, Key Set)
        assertEquals(body.providers.length, 3); 
        assert(body.providers.every((p: any) => p.provider === 'openai'));
        assert(body.providers.some((p: any) => p.id === '1'));
        assert(body.providers.some((p: any) => p.id === '5'));
        assert(body.providers.some((p: any) => p.id === '6'));

        // Verify .eq calls
        const mockClient = deps.createSupabaseClient(mockSupabaseUrl, mockAnonKey);
        const eqSpy = (mockClient.from as Spy).calls[0].returned.eq as Spy;
        assertSpyCalls(eqSpy, 2);
        assertSpyCall(eqSpy, 0, { args: ['is_active', true] });
        assertSpyCall(eqSpy, 1, { args: ['is_enabled', true] });
    });

    await t.step("GET Filtering - Only Anthropic Key Set: Returns empty (model 2 disabled)", async () => {
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
        assertEquals(body.providers.length, 0); // Model 2 is is_enabled: false

        // Verify .eq calls
        const mockClient = deps.createSupabaseClient(mockSupabaseUrl, mockAnonKey);
        const eqSpy = (mockClient.from as Spy).calls[0].returned.eq as Spy;
        assertSpyCalls(eqSpy, 2);
        assertSpyCall(eqSpy, 0, { args: ['is_active', true] });
        assertSpyCall(eqSpy, 1, { args: ['is_enabled', true] });
    });

    await t.step("GET Filtering - Only Google Key Set: Returns active, enabled Google providers", async () => {
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
        // Expecting model 3 (Active=true, Enabled=true, Provider=google, Key Set)
        assertEquals(body.providers.length, 1);
        assertEquals(body.providers[0].id, '3');
        assertEquals(body.providers[0].provider, 'google');

        // Verify .eq calls
        const mockClient = deps.createSupabaseClient(mockSupabaseUrl, mockAnonKey);
        const eqSpy = (mockClient.from as Spy).calls[0].returned.eq as Spy;
        assertSpyCalls(eqSpy, 2);
        assertSpyCall(eqSpy, 0, { args: ['is_active', true] });
        assertSpyCall(eqSpy, 1, { args: ['is_enabled', true] });
    });

    await t.step("GET Filtering - OpenAI + Google Keys Set: Returns corresponding active, enabled providers", async () => {
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
        // Expecting models 1, 5, 6 (OpenAI) + 3 (Google) = 4
        assertEquals(body.providers.length, 4); 
        assert(body.providers.filter((p: any) => p.provider === 'openai').length === 3);
        assert(body.providers.filter((p: any) => p.provider === 'google').length === 1);
        assert(body.providers.filter((p: any) => p.provider === 'anthropic').length === 0);

        // Verify .eq calls
        const mockClient = deps.createSupabaseClient(mockSupabaseUrl, mockAnonKey);
        const eqSpy = (mockClient.from as Spy).calls[0].returned.eq as Spy;
        assertSpyCalls(eqSpy, 2);
        assertSpyCall(eqSpy, 0, { args: ['is_active', true] });
        assertSpyCall(eqSpy, 1, { args: ['is_enabled', true] });
    });

    await t.step("GET Filtering - No Keys Set: Returns empty list (as before)", async () => {
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

        // Verify .eq calls
        const mockClient = deps.createSupabaseClient(mockSupabaseUrl, mockAnonKey);
        const eqSpy = (mockClient.from as Spy).calls[0].returned.eq as Spy;
        assertSpyCalls(eqSpy, 2);
        assertSpyCall(eqSpy, 0, { args: ['is_active', true] });
        assertSpyCall(eqSpy, 1, { args: ['is_enabled', true] });
    });

    await t.step("GET DB Error: Returns 500 (as before)", async () => {
        const envVars = { 
            SUPABASE_URL: mockSupabaseUrl, 
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey 
        };
        const dbError = new Error("Simulated DB connection failed");
        const dbResponse = { data: null, error: dbError };
        const deps = createTestDeps(dbResponse, envVars);

        const req = new Request('http://localhost/ai-providers', { method: 'GET' });
        const response = await mainHandler(req, deps);
        assertEquals(response.status, 500);
        const body = await response.json();
        assertEquals(body.error, dbError.message);

        // Verify .eq calls were made before error
        const mockClient = deps.createSupabaseClient(mockSupabaseUrl, mockAnonKey);
        const fromSpy = mockClient.from as Spy;
        assertSpyCalls(fromSpy, 1);
        const eqSpy = fromSpy.calls[0].returned.eq as Spy;
        assertSpyCalls(eqSpy, 2);
        assertSpyCall(eqSpy, 0, { args: ['is_active', true] });
        assertSpyCall(eqSpy, 1, { args: ['is_enabled', true] });
    });

    // Add more tests? e.g., RLS failure (if applicable)
}); 