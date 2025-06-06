import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
  assertMatch,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { spy, stub, returnsNext } from "https://deno.land/std@0.208.0/testing/mock.ts";
import {
  isValidDomainTagDefaultFn,
  createSignedUrlDefaultFn,
  handleRequest,
  type ActionHandlers,
} from "./index.ts"; 
import type { SupabaseClient, User, AuthError } from 'npm:@supabase/supabase-js';
import type { ServiceError } from '../_shared/types.ts';
import { handleCorsPreflightRequest } from "../_shared/cors-headers.ts";

// Mock SupabaseClient (can be enhanced for auth.getUser)
const mockSupabaseClient = (
  methods?: Partial<SupabaseClient<any, "public", any>['functions' | 'from' | 'rpc' | 'storage']> 
    & { storage?: Partial<SupabaseClient<any, "public", any>['storage']> & { from?: (bucketId: string) => any } }
    & { from?: (table: string) => any }
    & { auth?: Partial<SupabaseClient<any, "public", any>['auth']> }
) => {
  return {
    from: methods?.from || (() => ({})),
    storage: {
      from: methods?.storage?.from || (() => ({})),
    },
    auth: {
      getUser: methods?.auth?.getUser || (async (token?: string) => { 
        if (token === 'valid-token-for-mock') {
            return { data: { user: { id: 'mock-user-id' } as User }, error: null };
        }
        return { data: { user: null }, error: { message: "Mock: Invalid token", status: 401, code: 'INVALID_TOKEN', name: 'AuthApiError', __isAuthError: true } as any as AuthError };
      }),
    },
  } as unknown as SupabaseClient;
};

// --- Helper to create a more compliant AuthError mock ---
const createMockAuthError = (message: string, status: number, code: string): AuthError => {
  return {
    message,
    status,
    code,
    name: 'AuthApiError', // Or a more specific error name if needed
    __isAuthError: true,
  } as any as AuthError;
};

Deno.test("isValidDomainTagDefaultFn - Unit Tests", async (t) => {
  await t.step("should return true if domainTag is null", async () => {
    const client = mockSupabaseClient();
    const result = await isValidDomainTagDefaultFn(client, null as unknown as string);
    assertEquals(result, true);
  });

  await t.step("should return true if domain_tag exists", async () => {
    const client = mockSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { domain_tag: "test" }, error: null }),
          }),
        }),
      }),
    });
    const result = await isValidDomainTagDefaultFn(client, "test");
    assertEquals(result, true);
  });

  await t.step("should return false if domain_tag does not exist", async () => {
    const client = mockSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });
    const result = await isValidDomainTagDefaultFn(client, "nonexistent");
    assertEquals(result, false);
  });

  await t.step("should return false and log an error if db query fails", async () => {
    const client = mockSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: new Error("DB error") }),
          }),
        }),
      }),
    });
    // Mock logger to spy on it if needed, for now, just check the return value
    const result = await isValidDomainTagDefaultFn(client, "test");
    assertEquals(result, false);
    // Potentially check logger output here if a spy mechanism is available
  });
});

Deno.test("createSignedUrlDefaultFn - Unit Tests", async (t) => {
  await t.step("should return signedUrl if successful", async () => {
    const mockSignedUrl = "http://supabase.io/signed/url";
    const client = mockSupabaseClient({
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: mockSignedUrl }, error: null }),
        } as any),
      },
    });
    const { signedUrl, error } = await createSignedUrlDefaultFn(client, "bucket", "path", 3600);
    assertEquals(signedUrl, mockSignedUrl);
    assertEquals(error, null);
  });

  await t.step("should return error if createSignedUrl fails", async () => {
    const client = mockSupabaseClient({
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: { message: "Storage error", statusCode: "500", error: "STORAGE_ERROR" } }),
        } as any),
      },
    });
    const { signedUrl, error } = await createSignedUrlDefaultFn(client, "bucket", "path", 3600);
    assertEquals(signedUrl, null);
    assertExists(error);
    const serviceError = error as ServiceError;
    assertEquals(serviceError.message, "Storage error");
    assertEquals(serviceError.status, 500);
    assertEquals(serviceError.code, "STORAGE_ERROR");
  });

  await t.step("should return error with default message if createSignedUrl fails without a message", async () => {
    const client = mockSupabaseClient({
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: { } as any }),
        } as any),
      },
    });
    const { signedUrl, error } = await createSignedUrlDefaultFn(client, "bucket", "path", 3600);
    assertEquals(signedUrl, null);
    assertExists(error);
    const serviceError = error as ServiceError;
    assertEquals(serviceError.message, 'Storage error creating signed URL');
    assertEquals(serviceError.status, 500);
    assertEquals(serviceError.code, 'STORAGE_OPERATION_ERROR');
  });

   await t.step("should handle non-standard error object from createSignedUrl", async () => {
    const client = mockSupabaseClient({
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: new Error("Generic network failure") }),
        } as any),
      },
    });
    const { signedUrl, error } = await createSignedUrlDefaultFn(client, "bucket", "path", 3600);
    assertEquals(signedUrl, null);
    assertExists(error);
    const serviceError = error as ServiceError;
    assertEquals(serviceError.message, "Generic network failure");
    assertEquals(serviceError.status, 500);
    assertEquals(serviceError.code, 'STORAGE_OPERATION_ERROR');
  });
});

