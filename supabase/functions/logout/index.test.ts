import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleLogoutRequest, type LogoutHandlerDeps } from "./index.ts";

// Import types needed for mocks
import type { SupabaseClientOptions, SupabaseClient, AuthError } from "@supabase/supabase-js";

// --- Test Cases ---
Deno.test("Logout Function Tests", async (t) => {

    // --- Helper to create Mock Dependencies ---
    const createMockDeps = (overrides: Partial<LogoutHandlerDeps> = {}): LogoutHandlerDeps => {
        // Default mock client setup
        const mockSignOut = spy(async (): Promise<{ error: AuthError | null }> => ({ error: null })); // Default: success
        const mockClient = {
            auth: { signOut: mockSignOut }
        };
        
        return {
            handleCorsPreflightRequest: spy((_req: Request) => null), 
            verifyApiKey: spy((_req: Request) => true), // Default: valid
            createUnauthorizedResponse: spy((msg: string) => new Response(JSON.stringify({ error: msg }), { status: 401 })),
            createErrorResponse: spy((msg: string, status?: number) => new Response(JSON.stringify({ error: msg }), { status: status || 500 })),
            createSuccessResponse: spy((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
            createSupabaseClient: spy(() => mockClient as any), 
            ...overrides,
        };
    };
    
    // Mock Deno.env.get once
    const envGetStub = stub(Deno.env, "get", (key: string): string | undefined => {
        if (key === 'SUPABASE_URL') return 'http://localhost:54321';
        if (key === 'SUPABASE_ANON_KEY') return 'test-anon-key';
        return undefined;
    });

    // --- Actual Tests --- 
    try {

        await t.step("OPTIONS request should handle CORS preflight", async () => {
            const mockResponse = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
            const mockDeps = createMockDeps({ 
                handleCorsPreflightRequest: spy(() => mockResponse) 
            });
            const req = new Request('http://example.com/logout', { method: 'OPTIONS' });
            const res = await handleLogoutRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(mockDeps.handleCorsPreflightRequest, 0);
            assertSpyCalls(mockDeps.verifyApiKey, 0);
        });

        await t.step("Request without API key should return 401 Unauthorized", async () => {
            // Note: Assumes ANY method works if API key is missing, based on original code structure
            const mockDeps = createMockDeps({ verifyApiKey: spy(() => false) });
            const req = new Request('http://example.com/logout', { method: 'POST' }); // Use POST or any method
            const res = await handleLogoutRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            assertSpyCall(mockDeps.verifyApiKey, 0);
            assertSpyCalls(mockDeps.createSupabaseClient, 0); // Client shouldn't be created
        });

        await t.step("Supabase signOut error should return 500", async () => {
            const mockError = new Error("Sign out failed") as AuthError;
            mockError.name = 'AuthApiError';
            const mockSignOutError = spy(async (): Promise<{ error: AuthError | null }> => ({ error: mockError }));
            const mockClientError = { auth: { signOut: mockSignOutError } };
            const mockDeps = createMockDeps({ createSupabaseClient: spy(() => mockClientError as any) });
            
            const req = new Request('http://example.com/logout', { method: 'POST' }); // Use POST or any method
            const res = await handleLogoutRequest(req, mockDeps);
            
            assertEquals(res.status, 500);
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockSignOutError, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [mockError.message, 500] });
            assertSpyCalls(mockDeps.createSuccessResponse, 0);
        });
        
        await t.step("Successful signOut should return 200 with message", async () => {
            // Use default mockDeps which mocks successful signOut
            const mockDeps = createMockDeps(); 
            const req = new Request('http://example.com/logout', { method: 'POST' }); // Use POST or any method
            const res = await handleLogoutRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, { message: "Successfully signed out" });
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            // Find the actual signOut spy via the client spy
            const clientSpy = mockDeps.createSupabaseClient as any; // Get the createClient spy
            assertSpyCall(clientSpy, 0); // Ensure client was created
            const clientInstance = clientSpy.calls[0].returned; // Get the returned mock client
            assertSpyCall(clientInstance.auth.signOut, 0); // Assert signOut was called on the instance
            assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [{ message: "Successfully signed out" }] });
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

    } finally {
        envGetStub.restore(); 
    }
}); 