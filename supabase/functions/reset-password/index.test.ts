import {
  describe,
  it,
  beforeEach,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  spy,
  stub,
  Spy,
  Stub,
  assertSpyCall,
  assertSpyCalls,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
import { SupabaseClient, AuthError } from "jsr:@supabase/supabase-js@2";

import { handleResetPasswordRequest, ResetPasswordDependencies } from "./index.ts";

// --- Test Setup ---

const defaultEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "test-anon-key",
  // Add other env vars if needed by verifyApiKey or other dependencies
  API_KEY: "test-api-key", 
};

let envStub: Stub | undefined;

function setupEnvStub(envVars: Record<string, string | undefined>) {
  // Ensure the stub is restored before creating a new one if called multiple times rapidly
  if (envStub) envStub.restore(); 
  envStub = stub(Deno.env, "get", (key: string) => envVars[key]);
}

function createMockDeps(overrides: Partial<ResetPasswordDependencies> = {}): ResetPasswordDependencies {
  const mocks = {
    handleCorsPreflightRequest: spy((req: Request) => req.method === 'OPTIONS' ? new Response(null, { status: 204 }) : null),
    verifyApiKey: spy((req: Request) => req.headers.get('apikey') === defaultEnv.API_KEY), // Basic mock
    createUnauthorizedResponse: spy((message: string) => new Response(JSON.stringify({ error: message }), { status: 401 })),
    createErrorResponse: spy((message: string, status: number) => new Response(JSON.stringify({ error: message }), { status })),
    createSuccessResponse: spy((body?: Record<string, unknown>) => new Response(JSON.stringify(body ?? { message: "Success" }), { status: 200 })),
    getEnv: spy(Deno.env.get), // Stubbed separately by setupEnvStub
    getOriginHeader: spy((req: Request) => req.headers.get('origin')), // Basic mock
    createSupabaseClient: spy((url: string, key: string): SupabaseClient => {
        // Basic mock Supabase client
        return {
            auth: {
                resetPasswordForEmail: spy(() => Promise.resolve({ error: null })) // Default success
            }
        } as any;
    }),
    supabaseResetPassword: spy((client: SupabaseClient, email: string, options: { redirectTo: string }): Promise<{ error: AuthError | null }> => {
        // Directly call the mocked client's method
        return client.auth.resetPasswordForEmail(email, options);
    }),
  };

  // Apply overrides, ensuring spies are maintained if objects are overridden
  const finalMocks = { ...mocks };
  for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          // Directly assign the override. Caller is responsible for providing a spied function if needed.
          (finalMocks as any)[key] = overrides[key as keyof ResetPasswordDependencies];
      }
  }

  // Return type is just the base interface. Tests might need to cast to Spy.
  return finalMocks as ResetPasswordDependencies;
}

// --- Tests ---