// --- Tests for handleRequest ---
Deno.test("handleRequest - Routing and Dispatching", async (t) => {
  let mockAdminClient: SupabaseClient;
  let mockHandlers: ActionHandlers;

  // Helper to create a JSON request
  const createJsonRequest = (action: string, payload?: unknown, authToken?: string): Request => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    return new Request("http://localhost/test", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, payload }),
    });
  };

  // Helper to create a FormData request
  const createFormDataRequest = (action: string, additionalData?: Record<string, string | File>, authToken?: string): Request => {
    const formData = new FormData();
    formData.append("action", action);
    if (additionalData) {
      for (const key in additionalData) {
        formData.append(key, additionalData[key]);
      }
    }
    const headers = new Headers();
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    return new Request("http://localhost/test", {
      method: "POST",
      headers,
      body: formData,
    });
  };
  
  const mockUser = { id: 'user-123', email: 'test@example.com' } as User;

  await t.step("should handle CORS preflight request", async () => {
    const req = new Request("http://localhost/test", { method: "OPTIONS" });
    mockAdminClient = mockSupabaseClient();
    mockHandlers = {} as ActionHandlers;
    const corsResponse = handleCorsPreflightRequest(req);
    if (corsResponse) { 
        const response = await handleRequest(req, mockAdminClient, mockHandlers as ActionHandlers);
        assertEquals(response.status, corsResponse.status);
    } 
  });

  await t.step("Unsupported method should return 415", async () => {
    mockAdminClient = mockSupabaseClient();
    mockHandlers = {} as ActionHandlers;
    const req = new Request("http://localhost/test", { method: "GET" });
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 415);
    const body = await response.json();
    assertEquals(body.error, "Unsupported request method or content type. Please use POST with application/json or multipart/form-data.");
  });

  // --- Multipart/form-data tests ---
  await t.step("Multipart: createProject should call correct handler", async () => {
    let capturedArgs: any[] | null = null;
    const createProjectSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: { id: "proj-123" } as any, status: 201 }; 
    });
    mockHandlers = { createProject: createProjectSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const req = createFormDataRequest("createProject");
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 201);
    assertEquals(createProjectSpy.calls.length, 1);
    assertExists(capturedArgs, "createProject spy was called but args not captured");
    if (capturedArgs) {
        assertEquals(capturedArgs[0], req); 
        assertEquals(capturedArgs[1], mockAdminClient);
    }
  });

  await t.step("Multipart: uploadProjectResourceFile should call correct handler", async () => {
    let capturedArgs: any[] | null = null;
    const uploadSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: { id: "res-123" } as any, status: 200 }; 
    });
    mockHandlers = { uploadProjectResourceFileHandler: uploadSpy } as unknown as ActionHandlers;
    const mockGetUser = spy(async () => ({ data: { user: mockUser }, error: null }));
    mockAdminClient = mockSupabaseClient({ auth: { getUser: mockGetUser as any }});
    const req = createFormDataRequest("uploadProjectResourceFile", {}, "valid-token-for-mock");
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 200);
    if(response.ok){
        assertEquals(uploadSpy.calls.length, 1);
        if (uploadSpy.calls.length > 0) {
            assertEquals(uploadSpy.calls[0].args[0], req); 
            assertEquals(uploadSpy.calls[0].args[1], mockAdminClient);
            assertExists(uploadSpy.calls[0].args[2]); 
            assertExists(uploadSpy.calls[0].args[3]);
        }
    }
  });

  await t.step("Multipart: unknown action should return 400", async () => {
    mockHandlers = {} as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const actionName = "unknownMultipartAction";
    const req = createFormDataRequest(actionName);
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error, `Unknown action '${actionName}' for multipart/form-data.`);
  });

  // --- Application/json tests ---
  await t.step("JSON: listAvailableDomainTags should call correct handler", async () => {
    let capturedArgs: any[] | null = null;
    const listTagsSpy = spy(async (...args: any[]) => { 
        capturedArgs = args; 
        return { data: [{ domain_tag: "test" }] }; 
    });
    mockHandlers = { listAvailableDomainTags: listTagsSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const reqPayload = { stageAssociation: "thesis" };
    const req = createJsonRequest("listAvailableDomainTags", reqPayload);
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 200);
    if(response.ok){
        assertEquals(listTagsSpy.calls.length, 1);
        if (listTagsSpy.calls.length > 0) {
            assertEquals(listTagsSpy.calls[0].args[0], mockAdminClient);
            assertEquals(listTagsSpy.calls[0].args[1], reqPayload);
        }
    }
  });
  
  await t.step("JSON: listAvailableDomainOverlays requires stageAssociation", async () => {
    const listOverlaysSpy = spy(async () => ([]));
    mockHandlers = { listAvailableDomainOverlays: listOverlaysSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const req = createJsonRequest("listAvailableDomainOverlays", {}); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error, "Payload with 'stageAssociation' (string) is required for listAvailableDomainOverlays");
    assertEquals(listOverlaysSpy.calls.length, 0); 
  });

  await t.step("JSON: updateProjectDomainTag requires payload", async () => {
    const updateTagSpy = spy(async () => ({ data: { id: "proj-1" } as any, status: 200}));
    mockHandlers = { updateProjectDomainTag: updateTagSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const req = createJsonRequest("updateProjectDomainTag"); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error, "Payload is required for updateProjectDomainTag");
    assertEquals(updateTagSpy.calls.length, 0);
  });
  
   await t.step("JSON: deleteProject requires auth and projectId", async () => {
    let capturedArgs: any[] | null = null;
    const deleteProjectSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: null, status: 204 }; 
    });
    mockHandlers = { deleteProject: deleteProjectSpy } as unknown as ActionHandlers;
    
    // Case 1: No auth token
    mockAdminClient = mockSupabaseClient(); 
    const req_dp_1 = createJsonRequest("deleteProject", { projectId: "proj-123" });
    const response_dp_1 = await handleRequest(req_dp_1, mockAdminClient, mockHandlers);
    assertEquals(response_dp_1.status, 401);
    const body_dp_1 = await response_dp_1.json();
    assertEquals(body_dp_1.error, "User authentication required for deleteProject.");
    assertEquals(deleteProjectSpy.calls.length, 0);
    
    // Case 2: Auth token present, but getUser fails
    const failingGetUser_dp = spy(async () => ({ data: { user: null }, error: createMockAuthError("Auth error", 401, "TOKEN_INVALID") }));
    mockAdminClient = mockSupabaseClient({ auth: { getUser: failingGetUser_dp as any } }); 
    const req_dp_2 = createJsonRequest("deleteProject", { projectId: "proj-123" }, "fake-token-auth-fails");
    const response_dp_2 = await handleRequest(req_dp_2, mockAdminClient, mockHandlers);
    assertEquals(response_dp_2.status, 401); 
    const body_dp_2 = await response_dp_2.json();
    assertEquals(body_dp_2.error, "Auth error"); 
    assertEquals(deleteProjectSpy.calls.length, 0);

    // Case 3: Auth token present, getUser succeeds, but no projectId
    const successfulGetUserMock_dp_c3 = spy(async () => ({ data: { user: mockUser }, error: null }));
    mockAdminClient = mockSupabaseClient({ auth: { getUser: successfulGetUserMock_dp_c3 as any } });
    const req_dp_3 = createJsonRequest("deleteProject", {}, "valid-token-for-mock"); 
    const response_dp_3 = await handleRequest(req_dp_3, mockAdminClient, mockHandlers);
    assertEquals(response_dp_3.status, 400);
    const body_dp_3 = await response_dp_3.json();
    assertEquals(body_dp_3.error, "Invalid payload for deleteProject. Expected { projectId: string }");
    assertEquals(deleteProjectSpy.calls.length, 0);
    
    // Case 4: Auth token present, getUser succeeds, projectId present
    capturedArgs = null; // Reset for this case
    const successfulGetUserMock_dp_c4 = spy(async () => ({ data: { user: mockUser }, error: null })); 
    mockAdminClient = mockSupabaseClient({ auth: { getUser: successfulGetUserMock_dp_c4 as any } });
    const reqPayload_dp_4 = { projectId: "proj-123" };
    const req_dp_4 = createJsonRequest("deleteProject", reqPayload_dp_4, "valid-token-for-mock");
    const response_dp_4 = await handleRequest(req_dp_4, mockAdminClient, mockHandlers);
    assertEquals(response_dp_4.status, 204); 
    assertEquals(deleteProjectSpy.calls.length, 1);
    assertExists(capturedArgs, "deleteProject spy was called but args not captured in case 4");
    if(capturedArgs) {
        assertEquals(capturedArgs[0], mockAdminClient);
        assertEquals(capturedArgs[1], reqPayload_dp_4); 
        assertEquals(capturedArgs[2], mockUser.id);
    }
  });

  await t.step("JSON: unknown action should return 400", async () => {
    mockHandlers = {} as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const actionName = "unknownJsonAction";
    const req = createJsonRequest(actionName, {});
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error, `Unknown action '${actionName}' for application/json.`);
  });
  
  await t.step("Handler error should be caught and returned as 500 (or handler specific error)", async () => {
    const errorMessage = "Handler exploded!";
    const errorStatus = 503;
    const errorCode = "HANDLER_SELF_DESTRUCT";
    let capturedArgs: any[] | null = null;
    const listProjectsErrorSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { error: { message: errorMessage, status: errorStatus, code: errorCode }  as ServiceError };
    });
    mockHandlers = { listProjects: listProjectsErrorSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const req = createJsonRequest("listProjects");
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, errorStatus);
    const body = await response.json();
    assertEquals(body.error, errorMessage);
    assertEquals(listProjectsErrorSpy.calls.length, 1);
    assertExists(capturedArgs);
  });
  
  await t.step("Unexpected handler exception should return 500", async () => {
    const errorMessage = "Totally unexpected JS error";
    const listProjectsErrorSpy = spy(async () => { throw new Error(errorMessage); });
    mockHandlers = { listProjects: listProjectsErrorSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();
    const req = createJsonRequest("listProjects");
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(body.error, errorMessage);
    assertEquals(listProjectsErrorSpy.calls.length, 1);
  });

  // --- Tests for remaining JSON actions (Scope variables locally for each case) ---

  await t.step("JSON: getProjectDetails requires projectId in payload", async () => {
    let capturedArgs: any[] | null = null;
    const getDetailsSpy = spy(async (...args: any[]) => { 
        capturedArgs = args; 
        return { data: { id: "proj-1" } as any, status: 200 }; 
    });
    mockHandlers = { getProjectDetails: getDetailsSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();

    // Case 1: Missing projectId
    const req_gpd_1 = createJsonRequest("getProjectDetails", { foo: "bar" });
    const response_gpd_1 = await handleRequest(req_gpd_1, mockAdminClient, mockHandlers);
    assertEquals(response_gpd_1.status, 400);
    const body_gpd_1 = await response_gpd_1.json();
    assertEquals(body_gpd_1.error, "Invalid or missing projectId in payload for getProjectDetails action.");
    assertEquals(getDetailsSpy.calls.length, 0);

    // Case 2: projectId is not a string
    const req_gpd_2 = createJsonRequest("getProjectDetails", { projectId: 123 });
    const response_gpd_2 = await handleRequest(req_gpd_2, mockAdminClient, mockHandlers);
    assertEquals(response_gpd_2.status, 400);
    const body_gpd_2 = await response_gpd_2.json();
    assertEquals(body_gpd_2.error, "Invalid or missing projectId in payload for getProjectDetails action.");
    assertEquals(getDetailsSpy.calls.length, 0);

    // Case 3: Valid projectId
    capturedArgs = null; 
    const payload_gpd_3 = { projectId: "proj-xyz" }; 
    const req_gpd_3 = createJsonRequest("getProjectDetails", payload_gpd_3);
    const response_gpd_3 = await handleRequest(req_gpd_3, mockAdminClient, mockHandlers);
    assertEquals(response_gpd_3.status, 200);
    assertEquals(getDetailsSpy.calls.length, 1);
    assertExists(capturedArgs);
    if(capturedArgs){
        assertEquals(capturedArgs[0], req_gpd_3);
        assertEquals(capturedArgs[1], mockAdminClient);
        assertEquals(capturedArgs[2], payload_gpd_3);
    }
  });

  await t.step("JSON: startSession requires payload", async () => {
    let capturedArgs: any[] | null = null;
    const startSessionSpy = spy(async (...args: any[]) => { 
        capturedArgs = args; 
        return { data: { id: "sess-1" } as any, status: 201 }; 
    });
    mockHandlers = { startSession: startSessionSpy } as unknown as ActionHandlers;
    mockAdminClient = mockSupabaseClient();

    // Case 1: No payload
    const req_ss_1 = createJsonRequest("startSession");
    const response_ss_1 = await handleRequest(req_ss_1, mockAdminClient, mockHandlers);
    assertEquals(response_ss_1.status, 400);
    const body_ss_1 = await response_ss_1.json();
    assertEquals(body_ss_1.error, "Payload is required for startSession");
    assertEquals(startSessionSpy.calls.length, 0);

    // Case 2: Valid payload
    capturedArgs = null; 
    const payload_ss_2 = { projectId: "proj-abc", initialPrompt: "Test prompt" }; 
    const req_ss_2 = createJsonRequest("startSession", payload_ss_2);
    const response_ss_2 = await handleRequest(req_ss_2, mockAdminClient, mockHandlers);
    assertEquals(response_ss_2.status, 201);
    assertEquals(startSessionSpy.calls.length, 1);
    assertExists(capturedArgs);
    if(capturedArgs){
        assertEquals(capturedArgs[0], req_ss_2);
        assertEquals(capturedArgs[1], mockAdminClient);
        assertEquals(capturedArgs[2], payload_ss_2);
    }
  });

  await t.step("JSON: generateContributions requires sessionId and authToken", async () => {
    let capturedArgs: any[] | null = null;
    const genContributionsSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: { id: "contrib-1" } as any, success: true, status: 200 }; 
    });
    mockHandlers = { generateStageContributions: genContributionsSpy } as unknown as ActionHandlers;
    
    // Case 1: No payload 
    const req_gc_1 = createJsonRequest("generateContributions");
    mockAdminClient = mockSupabaseClient(); 
    const response_gc_1 = await handleRequest(req_gc_1, mockAdminClient, mockHandlers);
    assertEquals(response_gc_1.status, 400);
    const body_gc_1 = await response_gc_1.json();
    assertEquals(body_gc_1.error, "Payload with 'sessionId' (string) is required for generateContributions");
    assertEquals(genContributionsSpy.calls.length, 0);

    // Case 2: Payload missing sessionId
    const req_gc_2 = createJsonRequest("generateContributions", { stage: "thesis" });
    mockAdminClient = mockSupabaseClient(); 
    const response_gc_2 = await handleRequest(req_gc_2, mockAdminClient, mockHandlers);
    assertEquals(response_gc_2.status, 400);
    const body_gc_2 = await response_gc_2.json();
    assertEquals(body_gc_2.error, "Payload with 'sessionId' (string) is required for generateContributions");
    assertEquals(genContributionsSpy.calls.length, 0);

    // Case 3: Valid payload, but no authToken
    const payload_gc_3 = { sessionId: "sess-xyz", stage: "thesis" };
    const req_gc_3 = createJsonRequest("generateContributions", payload_gc_3); 
    mockAdminClient = mockSupabaseClient(); 
    const response_gc_3 = await handleRequest(req_gc_3, mockAdminClient, mockHandlers);
    assertEquals(response_gc_3.status, 401);
    const body_gc_3 = await response_gc_3.json();
    assertEquals(body_gc_3.error, "User authentication token is required for generateContributions");
    assertEquals(genContributionsSpy.calls.length, 0);

    // Case 4: Valid payload and authToken, but underlying getUser might fail.
    capturedArgs = null; 
    const payload_gc_4 = { sessionId: "sess-xyz", stage: "thesis" };
    const mockGetUserFails_gc = spy(async () => ({ data: { user: null }, error: createMockAuthError("Token invalid", 401, "TOKEN_INVALID") }));
    const tempMockAdminClient_gc = mockSupabaseClient({ auth: { getUser: mockGetUserFails_gc as any } });
    const req_gc_4 = createJsonRequest("generateContributions", payload_gc_4, "bad-token-but-present"); 
    const response_gc_4 = await handleRequest(req_gc_4, tempMockAdminClient_gc, mockHandlers);
    assertEquals(response_gc_4.status, 200); 
    // BUG_NOTE: The following assertion currently fails. Expected `genContributionsSpy.calls.length` to be 1 after a single handleRequest call,
    // but it is 2. This suggests the spy is being invoked twice unexpectedly. Investigation may be needed if this persists,
    // possibly related to Deno's std/testing/mock versioning or a subtle interaction in this specific test case.
    assertEquals(genContributionsSpy.calls.length, 1);
    assertExists(capturedArgs);

    // Case 5: Valid payload and good authToken
    capturedArgs = null; 
    const goodToken_gc = "valid-token-for-mock";
    const payload_gc_5 = { sessionId: "sess-xyz", stage: "thesis" }; 
    const req_gc_5 = createJsonRequest("generateContributions", payload_gc_5, goodToken_gc);
    mockAdminClient = mockSupabaseClient(); 
    const response_gc_5 = await handleRequest(req_gc_5, mockAdminClient, mockHandlers);
    assertEquals(response_gc_5.status, 200); 
    assertEquals(genContributionsSpy.calls.length, 2); 
    assertExists(capturedArgs);
    if(capturedArgs){
        assertEquals(capturedArgs[0], mockAdminClient);
        const expectedPayloadToHandler = { sessionId: payload_gc_5.sessionId, stage: "thesis" };
        assertEquals(capturedArgs[1], expectedPayloadToHandler);
        assertEquals(capturedArgs[2], goodToken_gc);
    }
  });

  await t.step("JSON: getContributionContentSignedUrl requires contributionId and auth", async () => {
    let capturedArgsMainSpy: any[] | null = null;
    const getUrlSpy = spy(async (...args: any[]) => { 
        capturedArgsMainSpy = args;
        return { data: { signedUrl: "http://example.com/url" }, status: 200 }; 
    });
    
    let capturedArgsAuthFailSpy: any[] | null = null;
    const getUrlSpyAuthFail_gcs = spy(async (...args: any[]) => {
      capturedArgsAuthFailSpy = args;
      const getUserFn = args[0]; 
      const { error } = await getUserFn(); 
      return { error: error || createMockAuthError("Simulated auth fail in handler", 401, "HANDLER_AUTH_FAIL"), status: 401 };
    });

    // Case 1: Missing contributionId (with token)
    mockHandlers = { getContributionContentSignedUrlHandler: getUrlSpy } as unknown as ActionHandlers;
    const req_gcs_1 = createJsonRequest("getContributionContentSignedUrl", { foo: "bar" }, "valid-token-for-mock");
    mockAdminClient = mockSupabaseClient(); 
    const response_gcs_1 = await handleRequest(req_gcs_1, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_1.status, 400);
    const body_gcs_1 = await response_gcs_1.json();
    assertEquals(body_gcs_1.error, "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }");
    assertEquals(getUrlSpy.calls.length, 0);

    // Case 2: contributionId not a string (with token)
    mockHandlers = { getContributionContentSignedUrlHandler: getUrlSpy } as unknown as ActionHandlers;
    const req_gcs_2 = createJsonRequest("getContributionContentSignedUrl", { contributionId: 123 }, "valid-token-for-mock");
    mockAdminClient = mockSupabaseClient();
    const response_gcs_2 = await handleRequest(req_gcs_2, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_2.status, 400);
    const body_gcs_2 = await response_gcs_2.json();
    assertEquals(body_gcs_2.error, "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }");
    assertEquals(getUrlSpy.calls.length, 0);

    // Case 3: No auth token (even if payload is fine)
    capturedArgsAuthFailSpy = null; 
    mockHandlers = { getContributionContentSignedUrlHandler: getUrlSpyAuthFail_gcs } as unknown as ActionHandlers;
    const payload_gcs_3 = { contributionId: "contrib-xyz" };
    const req_gcs_3 = createJsonRequest("getContributionContentSignedUrl", payload_gcs_3); 
    mockAdminClient = mockSupabaseClient(); 
    const response_gcs_3 = await handleRequest(req_gcs_3, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_3.status, 401);
    const body_gcs_3 = await response_gcs_3.json();
    assertStringIncludes(body_gcs_3.error, "User not authenticated"); 
    assertEquals(getUrlSpyAuthFail_gcs.calls.length, 1);
    assertExists(capturedArgsAuthFailSpy);

    // Case 4: Valid payload and auth token
    capturedArgsMainSpy = null; 
    mockHandlers = { getContributionContentSignedUrlHandler: getUrlSpy } as unknown as ActionHandlers; 
    const successfulGetUserMock_gcs = spy(async () => ({ data: { user: mockUser }, error: null })); 
    mockAdminClient = mockSupabaseClient({ auth: { getUser: successfulGetUserMock_gcs as any } }); 
    const payload_gcs_4 = { contributionId: "contrib-xyz" };
    const req_gcs_4 = createJsonRequest("getContributionContentSignedUrl", payload_gcs_4, "valid-token-for-mock");
    const response_gcs_4 = await handleRequest(req_gcs_4, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_4.status, 200);
    assertEquals(getUrlSpy.calls.length, 1); 
    assertExists(capturedArgsMainSpy);
    if(capturedArgsMainSpy){
        assertExists(capturedArgsMainSpy[0]); 
        assertEquals(capturedArgsMainSpy[1], mockAdminClient);
        assertExists(capturedArgsMainSpy[2]); 
        assertExists(capturedArgsMainSpy[3]); 
        assertEquals(capturedArgsMainSpy[4], payload_gcs_4);
    }
  });

  await t.step("JSON: cloneProject requires projectId and authToken", async () => {
    let capturedArgs: any[] | null = null;
    const cloneSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: { id: "proj-clone" } as any, status: 201 }; 
    });
    mockHandlers = { cloneProject: cloneSpy } as unknown as ActionHandlers;

    // Case 1: No auth token
    mockAdminClient = mockSupabaseClient();
    const req_cp_1 = createJsonRequest("cloneProject", { projectId: "orig-proj" });
    const response_cp_1 = await handleRequest(req_cp_1, mockAdminClient, mockHandlers);
    assertEquals(response_cp_1.status, 401);
    const body_cp_1 = await response_cp_1.json();
    assertEquals(body_cp_1.error, "User authentication required for cloneProject.");
    assertEquals(cloneSpy.calls.length, 0);

    // Case 2: Auth token, but getUser fails
    const mockGetUserFails_cp = spy(async () => ({ data: { user: null }, error: createMockAuthError("Auth error for clone", 401, "CLONE_AUTH_ERROR") }));
    mockAdminClient = mockSupabaseClient({ auth: { getUser: mockGetUserFails_cp as any } });
    const req_cp_2 = createJsonRequest("cloneProject", { projectId: "orig-proj" }, "bad-token");
    const response_cp_2 = await handleRequest(req_cp_2, mockAdminClient, mockHandlers);
    assertEquals(response_cp_2.status, 401);
    const body_cp_2 = await response_cp_2.json();
    assertEquals(body_cp_2.error, "Auth error for clone");
    assertEquals(cloneSpy.calls.length, 0);

    // Case 3: Auth token, getUser succeeds, but no projectId
    const successfulGetUserMock_cp_c3 = spy(async () => ({ data: { user: mockUser }, error: null })); 
    mockAdminClient = mockSupabaseClient({ auth: { getUser: successfulGetUserMock_cp_c3 as any } });
    const req_cp_3 = createJsonRequest("cloneProject", { newProjectName: "Cloned" }, "valid-token-for-mock"); 
    const response_cp_3 = await handleRequest(req_cp_3, mockAdminClient, mockHandlers);
    assertEquals(response_cp_3.status, 400);
    const body_cp_3 = await response_cp_3.json();
    assertEquals(body_cp_3.error, "Invalid payload for cloneProject. Expected { projectId: string, newProjectName?: string }");
    assertEquals(cloneSpy.calls.length, 0);
    
    // Case 4: Auth token, getUser succeeds, projectId present
    capturedArgs = null; 
    const successfulGetUserMock_cp_c4 = spy(async () => ({ data: { user: mockUser }, error: null })); 
    mockAdminClient = mockSupabaseClient({ auth: { getUser: successfulGetUserMock_cp_c4 as any } });
    const clonePayload_cp_4 = { projectId: "orig-proj-123", newProjectName: "My Clone" };
    const req_cp_4 = createJsonRequest("cloneProject", clonePayload_cp_4, "valid-token-for-mock");
    const response_cp_4 = await handleRequest(req_cp_4, mockAdminClient, mockHandlers);
    assertEquals(response_cp_4.status, 201);
    assertEquals(cloneSpy.calls.length, 1);
    assertExists(capturedArgs);
    if(capturedArgs){
        assertEquals(capturedArgs[0], mockAdminClient);
        assertEquals(capturedArgs[1], clonePayload_cp_4.projectId);
        assertEquals(capturedArgs[2], clonePayload_cp_4.newProjectName);
        assertEquals(capturedArgs[3], mockUser.id);
    }
  });

  await t.step("JSON: exportProject requires projectId and authToken", async () => {
    let capturedArgs: any[] | null = null;
    const exportSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: { export_url: "http://example.com/export" }, status: 200 }; 
    });
    mockHandlers = { exportProject: exportSpy } as unknown as ActionHandlers;

    // Case 1: No auth token
    mockAdminClient = mockSupabaseClient();
    const req_ep_1 = createJsonRequest("exportProject", { projectId: "proj-to-export" });
    const response_ep_1 = await handleRequest(req_ep_1, mockAdminClient, mockHandlers);
    assertEquals(response_ep_1.status, 401);
    const body_ep_1 = await response_ep_1.json();
    assertEquals(body_ep_1.error, "User authentication required for exportProject.");
    assertEquals(exportSpy.calls.length, 0);

    // Case 2: Auth token, but getUser fails
    const mockGetUserFails_ep = spy(async () => ({ data: { user: null }, error: createMockAuthError("Auth error for export", 401, "EXPORT_AUTH_ERROR") }));
    mockAdminClient = mockSupabaseClient({ auth: { getUser: mockGetUserFails_ep as any } });
    const req_ep_2 = createJsonRequest("exportProject", { projectId: "proj-to-export" }, "bad-token-export");
    const response_ep_2 = await handleRequest(req_ep_2, mockAdminClient, mockHandlers);
    assertEquals(response_ep_2.status, 401);
    const body_ep_2 = await response_ep_2.json();
    assertEquals(body_ep_2.error, "Auth error for export");
    assertEquals(exportSpy.calls.length, 0);

    // Case 3: Auth token, getUser succeeds, but no projectId
    const successfulGetUserMock_ep_c3 = spy(async () => ({ data: { user: mockUser }, error: null })); 
    mockAdminClient = mockSupabaseClient({ auth: { getUser: successfulGetUserMock_ep_c3 as any } });
    const req_ep_3 = createJsonRequest("exportProject", {}, "valid-token-for-mock"); 
    const response_ep_3 = await handleRequest(req_ep_3, mockAdminClient, mockHandlers);
    assertEquals(response_ep_3.status, 400);
    const body_ep_3 = await response_ep_3.json();
    assertEquals(body_ep_3.error, "Invalid payload for exportProject. Expected { projectId: string }");
    assertEquals(exportSpy.calls.length, 0);
    
    // Case 4: Auth token, getUser succeeds, projectId present
    capturedArgs = null; 
    const successfulGetUserMock_ep_c4 = spy(async () => ({ data: { user: mockUser }, error: null })); 
    mockAdminClient = mockSupabaseClient({ auth: { getUser: successfulGetUserMock_ep_c4 as any } });
    const exportPayload_ep_4 = { projectId: "proj-export-123" };
    const req_ep_4 = createJsonRequest("exportProject", exportPayload_ep_4, "valid-token-for-mock");
    const response_ep_4 = await handleRequest(req_ep_4, mockAdminClient, mockHandlers);
    assertEquals(response_ep_4.status, 200);
    assertEquals(exportSpy.calls.length, 1);
    assertExists(capturedArgs);
    if(capturedArgs){
        assertEquals(capturedArgs[0], mockAdminClient);
        assertEquals(capturedArgs[1], exportPayload_ep_4.projectId);
        assertEquals(capturedArgs[2], mockUser.id);
    }
  });

}); 