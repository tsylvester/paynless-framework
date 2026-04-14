import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { assertSpyCall, assertSpyCalls, spy, type Spy } from "jsr:@std/testing@0.225.1/mock";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { defaultDeps, mainHandler, type AiProvidersHandlerDeps } from "./index.ts";
import {
    createMockSupabaseClient,
    type MockQueryBuilderState,
    type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";
import type { Tables } from "../types_db.ts";

const mockSupabaseUrl: string = "http://localhost:54321";
const mockAnonKey: string = "test-anon-key";
const mockOpenAiKey: string = "test-openai-key";
const mockAnthropicKey: string = "test-anthropic-key";
const mockGoogleKey: string = "test-google-key";
const mockUserId: string = "test-user-id";
const mockUserJwt: string = "test-user-jwt";
const mockTimestamp: string = "2026-04-14T00:00:00.000Z";

const mockDbProviders: Tables<"ai_providers">[] = [
    {
        id: "1",
        name: "OpenAI GPT-4o",
        description: "Test OpenAI",
        api_identifier: "openai-gpt-4o",
        provider: "openai",
        config: null,
        is_active: true,
        is_default_embedding: false,
        is_default_generation: true,
        is_enabled: true,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "2",
        name: "Anthropic Claude 3",
        description: "Test Anthropic",
        api_identifier: "claude-3-opus",
        provider: "anthropic",
        config: null,
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: false,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "3",
        name: "Google Gemini Pro",
        description: "Test Google",
        api_identifier: "gemini-pro",
        provider: "google",
        config: null,
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "4",
        name: "Unknown Provider Model",
        description: "Test Unknown",
        api_identifier: "unknown-model",
        provider: "some_unknown_provider",
        config: null,
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "5",
        name: "OpenAI GPT-3.5",
        description: "Test OpenAI 2",
        api_identifier: "openai-gpt-3.5-turbo",
        provider: "openai",
        config: null,
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "6",
        name: "Provider Without Key",
        description: "No Key Test",
        api_identifier: "no-key-model",
        provider: "openai",
        config: null,
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "7",
        name: "Provider With Null String",
        description: "Null String",
        api_identifier: "null-string-model",
        provider: null,
        config: null,
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "8",
        name: "Inactive Enabled Google",
        description: "Inactive Google",
        api_identifier: "gemini-inactive",
        provider: "google",
        config: null,
        is_active: false,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
    {
        id: "9",
        name: "Inactive Disabled OpenAI",
        description: "Inactive OpenAI",
        api_identifier: "openai-inactive",
        provider: "openai",
        config: null,
        is_active: false,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: false,
        created_at: mockTimestamp,
        updated_at: mockTimestamp,
    },
];

function matchesAiProviderFilters(
    providerRow: Tables<"ai_providers">,
    state: MockQueryBuilderState,
): boolean {
    return state.filters.every((filter) => {
        if (filter.type !== "eq" || !filter.column) {
            return true;
        }
        if (filter.column === "is_active") {
            return providerRow.is_active === filter.value;
        }
        if (filter.column === "is_enabled") {
            return providerRow.is_enabled === filter.value;
        }
        return true;
    });
}

function createUserScopedGetRequest(): Request {
    return new Request("http://localhost/ai-providers", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${mockUserJwt}`,
        },
    });
}

function assertUsesUserScopedBootstrap(
    createSupabaseClientSpy: Spy<AiProvidersHandlerDeps["createSupabaseClient"]>,
    getEnvSpy: Spy<AiProvidersHandlerDeps["getEnv"]>,
): void {
    assert(
        !getEnvSpy.calls.some((call) => call.args[0] === "SUPABASE_SERVICE_ROLE_KEY"),
        "User-scoped access must not request SUPABASE_SERVICE_ROLE_KEY",
    );
    assertSpyCalls(createSupabaseClientSpy, 1);
    assertSpyCall(createSupabaseClientSpy, 0, {
        args: [mockSupabaseUrl, mockAnonKey],
    });
}

function assertProviderQueryFilters(
    clientSpies: ReturnType<typeof createMockSupabaseClient>["spies"],
): void {
    assertSpyCall(clientSpies.fromSpy, 0, { args: ["ai_providers"] });
    const queryBuilderSpies: ReturnType<typeof createMockSupabaseClient>["spies"]["getLatestQueryBuilderSpies"] extends (...args: never[]) => infer TResult ? TResult : never =
        clientSpies.getLatestQueryBuilderSpies("ai_providers");
    assertExists(queryBuilderSpies);
    assertExists(queryBuilderSpies.eq);
    assertSpyCalls(queryBuilderSpies.eq, 2);
    assertSpyCall(queryBuilderSpies.eq, 0, { args: ["is_active", true] });
    assertSpyCall(queryBuilderSpies.eq, 1, { args: ["is_enabled", true] });
}

function createTestDeps(
    dbRows: Tables<"ai_providers">[] | null,
    dbError: Error | null,
    envVars: Record<string, string | undefined>,
): {
    deps: AiProvidersHandlerDeps;
    clientSpies: ReturnType<typeof createMockSupabaseClient>["spies"];
    createSupabaseClientSpy: Spy<AiProvidersHandlerDeps["createSupabaseClient"]>;
    getEnvSpy: Spy<AiProvidersHandlerDeps["getEnv"]>;
} {
    const mockSupabaseDataConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            ai_providers: {
                select: spy(async (state: MockQueryBuilderState) => {
                    if (dbError) {
                        return {
                            data: null,
                            error: dbError,
                            count: null,
                            status: 500,
                            statusText: "Error",
                        };
                    }
                    const filteredRows: Tables<"ai_providers">[] = (dbRows ?? []).filter((providerRow) =>
                        matchesAiProviderFilters(providerRow, state)
                    );
                    return {
                        data: filteredRows,
                        error: null,
                        count: filteredRows.length,
                        status: 200,
                        statusText: "OK",
                    };
                }),
            },
        },
    };
    const mockSupabaseSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        mockUserId,
        mockSupabaseDataConfig,
    );
    const createSupabaseClientSpy: Spy<AiProvidersHandlerDeps["createSupabaseClient"]> = spy((
        url: string,
        key: string,
    ): SupabaseClient => {
        assertEquals(url, mockSupabaseUrl);
        assertEquals(key, mockAnonKey);
        return mockSupabaseSetup.client as unknown as SupabaseClient;
    });
    const getEnvSpy: Spy<AiProvidersHandlerDeps["getEnv"]> = spy((key: string): string | undefined => envVars[key]);
    const deps: AiProvidersHandlerDeps = {
        handleCorsPreflightRequest: spy(defaultDeps.handleCorsPreflightRequest),
        createJsonResponse: spy(defaultDeps.createJsonResponse),
        createErrorResponse: spy(defaultDeps.createErrorResponse),
        createSupabaseClient: createSupabaseClientSpy,
        getEnv: getEnvSpy,
    };

    return {
        deps,
        clientSpies: mockSupabaseSetup.spies,
        createSupabaseClientSpy,
        getEnvSpy,
    };
}

// --- Test Suite ---
Deno.test("ai-providers Function Tests", async (t) => {

    // No global setup/teardown needed as deps are created per test

    await t.step("OPTIONS request should return CORS headers", async () => {
        const { deps } = createTestDeps([], null, {});
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
        const { deps } = createTestDeps([], null, {});
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
        const { deps, clientSpies, createSupabaseClientSpy, getEnvSpy } = createTestDeps(
            [...mockDbProviders],
            null,
            envVars,
        );

        const req = createUserScopedGetRequest();
        const response = await mainHandler(req, deps);
        assertUsesUserScopedBootstrap(createSupabaseClientSpy, getEnvSpy);
        assertProviderQueryFilters(clientSpies);
        assertEquals(response.status, 200);
        const body: { providers: Tables<"ai_providers">[] } = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 4, `Expected 4 providers, got ${body.providers.length}`); 
        assert(body.providers.some((providerRow) => providerRow.id === "1"));
        assert(body.providers.some((providerRow) => providerRow.id === "3"));
        assert(body.providers.some((providerRow) => providerRow.id === "5"));
        assert(body.providers.some((providerRow) => providerRow.id === "6"));
        assert(!body.providers.some((providerRow) => providerRow.id === "2"), "Provider ID 2 should be filtered");
        assert(!body.providers.some((providerRow) => providerRow.id === "4"), "Provider ID 4 should be filtered");
        assert(!body.providers.some((providerRow) => providerRow.id === "7"), "Provider ID 7 should be filtered");
        assert(!body.providers.some((providerRow) => providerRow.id === "8"), "Provider ID 8 should be filtered");
        assert(!body.providers.some((providerRow) => providerRow.id === "9"), "Provider ID 9 should be filtered");
        assert(getEnvSpy.calls.some((call) => call.args[0] === "OPENAI_API_KEY"));
        assert(getEnvSpy.calls.some((call) => call.args[0] === "GOOGLE_API_KEY"));
    });

    await t.step("GET Filtering - Only OpenAI Key Set: Returns active, enabled OpenAI providers", async () => {
        const envVars = {
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey,
            // ANTHROPIC & GOOGLE keys NOT set
        };
        const { deps, clientSpies, createSupabaseClientSpy, getEnvSpy } = createTestDeps(
            [...mockDbProviders],
            null,
            envVars,
        );

        const req = createUserScopedGetRequest();
        const response = await mainHandler(req, deps);
        assertUsesUserScopedBootstrap(createSupabaseClientSpy, getEnvSpy);
        assertProviderQueryFilters(clientSpies);
        assertEquals(response.status, 200);
        const body: { providers: Tables<"ai_providers">[] } = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 3); 
        assert(body.providers.every((providerRow) => providerRow.provider === "openai"));
        assert(body.providers.some((providerRow) => providerRow.id === "1"));
        assert(body.providers.some((providerRow) => providerRow.id === "5"));
        assert(body.providers.some((providerRow) => providerRow.id === "6"));
    });

    await t.step("GET Filtering - Only Anthropic Key Set: Returns empty (model 2 disabled)", async () => {
        const envVars = { 
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            ANTHROPIC_API_KEY: mockAnthropicKey 
        };
        const { deps, clientSpies, createSupabaseClientSpy, getEnvSpy } = createTestDeps(
            [...mockDbProviders],
            null,
            envVars,
        );

        const req = createUserScopedGetRequest();
        const response = await mainHandler(req, deps);
        assertUsesUserScopedBootstrap(createSupabaseClientSpy, getEnvSpy);
        assertProviderQueryFilters(clientSpies);
        assertEquals(response.status, 200);
        const body: { providers: Tables<"ai_providers">[] } = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 0);
    });

    await t.step("GET Filtering - Only Google Key Set: Returns active, enabled Google providers", async () => {
         const envVars = { 
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            GOOGLE_API_KEY: mockGoogleKey 
        };
        const { deps, clientSpies, createSupabaseClientSpy, getEnvSpy } = createTestDeps(
            [...mockDbProviders],
            null,
            envVars,
        );

        const req = createUserScopedGetRequest();
        const response = await mainHandler(req, deps);
        assertUsesUserScopedBootstrap(createSupabaseClientSpy, getEnvSpy);
        assertProviderQueryFilters(clientSpies);
        assertEquals(response.status, 200);
        const body: { providers: Tables<"ai_providers">[] } = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 1);
        assertEquals(body.providers[0].id, "3");
        assertEquals(body.providers[0].provider, "google");
    });

    await t.step("GET Filtering - OpenAI + Google Keys Set: Returns corresponding active, enabled providers", async () => {
        const envVars = {
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey,
            GOOGLE_API_KEY: mockGoogleKey,
            // ANTHROPIC_API_KEY is NOT set
        };
        const { deps, clientSpies, createSupabaseClientSpy, getEnvSpy } = createTestDeps(
            [...mockDbProviders],
            null,
            envVars,
        );

        const req = createUserScopedGetRequest();
        const response = await mainHandler(req, deps);
        assertUsesUserScopedBootstrap(createSupabaseClientSpy, getEnvSpy);
        assertProviderQueryFilters(clientSpies);
        assertEquals(response.status, 200);
        const body: { providers: Tables<"ai_providers">[] } = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 4); 
        assert(body.providers.filter((providerRow) => providerRow.provider === "openai").length === 3);
        assert(body.providers.filter((providerRow) => providerRow.provider === "google").length === 1);
        assert(body.providers.filter((providerRow) => providerRow.provider === "anthropic").length === 0);
    });

    await t.step("GET Filtering - No Keys Set: Returns empty list (as before)", async () => {
        const envVars = { 
            SUPABASE_URL: mockSupabaseUrl,
            SUPABASE_ANON_KEY: mockAnonKey,
            // No provider keys set
        };
        const { deps, clientSpies, createSupabaseClientSpy, getEnvSpy } = createTestDeps(
            [...mockDbProviders],
            null,
            envVars,
        );

        const req = createUserScopedGetRequest();
        const response = await mainHandler(req, deps);
        assertUsesUserScopedBootstrap(createSupabaseClientSpy, getEnvSpy);
        assertProviderQueryFilters(clientSpies);
        assertEquals(response.status, 200);
        const body: { providers: Tables<"ai_providers">[] } = await response.json();

        assertExists(body.providers);
        assertEquals(body.providers.length, 0);
    });

    await t.step("GET DB Error: Returns 500 (as before)", async () => {
        const envVars = { 
            SUPABASE_URL: mockSupabaseUrl, 
            SUPABASE_ANON_KEY: mockAnonKey,
            OPENAI_API_KEY: mockOpenAiKey 
        };
        const dbError = new Error("Simulated DB connection failed");
        const { deps, clientSpies, createSupabaseClientSpy, getEnvSpy } = createTestDeps(
            null,
            dbError,
            envVars,
        );

        const req = createUserScopedGetRequest();
        const response = await mainHandler(req, deps);
        assertUsesUserScopedBootstrap(createSupabaseClientSpy, getEnvSpy);
        assertProviderQueryFilters(clientSpies);
        assertEquals(response.status, 500);
        const body: { error: string } = await response.json();
        assertEquals(body.error, dbError.message);
    });

    // Add more tests? e.g., RLS failure (if applicable)
}); 