describe("Reset Password Handler", () => {

  afterEach(() => {
    if (envStub) {
      envStub.restore();
      envStub = undefined;
    }
  });

  it("should handle CORS preflight requests", async () => {
    const mockDeps = createMockDeps();
    const req = new Request("http://example.com/reset-password", { method: "OPTIONS" });
    const res = await handleResetPasswordRequest(req, mockDeps);

    assertEquals(res.status, 204);
    assertSpyCall(mockDeps.handleCorsPreflightRequest as Spy, 0, { args: [req] });
    assertSpyCalls(mockDeps.verifyApiKey as Spy, 0); 
  });

  it("should return 401 for invalid API key on POST", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/reset-password", {
        method: "POST",
        headers: { 'apikey': 'wrong-key' } // Incorrect key
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 401);
      assertSpyCall(mockDeps.verifyApiKey as Spy, 0); // Ensure verify was called
      assertSpyCall(mockDeps.createUnauthorizedResponse as Spy, 0, { args: ["Invalid or missing apikey"] });
  });

  it("should return 405 for non-POST requests (after CORS/API key)", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/reset-password", {
          method: "GET", // Use GET for example
          headers: { 'apikey': defaultEnv.API_KEY } // Valid API key
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 405);
      assertSpyCall(mockDeps.verifyApiKey as Spy, 0); // Verify was called
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ['Method Not Allowed', 405] });
  });

  // --- POST Request Tests ---

  it("should return 400 if email is missing in body", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ notEmail: "test@example.com" })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 400);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Email is required", 400] });
      assertSpyCalls(mockDeps.supabaseResetPassword as Spy, 0); // Ensure Supabase call was not made
  });

  it("should return 400 if email is not a string", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 12345 })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 400);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Invalid email format", 400] });
  });

  it("should return 400 if body is invalid JSON", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json' },
          body: "{ invalid json "
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 400);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Invalid JSON body", 400] });
  });

  it("should return 500 if Supabase env vars are missing", async () => {
      setupEnvStub({ ...defaultEnv, SUPABASE_URL: undefined }); // Missing URL
      const mockDeps = createMockDeps();
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json', 'origin': 'http://localhost:3000' },
          body: JSON.stringify({ email: "test@example.com" })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 500);
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Configuration error", 500] });
  });

  it("should return 500 if Supabase client initialization fails", async () => {
      setupEnvStub(defaultEnv);
      const initError = new Error("Failed to init");
      // Ensure the override is already spied
      const mockCreateClientOverride = spy(() => { throw initError; });
      const mockDeps = createMockDeps({ createSupabaseClient: mockCreateClientOverride });
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json', 'origin': 'http://localhost:3000' },
          body: JSON.stringify({ email: "test@example.com" })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 500);
      // Assert the override spy was called
      assertSpyCall(mockCreateClientOverride, 0); 
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Supabase client initialization failed", 500] });
  });

  it("should return 500 if Supabase resetPasswordForEmail fails", async () => {
      setupEnvStub(defaultEnv);
      const supabaseError = new AuthError("Reset failed");
      const mockResetPassword = spy(() => Promise.resolve({ error: supabaseError }));
      const mockDeps = createMockDeps({ supabaseResetPassword: mockResetPassword });
      
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json', 'origin': 'http://localhost:3000' },
          body: JSON.stringify({ email: "test@example.com" })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 500);
      assertSpyCall(mockResetPassword as Spy, 0); // Ensure reset was attempted
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Failed to send reset email", 500] });
      assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0);
  });

  it("should return 200 and call resetPasswordForEmail on success (with origin)", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const testEmail = "success@example.com";
      const testOrigin = "https://myapp.com";
      const expectedRedirectTo = `${testOrigin}/reset-password`;

      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: {
              'apikey': defaultEnv.API_KEY,
              'Content-Type': 'application/json',
              'origin': testOrigin
          },
          body: JSON.stringify({ email: testEmail })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockDeps.createSupabaseClient as Spy, 0, { args: [defaultEnv.SUPABASE_URL, defaultEnv.SUPABASE_ANON_KEY] });
      assertSpyCall(mockDeps.supabaseResetPassword as Spy, 0);
      // Check arguments passed to the actual reset function spy
      const resetCallArgs = (mockDeps.supabaseResetPassword as Spy).calls[0].args;
      assertEquals(resetCallArgs[1], testEmail); // email
      assertEquals(resetCallArgs[2]?.redirectTo, expectedRedirectTo); // options.redirectTo
      
      assertSpyCall(mockDeps.createSuccessResponse as Spy, 0, {
        args: [{ message: "Password reset email sent successfully" }]
      });
      assertSpyCalls(mockDeps.createErrorResponse as Spy, 0);
  });

  it("should return 200 and call resetPasswordForEmail on success (without origin)", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps();
      const testEmail = "noorigin@example.com";
      const expectedRedirectTo = `/reset-password`; // Should just be the path

      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: {
              'apikey': defaultEnv.API_KEY,
              'Content-Type': 'application/json'
              // No origin header
          },
          body: JSON.stringify({ email: testEmail })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 200);
      assertSpyCall(mockDeps.supabaseResetPassword as Spy, 0);
      const resetCallArgs = (mockDeps.supabaseResetPassword as Spy).calls[0].args;
      assertEquals(resetCallArgs[1], testEmail); // email
      assertEquals(resetCallArgs[2]?.redirectTo, expectedRedirectTo); // options.redirectTo
      
      assertSpyCall(mockDeps.createSuccessResponse as Spy, 0);
  });

  it("should call supabaseResetPassword with correct email and redirect URL", async () => {
    setupEnvStub(defaultEnv);
    const mockResetPasswordSpy = spy(() => Promise.resolve({ error: null }));
    const mockDeps = createMockDeps({ supabaseResetPassword: mockResetPasswordSpy });
    const testEmail = "user@domain.com";
    const origin = "https://app.example.com";
    const req = new Request("http://example.com/reset-password", {
        method: "POST",
        headers: { 
            'apikey': defaultEnv.API_KEY, 
            'Content-Type': 'application/json',
            'origin': origin
        },
        body: JSON.stringify({ email: testEmail })
    });

    await handleResetPasswordRequest(req, mockDeps);

    // Assert supabaseResetPassword (the override spy) was called with correct args
    assertSpyCall(mockResetPasswordSpy, 0, {
        args: [
            testEmail,
            { redirectTo: `${origin}/update-password` }
        ]
    });

    assertSpyCall(mockDeps.createSuccessResponse as Spy, 0); // Check success response
  });

  it("should return 500 if supabaseResetPassword throws an error", async () => {
      setupEnvStub(defaultEnv);
      const supabaseError = new AuthError("Rate limit exceeded");
      // Ensure override is spied
      const mockResetPassword = spy(() => Promise.resolve({ error: supabaseError }));
      const mockDeps = createMockDeps({ supabaseResetPassword: mockResetPassword });
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 'apikey': defaultEnv.API_KEY, 'Content-Type': 'application/json', 'origin': 'http://localhost:3000' },
          body: JSON.stringify({ email: "test@example.com" })
      });
      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 500);
      // Assert the override spy was called
      assertSpyCall(mockResetPassword, 0); 
      assertSpyCall(mockDeps.createErrorResponse as Spy, 0, { args: ["Failed to send reset email", 500] });
      assertSpyCalls(mockDeps.createSuccessResponse as Spy, 0);
  });

  it("should call supabaseResetPassword and return success", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps(); // Use default success mock for supabaseResetPassword
      const testEmail = "user@domain.com";
      const origin = "https://app.example.com";
      const expectedRedirectTo = `${origin}/update-password`;
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 
              'apikey': defaultEnv.API_KEY, 
              'Content-Type': 'application/json',
              'origin': origin
          },
          body: JSON.stringify({ email: testEmail })
      });

      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 200);
      // Assert the default spy was called with correct args
      assertSpyCall(mockDeps.supabaseResetPassword as Spy, 0, {
          args: [
              testEmail,
              { redirectTo: expectedRedirectTo }
          ]
      });
      
      assertSpyCall(mockDeps.createSuccessResponse as Spy, 0, {
          args: [{ message: "Password reset email sent successfully" }]
      });
      assertSpyCalls(mockDeps.createErrorResponse as Spy, 0);
  });

  it("should construct redirect URL correctly without origin header", async () => {
      setupEnvStub(defaultEnv);
      const mockDeps = createMockDeps(); 
      const testEmail = "no-origin@test.com";
      // Use default NEXT_PUBLIC_SITE_URL or fallback
      const expectedRedirectTo = `${defaultEnv.SUPABASE_URL}/update-password`; 
      const req = new Request("http://example.com/reset-password", {
          method: "POST",
          headers: { 
              'apikey': defaultEnv.API_KEY, 
              'Content-Type': 'application/json'
              // No Origin header
          },
          body: JSON.stringify({ email: testEmail })
      });

      const res = await handleResetPasswordRequest(req, mockDeps);

      assertEquals(res.status, 200);
      // Assert the default spy was called with correct fallback redirect
      assertSpyCall(mockDeps.supabaseResetPassword as Spy, 0, {
          args: [ 
              testEmail, 
              { redirectTo: expectedRedirectTo } 
          ]
      });
      
      assertSpyCall(mockDeps.createSuccessResponse as Spy, 0);
  });

  // --- Add more tests here ---

}); 