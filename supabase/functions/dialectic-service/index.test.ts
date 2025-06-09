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
import type { GenerateStageContributionsSuccessResponse, DialecticContribution, DialecticProject, /* DomainTagDescriptor */ } from "./dialectic.interface.ts"; 

// Mock SupabaseClient
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
            return { data: { user: { id: 'mock-user-id', email: 'mock@example.com' } as User }, error: null };
        }
        return { data: { user: null }, error: createMockAuthError("Mock: Invalid token", 401, 'INVALID_TOKEN') };
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
    name: 'AuthApiError', 
    __isAuthError: true,
  } as any as AuthError;
};

// Helper to create a mostly empty but type-compliant ActionHandlers mock
const createMockHandlers = (overrides?: Partial<ActionHandlers>): ActionHandlers => {
    const emptySpy = spy(async () => ({ error: { message: "Not implemented in mock", status: 501 } }));
    return {
        createProject: overrides?.createProject || emptySpy,
        listAvailableDomainTags: overrides?.listAvailableDomainTags || emptySpy,
        updateProjectDomainTag: overrides?.updateProjectDomainTag || emptySpy,
        getProjectDetails: overrides?.getProjectDetails || emptySpy,
        getContributionContentSignedUrlHandler: overrides?.getContributionContentSignedUrlHandler || emptySpy,
        startSession: overrides?.startSession || emptySpy,
        generateStageContributions: overrides?.generateStageContributions || emptySpy,
        listProjects: overrides?.listProjects || emptySpy,
        uploadProjectResourceFileHandler: overrides?.uploadProjectResourceFileHandler || emptySpy,
        listAvailableDomainOverlays: overrides?.listAvailableDomainOverlays || emptySpy,
        deleteProject: overrides?.deleteProject || emptySpy,
        cloneProject: overrides?.cloneProject || emptySpy,
        exportProject: overrides?.exportProject || emptySpy,
        ...overrides,
    } as ActionHandlers;
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
    const result = await isValidDomainTagDefaultFn(client, "test");
    assertEquals(result, false);
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
  const mockUser = { id: 'mock-user-id', email: 'mock@example.com' } as User;

  const createJsonRequest = (action: string, payload?: unknown, authToken?: string): Request => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    return new Request("http://localhost/test", {
      method: "POST",
      headers,
      body: payload ? JSON.stringify({ action, payload }) : JSON.stringify({ action }),
    });
  };

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
  
  await t.step("should handle CORS preflight request", async () => {
    const req = new Request("http://localhost/test", { method: "OPTIONS" });
    mockAdminClient = mockSupabaseClient();
    mockHandlers = createMockHandlers();
    const corsResponse = handleCorsPreflightRequest(req);
    if (corsResponse) { 
        const response = await handleRequest(req, mockAdminClient, mockHandlers);
        assertEquals(response.status, corsResponse.status);
    } else {
        const response = await handleRequest(req, mockAdminClient, mockHandlers);
        assertNotEquals(response.status, 200); 
    }
  });

  await t.step("Unsupported method should return 415", async () => {
    mockAdminClient = mockSupabaseClient();
    mockHandlers = createMockHandlers();
    const req = new Request("http://localhost/test", { method: "GET" });
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 415);
    const body = await response.json();
    assertEquals(body.error, "Unsupported request method or content type. Please use POST with application/json or multipart/form-data.");
  });

  // --- Multipart/form-data tests ---
  await t.step("Multipart: createProject should call correct handler with auth", async () => {
    let capturedArgs: any[] | null = null;
    const createProjectSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: { id: "proj-123" } as any, status: 201 }; 
    });
    mockHandlers = createMockHandlers({ createProject: createProjectSpy });
    mockAdminClient = mockSupabaseClient(); 
    const req = createFormDataRequest("createProject", {}, "valid-token-for-mock");
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 201);
    assertEquals(createProjectSpy.calls.length, 1);
    assertExists(capturedArgs, "createProject spy was called but args not captured");
    if (capturedArgs) {
        assertExists(capturedArgs[0]); 
        assertEquals((capturedArgs[0] as FormData).get("action"), "createProject");
        assertEquals(capturedArgs[1], mockAdminClient);
        assertEquals((capturedArgs[2] as User)?.id, mockUser.id); 
    }
  });
  
  await t.step("Multipart: createProject should return 401 if no auth token", async () => {
    const createProjectSpy = spy(async () => ({ data: { id: "proj-123" } as any, status: 201 }));
    mockHandlers = createMockHandlers({ createProject: createProjectSpy });
    mockAdminClient = mockSupabaseClient();
    const req = createFormDataRequest("createProject"); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 401);
    const body = await response.json();
    assertEquals(body.error, "User not authenticated"); 
    assertEquals(createProjectSpy.calls.length, 0);
  });

  await t.step("Multipart: uploadProjectResourceFile should call correct handler with auth", async () => {
    let capturedArgs: any[] | null = null;
    const uploadSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return { data: { id: "res-123" } as any, status: 200 }; 
    });
    mockHandlers = createMockHandlers({ uploadProjectResourceFileHandler: uploadSpy });
    mockAdminClient = mockSupabaseClient(); 
    const req = createFormDataRequest("uploadProjectResourceFile", {}, "valid-token-for-mock");
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 200);
    assertEquals(uploadSpy.calls.length, 1);
    assertExists(capturedArgs);
    if (capturedArgs) {
        assertExists(capturedArgs[0]); 
        assertEquals((capturedArgs[0] as FormData).get("action"), "uploadProjectResourceFile");
        assertEquals(capturedArgs[1], mockAdminClient);
        assertEquals((capturedArgs[2] as User)?.id, mockUser.id); 
        assertExists(capturedArgs[3]); 
    }
  });

  await t.step("Multipart: unknown action should return 400", async () => {
    mockHandlers = createMockHandlers(); 
    mockAdminClient = mockSupabaseClient();
    const actionName = "unknownMultipartAction";
    const req = createFormDataRequest(actionName, {}, "valid-token-for-mock"); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error, `Unknown action '${actionName}' for multipart/form-data.`);
  });

  // --- Application/json tests ---
  await t.step("JSON: listAvailableDomainTags should call correct handler (no auth needed)", async () => {
    let capturedArgs: any[] | null = null;
    const listTagsSpy = spy(async (...args: any[]) => { 
        capturedArgs = args;
        return [{ domain_tag: "test", description: "Mock Tag" }] as any[]; // Using any[] due to DomainTagDescriptor not being exported
    });
    mockHandlers = createMockHandlers({ listAvailableDomainTags: listTagsSpy });
    mockAdminClient = mockSupabaseClient();
    const reqPayload = { stageAssociation: "thesis" };
    const req = createJsonRequest("listAvailableDomainTags", reqPayload); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 200);
    assertEquals(listTagsSpy.calls.length, 1);
    if (listTagsSpy.calls.length > 0) {
        assertEquals(listTagsSpy.calls[0].args[0], mockAdminClient);
        assertEquals(listTagsSpy.calls[0].args[1], reqPayload);
    }
  });
  
  await t.step("JSON: listAvailableDomainOverlays requires stageAssociation (no auth needed)", async () => {
    const listOverlaysSpy = spy(async () => ([])); 
    mockHandlers = createMockHandlers({ listAvailableDomainOverlays: listOverlaysSpy });
    mockAdminClient = mockSupabaseClient();
    const req = createJsonRequest("listAvailableDomainOverlays", {}); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error, "Payload with 'stageAssociation' (string) is required for listAvailableDomainOverlays");
    assertEquals(listOverlaysSpy.calls.length, 0); 
  });

  await t.step("JSON: updateProjectDomainTag requires auth; then payload", async () => {
    const updateTagSpy = spy(async () => ({ data: { id: "proj-1" } as any, status: 200})); 
    mockHandlers = createMockHandlers({ updateProjectDomainTag: updateTagSpy });
    
    // Case 1: No auth token
    mockAdminClient = mockSupabaseClient();
    const req_no_auth = createJsonRequest("updateProjectDomainTag"); 
    const response_no_auth = await handleRequest(req_no_auth, mockAdminClient, mockHandlers);
    assertEquals(response_no_auth.status, 401);
    const body_no_auth = await response_no_auth.json();
    assertEquals(body_no_auth.error, "User not authenticated");
    assertEquals(updateTagSpy.calls.length, 0);

    // Case 2: Auth token present, but no payload
    mockAdminClient = mockSupabaseClient(); 
    const req_no_payload = createJsonRequest("updateProjectDomainTag", undefined, "valid-token-for-mock");
    const response_no_payload = await handleRequest(req_no_payload, mockAdminClient, mockHandlers);
    assertEquals(response_no_payload.status, 400);
    const body_no_payload = await response_no_payload.json();
    assertEquals(body_no_payload.error, "Payload is required for updateProjectDomainTag");
    assertEquals(updateTagSpy.calls.length, 0); 
  });
  
   await t.step("JSON: deleteProject requires auth and projectId", async () => {
    let capturedArgsDelete: any[] | null = null;
    const deleteProjectSpy = spy(async (...args: any[]) => { 
        capturedArgsDelete = args;
        return { data: null, status: 204 }; 
    });
    mockHandlers = createMockHandlers({ deleteProject: deleteProjectSpy });
    
    // Case 1: No auth token
    mockAdminClient = mockSupabaseClient(); 
    const req_dp_1 = createJsonRequest("deleteProject", { projectId: "proj-123" });
    const response_dp_1 = await handleRequest(req_dp_1, mockAdminClient, mockHandlers);
    assertEquals(response_dp_1.status, 401);
    const body_dp_1 = await response_dp_1.json();
    assertEquals(body_dp_1.error, "User not authenticated"); 
    assertEquals(deleteProjectSpy.calls.length, 0);
    
    // Case 2: Auth token present, but getUser fails (e.g. invalid token)
    mockAdminClient = mockSupabaseClient(); 
    const req_dp_2 = createJsonRequest("deleteProject", { projectId: "proj-123" }, "invalid-token");
    const response_dp_2 = await handleRequest(req_dp_2, mockAdminClient, mockHandlers);
    assertEquals(response_dp_2.status, 401); 
    const body_dp_2 = await response_dp_2.json();
    assertEquals(body_dp_2.error, "Mock: Invalid token"); 
    assertEquals(deleteProjectSpy.calls.length, 0);

    // Case 3: Auth token present, getUser succeeds, but no projectId
    mockAdminClient = mockSupabaseClient(); 
    const req_dp_3 = createJsonRequest("deleteProject", {}, "valid-token-for-mock"); 
    const response_dp_3 = await handleRequest(req_dp_3, mockAdminClient, mockHandlers);
    assertEquals(response_dp_3.status, 400);
    const body_dp_3 = await response_dp_3.json();
    assertEquals(body_dp_3.error, "Invalid payload for deleteProject. Expected { projectId: string }");
    assertEquals(deleteProjectSpy.calls.length, 0);
    
    // Case 4: Auth token present, getUser succeeds, projectId present
    capturedArgsDelete = null; 
    mockAdminClient = mockSupabaseClient(); 
    const reqPayload_dp_4 = { projectId: "proj-123" };
    const req_dp_4 = createJsonRequest("deleteProject", reqPayload_dp_4, "valid-token-for-mock");
    const response_dp_4 = await handleRequest(req_dp_4, mockAdminClient, mockHandlers);
    assertEquals(response_dp_4.status, 204); 
    assertEquals(deleteProjectSpy.calls.length, 1);
    assertExists(capturedArgsDelete, "deleteProject spy was called but args not captured in case 4");
    if(capturedArgsDelete) {
        assertEquals(capturedArgsDelete[0], mockAdminClient);
        assertEquals(capturedArgsDelete[1], reqPayload_dp_4); 
        assertEquals(capturedArgsDelete[2], mockUser.id);
    }
  });

  await t.step("JSON: unknown action should return 400", async () => {
    mockHandlers = createMockHandlers(); 
    mockAdminClient = mockSupabaseClient();
    const actionName = "unknownJsonAction";
    const req = createJsonRequest(actionName, {}, "valid-token-for-mock"); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error, `Unknown action '${actionName}' for application/json.`);
  });
  
  await t.step("Handler error (returns ServiceError) should be caught", async () => {
    const errorMessage = "Handler exploded!";
    const errorStatus = 503;
    const errorCode = "HANDLER_SELF_DESTRUCT";
    
    const listProjectsErrorSpy = spy(async () => { 
        return { error: { message: errorMessage, status: errorStatus, code: errorCode }  as ServiceError };
    });
    mockHandlers = createMockHandlers({ listProjects: listProjectsErrorSpy });
    mockAdminClient = mockSupabaseClient(); 
    const req = createJsonRequest("listProjects", undefined, "valid-token-for-mock"); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, errorStatus);
    const body = await response.json();
    assertEquals(body.error, errorMessage);
    assertEquals(listProjectsErrorSpy.calls.length, 1);
  });

  await t.step("Handler error (returns ServiceError) for listProjects should return 401 if no auth", async () => {
    const listProjectsErrorSpy = spy(async () => ({ error: { message: "some error", status: 500 }}));
    mockHandlers = createMockHandlers({ listProjects: listProjectsErrorSpy });
    mockAdminClient = mockSupabaseClient();
    const req = createJsonRequest("listProjects"); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 401);
    const body = await response.json();
    assertEquals(body.error, "User not authenticated");
    assertEquals(listProjectsErrorSpy.calls.length, 0);
  });
  
  await t.step("Unexpected handler exception should return 500", async () => {
    const errorMessage = "Totally unexpected JS error";
    const listProjectsErrorSpy = spy(async () => { throw new Error(errorMessage); }); 
    mockHandlers = createMockHandlers({ listProjects: listProjectsErrorSpy });
    mockAdminClient = mockSupabaseClient(); 
    const req = createJsonRequest("listProjects", undefined, "valid-token-for-mock"); 
    const response = await handleRequest(req, mockAdminClient, mockHandlers);
    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(body.error, errorMessage);
    assertEquals(listProjectsErrorSpy.calls.length, 1);
  });

  // --- Tests for remaining JSON actions (Scope variables locally for each case) ---

  await t.step("JSON: getProjectDetails requires auth; then projectId", async () => {
    let capturedArgsGPD: any[] | null = null;
    const getDetailsSpy = spy(async (...args: any[]) => { 
        capturedArgsGPD = args; 
        return { data: { id: "proj-1" } as any, status: 200 }; 
    });
    mockHandlers = createMockHandlers({ getProjectDetails: getDetailsSpy });

    // Case 0: No auth
    mockAdminClient = mockSupabaseClient();
    const req_gpd_0 = createJsonRequest("getProjectDetails", { projectId: "proj-xyz" }); 
    const response_gpd_0 = await handleRequest(req_gpd_0, mockAdminClient, mockHandlers);
    assertEquals(response_gpd_0.status, 401);
    const body_gpd_0 = await response_gpd_0.json();
    assertEquals(body_gpd_0.error, "User not authenticated");
    assertEquals(getDetailsSpy.calls.length, 0);

    // Case 1: Missing projectId (with auth)
    mockAdminClient = mockSupabaseClient(); 
    const req_gpd_1 = createJsonRequest("getProjectDetails", { foo: "bar" }, "valid-token-for-mock");
    const response_gpd_1 = await handleRequest(req_gpd_1, mockAdminClient, mockHandlers);
    assertEquals(response_gpd_1.status, 400);
    const body_gpd_1 = await response_gpd_1.json();
    assertEquals(body_gpd_1.error, "Invalid or missing projectId in payload for getProjectDetails action.");
    assertEquals(getDetailsSpy.calls.length, 0);

    // Case 2: projectId is not a string (with auth)
    const req_gpd_2 = createJsonRequest("getProjectDetails", { projectId: 123 }, "valid-token-for-mock");
    const response_gpd_2 = await handleRequest(req_gpd_2, mockAdminClient, mockHandlers);
    assertEquals(response_gpd_2.status, 400);
    const body_gpd_2 = await response_gpd_2.json();
    assertEquals(body_gpd_2.error, "Invalid or missing projectId in payload for getProjectDetails action.");
    assertEquals(getDetailsSpy.calls.length, 0);

    // Case 3: Valid projectId (with auth)
    capturedArgsGPD = null; 
    const payload_gpd_3 = { projectId: "proj-xyz" }; 
    const req_gpd_3 = createJsonRequest("getProjectDetails", payload_gpd_3, "valid-token-for-mock");
    const response_gpd_3 = await handleRequest(req_gpd_3, mockAdminClient, mockHandlers);
    assertEquals(response_gpd_3.status, 200);
    assertEquals(getDetailsSpy.calls.length, 1);
    assertExists(capturedArgsGPD);
    if(capturedArgsGPD){
        assertEquals(capturedArgsGPD[0], payload_gpd_3); 
        assertEquals(capturedArgsGPD[1], mockAdminClient); 
        assertEquals((capturedArgsGPD[2] as User)?.id, mockUser.id); 
    }
  });

  await t.step("JSON: startSession requires auth; then payload", async () => {
    let capturedArgsSS: any[] | null = null;
    const startSessionSpy = spy(async (...args: any[]) => { 
        capturedArgsSS = args; 
        return { data: { id: "sess-1" } as any, status: 201 }; 
    });
    mockHandlers = createMockHandlers({ startSession: startSessionSpy });
    
    // Case 0: No auth
    mockAdminClient = mockSupabaseClient();
    const req_ss_0 = createJsonRequest("startSession", { projectId: "proj-abc" }); 
    const response_ss_0 = await handleRequest(req_ss_0, mockAdminClient, mockHandlers);
    assertEquals(response_ss_0.status, 401);
    const body_ss_0 = await response_ss_0.json();
    assertEquals(body_ss_0.error, "User not authenticated");
    assertEquals(startSessionSpy.calls.length, 0);

    // Case 1: No payload (with auth)
    mockAdminClient = mockSupabaseClient(); 
    const req_ss_1 = createJsonRequest("startSession", undefined, "valid-token-for-mock");
    const response_ss_1 = await handleRequest(req_ss_1, mockAdminClient, mockHandlers);
    assertEquals(response_ss_1.status, 400);
    const body_ss_1 = await response_ss_1.json();
    assertEquals(body_ss_1.error, "Payload is required for startSession");
    assertEquals(startSessionSpy.calls.length, 0);

    // Case 2: Valid payload (with auth)
    capturedArgsSS = null; 
    const payload_ss_2 = { projectId: "proj-abc", initialPrompt: "Test prompt" }; 
    const req_ss_2 = createJsonRequest("startSession", payload_ss_2, "valid-token-for-mock");
    const response_ss_2 = await handleRequest(req_ss_2, mockAdminClient, mockHandlers);
    assertEquals(response_ss_2.status, 201);
    assertEquals(startSessionSpy.calls.length, 1);
    assertExists(capturedArgsSS);
    if(capturedArgsSS){
        assertEquals((capturedArgsSS[0] as User)?.id, mockUser.id); 
        assertEquals(capturedArgsSS[1], mockAdminClient); 
        assertEquals(capturedArgsSS[2], payload_ss_2); 
        assertExists(capturedArgsSS[3]); 
    }
  });

  await t.step("JSON: generateContributions requires auth, sessionId, and token passed to handler", async () => {
    let capturedArgsGC: any[] | null = null;
    const genContributionsSpy = spy(async (...args: any[]) => {
        capturedArgsGC = args;
        const mockResponseData: GenerateStageContributionsSuccessResponse = {
            message: "Mock contributions generated",
            sessionId: (args[1] as {sessionId: string}).sessionId,
            status: "completed",
            contributions: [] as DialecticContribution[],
        };
        return { data: mockResponseData, success: true, status: 200 };
    });
    mockHandlers = createMockHandlers({ generateStageContributions: genContributionsSpy });

    // Case 0: No auth token (and no payload)
    mockAdminClient = mockSupabaseClient(); 
    const req_gc_0 = createJsonRequest("generateContributions");
    const response_gc_0 = await handleRequest(req_gc_0, mockAdminClient, mockHandlers);
    assertEquals(response_gc_0.status, 401); 
    const body_gc_0 = await response_gc_0.json();
    assertEquals(body_gc_0.error, "User not authenticated");
    assertEquals(genContributionsSpy.calls.length, 0);

    // Case 1: Auth token, but no payload 
    mockAdminClient = mockSupabaseClient();
    const req_gc_1 = createJsonRequest("generateContributions", undefined, "valid-token-for-mock");
    const response_gc_1 = await handleRequest(req_gc_1, mockAdminClient, mockHandlers);
    assertEquals(response_gc_1.status, 400); 
    const body_gc_1 = await response_gc_1.json();
    assertEquals(body_gc_1.error, "Payload with 'sessionId' (string) is required for generateContributions");
    assertEquals(genContributionsSpy.calls.length, 0);

    // Case 2: Auth token, payload missing sessionId
    const req_gc_2 = createJsonRequest("generateContributions", { stage: "thesis" }, "valid-token-for-mock");
    const response_gc_2 = await handleRequest(req_gc_2, mockAdminClient, mockHandlers);
    assertEquals(response_gc_2.status, 400); 
    const body_gc_2 = await response_gc_2.json();
    assertEquals(body_gc_2.error, "Payload with 'sessionId' (string) is required for generateContributions");
    assertEquals(genContributionsSpy.calls.length, 0);
    
    // Case 3: Valid payload and good authToken (Success Path)
    capturedArgsGC = null; 
    mockHandlers = createMockHandlers({ generateStageContributions: genContributionsSpy }); 
    mockAdminClient = mockSupabaseClient(); 
    const goodToken_gc = "valid-token-for-mock";
    const payload_gc_5 = { sessionId: "sess-xyz", stage: "thesis" }; 
    const req_gc_5 = createJsonRequest("generateContributions", payload_gc_5, goodToken_gc);
    const response_gc_5 = await handleRequest(req_gc_5, mockAdminClient, mockHandlers);
    
    assertEquals(response_gc_5.status, 200); 
    assertEquals(genContributionsSpy.calls.length, 1); 
    assertExists(capturedArgsGC);
    if(capturedArgsGC){
        assertEquals(capturedArgsGC[0], mockAdminClient); 
        const expectedPayloadToHandler = { sessionId: payload_gc_5.sessionId, stage: "thesis" };
        assertEquals(capturedArgsGC[1], expectedPayloadToHandler); 
        assertEquals(capturedArgsGC[2], goodToken_gc); 
        assertExists(capturedArgsGC[3]); 
    }
  });

  await t.step("JSON: getContributionContentSignedUrl requires auth; then contributionId", async () => {
    let capturedArgsMainSpyGCS: any[] | null = null;
    const getUrlSpy = spy(async (...args: any[]) => { 
        capturedArgsMainSpyGCS = args;
        return { data: { signedUrl: "http://example.com/url" }, status: 200 }; 
    });
    mockHandlers = createMockHandlers({ getContributionContentSignedUrlHandler: getUrlSpy });

    // Case 0: No auth
    mockAdminClient = mockSupabaseClient();
    const req_gcs_0 = createJsonRequest("getContributionContentSignedUrl", { contributionId: "c-123" }); 
    const response_gcs_0 = await handleRequest(req_gcs_0, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_0.status, 401);
    const body_gcs_0 = await response_gcs_0.json();
    assertEquals(body_gcs_0.error, "User not authenticated");
    assertEquals(getUrlSpy.calls.length, 0);
    
    // Case 1: Missing contributionId (with token)
    const req_gcs_1 = createJsonRequest("getContributionContentSignedUrl", { foo: "bar" }, "valid-token-for-mock");
    const response_gcs_1 = await handleRequest(req_gcs_1, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_1.status, 400);
    const body_gcs_1 = await response_gcs_1.json();
    assertEquals(body_gcs_1.error, "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }");
    assertEquals(getUrlSpy.calls.length, 0); 

    // Case 2: contributionId not a string (with token)
    const req_gcs_2 = createJsonRequest("getContributionContentSignedUrl", { contributionId: 123 }, "valid-token-for-mock");
    const response_gcs_2 = await handleRequest(req_gcs_2, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_2.status, 400);
    const body_gcs_2 = await response_gcs_2.json();
    assertEquals(body_gcs_2.error, "Invalid payload for getContributionContentSignedUrl. Expected { contributionId: string }");
    assertEquals(getUrlSpy.calls.length, 0); 

    // Case 3: Valid payload and auth token (handler uses getUserFn internally)
    capturedArgsMainSpyGCS = null; 
    mockAdminClient = mockSupabaseClient(); 
    const payload_gcs_4 = { contributionId: "contrib-xyz" };
    const req_gcs_4 = createJsonRequest("getContributionContentSignedUrl", payload_gcs_4, "valid-token-for-mock");
    const response_gcs_4 = await handleRequest(req_gcs_4, mockAdminClient, mockHandlers);
    assertEquals(response_gcs_4.status, 200);
    assertEquals(getUrlSpy.calls.length, 1); 
    assertExists(capturedArgsMainSpyGCS);
    if(capturedArgsMainSpyGCS){
        assertExists(capturedArgsMainSpyGCS[0]); 
        assertEquals(capturedArgsMainSpyGCS[1], mockAdminClient); 
        assertExists(capturedArgsMainSpyGCS[2]); 
        assertExists(capturedArgsMainSpyGCS[3]); 
        assertEquals(capturedArgsMainSpyGCS[4], payload_gcs_4); 
    }
  });

  await t.step("JSON: cloneProject requires auth; then projectId", async () => {
    let capturedArgsClone: any[] | null = null;
    const cloneSpy = spy(async (...args: any[]) => { 
        capturedArgsClone = args;
        // Explicitly create a structure that matches what CloneProjectResult seems to expect for its data field
        const mockProjectDataForCloneResult = {
            id: "proj-clone",
            user_id: mockUser.id,
            project_name: (args[2] as string) || "Cloned Project",
            initial_user_prompt: "Cloned prompt",
            initial_prompt_resource_id: null, // from DialecticProject (optional)
            selected_domain_tag: null, // from DialecticProject
            selected_domain_overlay_id: null, // from DialecticProject (optional)
            repo_url: null, // from DialecticProject
            status: "active", // from DialecticProject
            created_at: new Date().toISOString(), // from DialecticProject
            updated_at: new Date().toISOString(), // from DialecticProject
            sessions: [], // from DialecticProject (optional)
            user_domain_overlay_values: {}, // The field linter expects for CloneProjectResult's data
        };
        return { data: mockProjectDataForCloneResult as any, error: null, status: 201 }; // Cast to any to bypass strict DialecticProject type for now
    });
    mockHandlers = createMockHandlers({ cloneProject: cloneSpy });

    // Case 0: No auth token
    mockAdminClient = mockSupabaseClient();
    const req_cp_0 = createJsonRequest("cloneProject", { projectId: "orig-proj" });
    const response_cp_0 = await handleRequest(req_cp_0, mockAdminClient, mockHandlers);
    assertEquals(response_cp_0.status, 401);
    const body_cp_0 = await response_cp_0.json();
    assertEquals(body_cp_0.error, "User not authenticated");
    assertEquals(cloneSpy.calls.length, 0);

    // Case 1: Auth token, but getUser fails (e.g. invalid token)
    mockAdminClient = mockSupabaseClient(); 
    const req_cp_2 = createJsonRequest("cloneProject", { projectId: "orig-proj" }, "bad-token");
    const response_cp_2 = await handleRequest(req_cp_2, mockAdminClient, mockHandlers);
    assertEquals(response_cp_2.status, 401);
    const body_cp_2 = await response_cp_2.json();
    assertEquals(body_cp_2.error, "Mock: Invalid token");
    assertEquals(cloneSpy.calls.length, 0);

    // Case 2: Auth token, getUser succeeds, but no projectId
    mockAdminClient = mockSupabaseClient(); 
    const req_cp_3 = createJsonRequest("cloneProject", { newProjectName: "Cloned" }, "valid-token-for-mock"); 
    const response_cp_3 = await handleRequest(req_cp_3, mockAdminClient, mockHandlers);
    assertEquals(response_cp_3.status, 400);
    const body_cp_3 = await response_cp_3.json();
    assertEquals(body_cp_3.error, "Invalid payload for cloneProject. Expected { projectId: string, newProjectName?: string }");
    assertEquals(cloneSpy.calls.length, 0);
    
    // Case 3: Auth token, getUser succeeds, projectId present
    capturedArgsClone = null; 
    mockAdminClient = mockSupabaseClient(); 
    const clonePayload_cp_4 = { projectId: "orig-proj-123", newProjectName: "My Clone" };
    const req_cp_4 = createJsonRequest("cloneProject", clonePayload_cp_4, "valid-token-for-mock");
    const response_cp_4 = await handleRequest(req_cp_4, mockAdminClient, mockHandlers);
    assertEquals(response_cp_4.status, 201);
    assertEquals(cloneSpy.calls.length, 1);
    assertExists(capturedArgsClone);
    if(capturedArgsClone){
        assertEquals(capturedArgsClone[0], mockAdminClient);
        assertEquals(capturedArgsClone[1], clonePayload_cp_4.projectId);
        assertEquals(capturedArgsClone[2], clonePayload_cp_4.newProjectName);
        assertEquals(capturedArgsClone[3], mockUser.id);
    }
  });

  await t.step("JSON: exportProject requires auth; then projectId", async () => {
    let capturedArgsExport: any[] | null = null;
    const exportSpy = spy(async (...args: any[]) => { 
        capturedArgsExport = args;
        return { data: { export_url: "http://example.com/export" }, status: 200 }; 
    });
    mockHandlers = createMockHandlers({ exportProject: exportSpy });

    // Case 0: No auth token
    mockAdminClient = mockSupabaseClient();
    const req_ep_0 = createJsonRequest("exportProject", { projectId: "proj-to-export" });
    const response_ep_0 = await handleRequest(req_ep_0, mockAdminClient, mockHandlers);
    assertEquals(response_ep_0.status, 401);
    const body_ep_0 = await response_ep_0.json();
    assertEquals(body_ep_0.error, "User not authenticated");
    assertEquals(exportSpy.calls.length, 0);

    // Case 1: Auth token, but getUser fails
    mockAdminClient = mockSupabaseClient(); 
    const req_ep_2 = createJsonRequest("exportProject", { projectId: "proj-to-export" }, "bad-token-export");
    const response_ep_2 = await handleRequest(req_ep_2, mockAdminClient, mockHandlers);
    assertEquals(response_ep_2.status, 401);
    const body_ep_2 = await response_ep_2.json();
    assertEquals(body_ep_2.error, "Mock: Invalid token");
    assertEquals(exportSpy.calls.length, 0);

    // Case 2: Auth token, getUser succeeds, but no projectId
    mockAdminClient = mockSupabaseClient(); 
    const req_ep_3 = createJsonRequest("exportProject", {}, "valid-token-for-mock"); 
    const response_ep_3 = await handleRequest(req_ep_3, mockAdminClient, mockHandlers);
    assertEquals(response_ep_3.status, 400);
    const body_ep_3 = await response_ep_3.json();
    assertEquals(body_ep_3.error, "Invalid payload for exportProject. Expected { projectId: string }");
    assertEquals(exportSpy.calls.length, 0);
    
    // Case 3: Auth token, getUser succeeds, projectId present
    capturedArgsExport = null; 
    mockAdminClient = mockSupabaseClient(); 
    const exportPayload_ep_4 = { projectId: "proj-export-123" };
    const req_ep_4 = createJsonRequest("exportProject", exportPayload_ep_4, "valid-token-for-mock");
    const response_ep_4 = await handleRequest(req_ep_4, mockAdminClient, mockHandlers);
    assertEquals(response_ep_4.status, 200);
    assertEquals(exportSpy.calls.length, 1);
    assertExists(capturedArgsExport);
    if(capturedArgsExport){
        assertEquals(capturedArgsExport[0], mockAdminClient);
        assertEquals(capturedArgsExport[1], exportPayload_ep_4.projectId);
        assertEquals(capturedArgsExport[2], mockUser.id);
    }
  });
}); 