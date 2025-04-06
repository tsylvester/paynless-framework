import { assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { spy, assertSpyCall, assertSpyCalls, stub } from "jsr:@std/testing@0.225.1/mock"; 

// Import the handler function and the dependency interface
import { handleLogoutRequest, type LogoutHandlerDeps } from "./index.ts";

// Import types needed for mocks
import type { SupabaseClient, AuthError } from "@supabase/supabase-js";
import { verifyApiKey as actualVerifyApiKey, createUnauthorizedResponse as actualCreateUnauthorizedResponse } from "../_shared/auth.ts"; // Import actuals for type signature

// --- Test Cases ---
Deno.test("Logout Function Tests", async (t) => {

    // Mock Deno.env.get once for the whole suite if needed by the module itself (unlikely here)
    const envGetStub = stub(Deno.env, "get"); // Keep it simple unless needed

    try {

        // Helper to create default mocks, easily overridable
        const createMockDeps = (overrides: Partial<LogoutHandlerDeps> = {}): LogoutHandlerDeps => {
            const baseDeps: LogoutHandlerDeps = {
                handleCorsPreflightRequest: spy(() => null), // Default: Not a CORS request
                verifyApiKey: spy(() => true), // Default: API key is valid
                createUnauthorizedResponse: spy((message: string) => new Response(JSON.stringify({ error: message }), { status: 401 })),
                createErrorResponse: spy((message: string, status?: number) => new Response(JSON.stringify({ error: message }), { status: status || 500 })),
                createSuccessResponse: spy((data: unknown, status?: number) => new Response(JSON.stringify(data), { status: typeof status === 'number' ? status : 200 })),
                createSupabaseClient: spy(() => ({ auth: { signOut: spy(async () => ({ error: null })) } } as any)), // Default: Creates client successfully, signOut works
                signOut: spy(async () => ({ error: null })), // Default: signOut works
                ...overrides, // Apply specific overrides for the test
            };
            return baseDeps;
        };

        await t.step("OPTIONS request should handle CORS preflight", async () => {
            const mockResponse = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
            const handleCorsSpy = spy(() => mockResponse);
            const mockDeps = createMockDeps({ handleCorsPreflightRequest: handleCorsSpy });

            const req = new Request('http://example.com/logout', { method: 'OPTIONS' });
            const res = await handleLogoutRequest(req, mockDeps);
            assertEquals(res, mockResponse);
            assertSpyCall(handleCorsSpy, 0);
            // API key check shouldn't happen for OPTIONS
            assertSpyCalls(mockDeps.verifyApiKey, 0);
        });

        await t.step("POST request without API key should return 401 Unauthorized", async () => {
            const mockDeps = createMockDeps({ 
                verifyApiKey: spy(() => false) // Mock verifyApiKey to return false
            });
            const req = new Request('http://example.com/logout', { method: 'POST' });
            const res = await handleLogoutRequest(req, mockDeps);
            assertEquals(res.status, 401);
            assertSpyCall(mockDeps.verifyApiKey, 0); // Ensure verifyApiKey was called
            assertSpyCall(mockDeps.createUnauthorizedResponse, 0, { args: ["Invalid or missing apikey"] });
            // Other dependencies should not have been called
            assertSpyCalls(mockDeps.createSupabaseClient, 0);
            assertSpyCalls(mockDeps.signOut!, 0);
        });

        await t.step("Request without valid Authorization header should return 401/500", async () => {
            const mockError = new Error("Unauthorized - Missing or invalid token");
            const mockCreateClient = spy(() => { throw mockError; });
            const mockDeps = createMockDeps({ 
                createSupabaseClient: mockCreateClient, // Override client creation to throw
                // verifyApiKey is default true here
            });
            const req = new Request('http://example.com/logout', { method: 'POST' });
            const res = await handleLogoutRequest(req, mockDeps);
            assertEquals(res.status, 401); // Expecting 401 because createSupabaseClient throws an Unauthorized error
            assertSpyCall(mockDeps.verifyApiKey, 0); // API key check passed
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [mockError.message, 401] }); 
        });

        await t.step("Supabase signOut error should return 500", async () => {
            const mockError = new Error("Sign out failed") as AuthError;
            mockError.name = 'AuthApiError';
            const mockSignOutError = spy(async (): Promise<{ error: AuthError | null }> => ({ error: mockError }));
            const mockClientError = { auth: { signOut: mockSignOutError } };
            const mockCreateClient = spy(() => mockClientError as any);
            
            const mockDeps = createMockDeps({ 
                createSupabaseClient: mockCreateClient, 
                signOut: mockSignOutError 
            });
            
            const req = new Request('http://example.com/logout', { method: 'POST' }); 
            const res = await handleLogoutRequest(req, mockDeps);
            
            assertEquals(res.status, 500);
            assertSpyCall(mockDeps.verifyApiKey, 0); // API key check passed
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockDeps.signOut!, 0);
            assertSpyCall(mockDeps.createErrorResponse, 0, { args: [mockError.message, 500] });
        });
        
        await t.step("Successful signOut should return 200 with message", async () => {
            const mockSignOutSuccess = spy(async (): Promise<{ error: AuthError | null }> => ({ error: null }));
            const mockClientSuccess = { auth: { signOut: mockSignOutSuccess } }; 
            const mockCreateClient = spy(() => mockClientSuccess as any);

            const mockDeps = createMockDeps({ 
                createSupabaseClient: mockCreateClient,
                signOut: mockSignOutSuccess 
            }); 
            const req = new Request('http://example.com/logout', { method: 'POST' }); 
            const res = await handleLogoutRequest(req, mockDeps);

            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body, { message: "Successfully signed out" });
            assertSpyCall(mockDeps.verifyApiKey, 0); // API key check passed
            assertSpyCall(mockDeps.createSupabaseClient, 0);
            assertSpyCall(mockDeps.signOut!, 0);
            assertSpyCall(mockDeps.createSuccessResponse, 0, { args: [{ message: "Successfully signed out" }] });
            assertSpyCalls(mockDeps.createErrorResponse, 0);
        });

    } finally {
        envGetStub.restore(); 
    }
}); 