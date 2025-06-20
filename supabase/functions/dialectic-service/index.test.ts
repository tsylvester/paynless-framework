import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.208.0/testing/mock.ts";
import {
  isValidDomainDefaultFn,
  createSignedUrlDefaultFn,
  handleRequest,
  type ActionHandlers,
} from "./index.ts";
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js';
import type { ServiceError } from '../_shared/types.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflightRequest,
} from "../_shared/cors-headers.ts";
import type {
  DialecticProject,
  DialecticSession,
  CloneProjectSuccessResponse,
  DomainOverlayDescriptor,
  GetProjectResourceContentResponse,
  GenerateContributionsSuccessResponse,
  CloneProjectPayload,
} from "./dialectic.interface.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import { CloneProjectResult } from "./cloneProject.ts";
import { Json } from "../types_db.ts";

// #region MOCK DATA
// To satisfy the strict types from dialectic.interface.ts
const mockUser: User = {
  id: 'test-user-id',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

// This mock needs to be compatible with both DialecticProject and the DB's DialecticProjectRow
const mockProject = {
  id: 'proj-123',
  user_id: 'user-123',
  project_name: 'Test Project',
  initial_user_prompt: 'Test prompt',
  selected_domain_id: 'domain-1',
  repo_url: null as Json,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  initial_prompt_resource_id: null,
  selected_domain_overlay_id: null,
  // Add missing properties from DB row type
  process_template_id: null,
  user_domain_overlay_values: null as Json,
};

const mockSession: DialecticSession = {
    id: 'sess-pQR141',
    project_id: mockProject.id,
    session_description: 'A test session',
    user_input_reference_url: null,
    iteration_count: 0,
    selected_model_catalog_ids: ['model-1'],
    status: 'active',
    associated_chat_id: null,
    current_stage_id: 'stage-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

// #endregion

// Helper to create a mostly empty but type-compliant ActionHandlers mock
const createMockHandlers = (overrides?: Partial<ActionHandlers>): ActionHandlers => {
    return {
        createProject: overrides?.createProject || (() => Promise.resolve({ data: mockProject as any, status: 201 })),
        listAvailableDomains: overrides?.listAvailableDomains || (() => Promise.resolve([])),
        updateProjectDomain: overrides?.updateProjectDomain || (() => Promise.resolve({ data: mockProject as any })),
        getProjectDetails: overrides?.getProjectDetails || (() => Promise.resolve({ data: mockProject as any })),
        getContributionContentSignedUrlHandler: overrides?.getContributionContentSignedUrlHandler || (() => Promise.resolve({ data: { signedUrl: '' }})),
        startSession: overrides?.startSession || (() => Promise.resolve({ data: mockSession as any })),
        generateContributions: overrides?.generateContributions || (() => Promise.resolve({ success: false, error: { message: "Not implemented" } })),
        listProjects: overrides?.listProjects || (() => Promise.resolve({ data: [mockProject] as any })),
        listAvailableDomainOverlays: overrides?.listAvailableDomainOverlays || (() => Promise.resolve([])),
        deleteProject: overrides?.deleteProject || (() => Promise.resolve({ status: 200 })),
        cloneProject: overrides?.cloneProject || (() => Promise.resolve({ data: mockProject as any, error: null, status: 201 })),
        exportProject: overrides?.exportProject || (() => Promise.resolve({ data: { export_url: '' }})),
        getProjectResourceContent: overrides?.getProjectResourceContent || (() => Promise.resolve({ data: { fileName: '', mimeType: '', content: '' }})),
        saveContributionEdit: overrides?.saveContributionEdit || (() => Promise.resolve({ data: {} as any, status: 200 })),
        submitStageResponses: overrides?.submitStageResponses || (() => Promise.resolve({ data: {} as any, status: 200 })),
        listDomains: overrides?.listDomains || (() => Promise.resolve({ data: [] })),
        fetchProcessTemplate: overrides?.fetchProcessTemplate || (() => Promise.resolve({ data: {} as any, status: 200 })),
        updateSessionModels: overrides?.updateSessionModels || (() => Promise.resolve({ data: mockSession as any, status: 200 })),
        ...overrides,
    } as ActionHandlers;
};

// Wrapper for tests that need Supabase env vars
const withSupabaseEnv = (name: string, testFn: (t: Deno.TestContext) => Promise<void>) => {
  Deno.test(name, async (t) => {
    const originalUrl = Deno.env.get("SUPABASE_URL");
    const originalAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const originalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    Deno.env.set("SUPABASE_URL", "http://localhost:54321");
    Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

    try {
      await testFn(t);
    } finally {
      if (originalUrl) Deno.env.set("SUPABASE_URL", originalUrl); else Deno.env.delete("SUPABASE_URL");
      if (originalAnonKey) Deno.env.set("SUPABASE_ANON_KEY", originalAnonKey); else Deno.env.delete("SUPABASE_ANON_KEY");
      if (originalServiceKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", originalServiceKey); else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    }
  });
};

Deno.test("isValidDomainDefaultFn - Unit Tests", async (t) => {
  let mockSupabase: MockSupabaseClientSetup;
  
  await t.step("should return true if domain is null", async () => {
    mockSupabase = createMockSupabaseClient();
    const result = await isValidDomainDefaultFn(mockSupabase.client as any, null as unknown as string);
    assertEquals(result, true);
  });

  await t.step("should return true if domain_id exists", async () => {
    mockSupabase = createMockSupabaseClient('test-user', {
      genericMockResults: {
        domain_specific_prompt_overlays: {
          select: { data: [{ domain_id: "test" }] },
        },
      },
    });
    const result = await isValidDomainDefaultFn(mockSupabase.client as any, "test");
    assertEquals(result, true);
  });

  await t.step("should return false if domain_id does not exist", async () => {
    mockSupabase = createMockSupabaseClient('test-user', {
      genericMockResults: {
        domain_specific_prompt_overlays: {
          select: { data: null },
        },
      },
    });
    const result = await isValidDomainDefaultFn(mockSupabase.client as any, "nonexistent");
    assertEquals(result, false);
  });

  await t.step("should return false and log an error if db query fails", async () => {
     mockSupabase = createMockSupabaseClient('test-user', {
      genericMockResults: {
        domain_specific_prompt_overlays: {
          select: { data: null, error: new Error("DB error") },
        },
      },
    });
    const result = await isValidDomainDefaultFn(mockSupabase.client as any, "test");
    assertEquals(result, false);
  });
});

Deno.test("createSignedUrlDefaultFn - Unit Tests", async (t) => {
  let mockSupabase: MockSupabaseClientSetup;

  await t.step("should return signedUrl if successful", async () => {
    const mockSignedUrl = "http://supabase.io/signed/url";
    mockSupabase = createMockSupabaseClient('test-user', {
      storageMock: {
        createSignedUrlResult: { data: { signedUrl: mockSignedUrl }, error: null }
      }
    });
    const { signedUrl, error } = await createSignedUrlDefaultFn(mockSupabase.client as any, "bucket", "path", 3600);
    assertEquals(signedUrl, mockSignedUrl);
    assertEquals(error, null);
  });

  await t.step("should return error if createSignedUrl fails", async () => {
    mockSupabase = createMockSupabaseClient('test-user', {
      storageMock: {
        createSignedUrlResult: { data: null, error: new Error("Storage error") }
      }
    });
    const { signedUrl, error } = await createSignedUrlDefaultFn(mockSupabase.client as any, "bucket", "path", 3600);
    assertEquals(signedUrl, null);
    assertExists(error);
  });
});

const createJsonRequest = (
  action: string,
  payload?: unknown,
  authToken?: string
): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const body = { action, payload };
  return new Request("http://localhost/test", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

// --- Tests for handleRequest ---
withSupabaseEnv("handleRequest - Routing and Dispatching", async (t) => {
    let mockHandlers: ActionHandlers;

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

    const createInvalidJsonRequest = (authToken?: string): Request => {
        const headers = new Headers({ "Content-Type": "application/json" });
        if (authToken) {
            headers.set("Authorization", `Bearer ${authToken}`);
        }
        return new Request("http://localhost/test", {
            method: "POST",
            headers,
            body: "invalid json",
        });
    };
  
    await t.step("should handle CORS preflight request", async () => {
      const req = new Request("http://localhost/test", { method: "OPTIONS" });
      mockHandlers = createMockHandlers();
      const { client: mockUserClient } = createMockSupabaseClient();
      const { client: mockAdminClient } = createMockSupabaseClient();
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );
      assertEquals(response.status, 204); 
    });

    await t.step("should return 415 for unsupported content type", async () => {
      const req = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "test",
      });
      mockHandlers = createMockHandlers();
      const { client: mockUserClient } = createMockSupabaseClient();
      const { client: mockAdminClient } = createMockSupabaseClient();
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );
      assertEquals(response.status, 415);
      const err = await response.json();
      assert(err.error.startsWith("Unsupported Content-Type"));
    });
    
    await t.step("should handle critical errors gracefully", async () => {
        const req = createInvalidJsonRequest(); 
        mockHandlers = createMockHandlers();
        const { client: mockUserClient } = createMockSupabaseClient();
        const { client: mockAdminClient } = createMockSupabaseClient();
       
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 500);
        const body = await response.json();
        assertEquals(body.error, "An internal server error occurred.");
    });

    await t.step("should correctly route multipart/form-data 'createProject' action", async () => {
      const createProjectSpy = spy((_formData, _dbClient, _user) => Promise.resolve({ data: mockProject, status: 201 }));
      mockHandlers = createMockHandlers({ createProject: createProjectSpy as any });

      const mockToken = "mock-jwt";
      const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
          getUserResult: { data: { user: mockUser }, error: null }
      });
      const { client: mockAdminClient } = createMockSupabaseClient();
      
      const req = createFormDataRequest('createProject', undefined, mockToken);
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );

      assertEquals(response.status, 201);
      assertEquals(createProjectSpy.calls.length, 1);
    });

    await t.step("should return 400 for unknown multipart action", async () => {
      const mockToken = "mock-jwt";
      const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
          getUserResult: { data: { user: mockUser }, error: null }
      });
      const { client: mockAdminClient } = createMockSupabaseClient();

      const req = createFormDataRequest("unknownAction", undefined, mockToken);
      mockHandlers = createMockHandlers();
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );
      
      assertEquals(response.status, 400);
      const body = await response.json();
      assert(body.error.startsWith("Unknown action"));
    });

    await t.step("should correctly route JSON 'listAvailableDomains' action (no auth needed)", async () => {
      const listSpy = spy(() => Promise.resolve([]));
      mockHandlers = createMockHandlers({ listAvailableDomains: listSpy as any });
      const { client: mockUserClient } = createMockSupabaseClient();
      const { client: mockAdminClient } = createMockSupabaseClient();
      const req = createJsonRequest("listAvailableDomains");
  
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );
        
      assertEquals(response.status, 200);
      assertEquals(listSpy.calls.length, 1);
    });

    await t.step("should correctly route JSON 'listProjects' action (auth needed)", async () => {
      const listSpy = spy(() => Promise.resolve({ data: [mockProject], status: 200 }));
      mockHandlers = createMockHandlers({ listProjects: listSpy });
      
      const mockToken = "mock-jwt";
      const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
        getUserResult: { data: { user: mockUser }, error: null }
      });
      const { client: mockAdminClient } = createMockSupabaseClient();

      const req = createJsonRequest("listProjects", undefined, mockToken);
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );

      assertEquals(response.status, 200);
      assertEquals(listSpy.calls.length, 1);
    });

    await t.step("should return 401 for auth-required JSON action without token", async () => {
      const listSpy = spy(() => Promise.resolve({ data: [mockProject], status: 200 }));
      mockHandlers = createMockHandlers({ listProjects: listSpy });
      const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
          getUserResult: { data: { user: null }, error: null } // No user returned
      });
      const { client: mockAdminClient } = createMockSupabaseClient();
      
      const req = createJsonRequest("listProjects"); // No token
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );
 
      assertEquals(response.status, 401);
      const body = await response.json();
      assertEquals(body.error, "User not authenticated");
      assertEquals(listSpy.calls.length, 0);
    });

    await t.step("should return 400 for unknown JSON action", async () => {
      const req = createJsonRequest("someUnknownAction");
      mockHandlers = createMockHandlers();
      const { client: mockUserClient } = createMockSupabaseClient();
      const { client: mockAdminClient } = createMockSupabaseClient();
      const response = await handleRequest(
        req,
        mockHandlers,
        mockUserClient as any,
        mockAdminClient as any
      );
      assertEquals(response.status, 400);
      const body = await response.json();
      assertEquals(body.error, "Unknown action for application/json.");
    });
});

withSupabaseEnv("handleRequest - listAvailableDomains", async (t) => {
    await t.step("should call listAvailableDomains and return 200 on success", async () => {
        const mockDomains = [{ id: 'domain1', name: 'Test Domain' }];
        const listSpy = spy(() => Promise.resolve(mockDomains));
        const mockHandlers = createMockHandlers({ listAvailableDomains: listSpy as any });
        
        const { client: mockUserClient } = createMockSupabaseClient();
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("listAvailableDomains");
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body, mockDomains);
        assertEquals(listSpy.calls.length, 1);
    });

    await t.step("should return error if listAvailableDomains returns an error", async () => {
        const error: ServiceError = { message: "DB Error", status: 500, code: 'DB_ERROR' };
        const listSpy = spy(() => Promise.resolve({ error }));
        const mockHandlers = createMockHandlers({ listAvailableDomains: listSpy as any });
        
        const { client: mockUserClient } = createMockSupabaseClient();
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("listAvailableDomains");
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 500);
        const responseBody = await response.json();
        assertEquals(responseBody.error, error.message);
        assertEquals(listSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - listAvailableDomainOverlays", async (t) => {
    await t.step("should call listAvailableDomainOverlays and return 200 on success", async () => {
        const mockOverlays: DomainOverlayDescriptor[] = [{ id: 'overlay1', domainId: 'domain1', description: 'Test Overlay', stageAssociation: 'test', overlay_values: null }];
        const listSpy = spy(() => Promise.resolve(mockOverlays));
        const mockHandlers = createMockHandlers({ listAvailableDomainOverlays: listSpy });

        const { client: mockUserClient } = createMockSupabaseClient();
        const { client: mockAdminClient } = createMockSupabaseClient();
        const req = createJsonRequest('listAvailableDomainOverlays', { stageAssociation: 'test' });
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body, mockOverlays);
        assertEquals(listSpy.calls.length, 1);
    });

    await t.step("should return 400 if stageAssociation is missing", async () => {
        const listSpy = spy(() => Promise.resolve([]));
        const mockHandlers = createMockHandlers({ listAvailableDomainOverlays: listSpy });

        const { client: mockUserClient } = createMockSupabaseClient();
        const { client: mockAdminClient } = createMockSupabaseClient();
        const req = createJsonRequest('listAvailableDomainOverlays', {}); // Missing payload field
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 400);
        const responseBody = await response.json();
        assertEquals(responseBody.error, "stageAssociation is required.");
        assertEquals(listSpy.calls.length, 0);
    });
});

withSupabaseEnv("handleRequest - listProjects", async (t) => {
    await t.step("should call listProjects and return 200 on success", async () => {
        const listSpy = spy(() => Promise.resolve({ data: [mockProject], status: 200 }));
        const mockHandlers = createMockHandlers({ listProjects: listSpy });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("listProjects", undefined, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body, [mockProject]);
        assertEquals(listSpy.calls.length, 1);
    });

    await t.step("should return error if listProjects returns an error", async () => {
        const error: ServiceError = { message: "Auth Error", status: 403, code: 'AUTH_ERROR' };
        const listSpy = spy(() => Promise.resolve({ error, status: 403 }));
        const mockHandlers = createMockHandlers({ listProjects: listSpy });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("listProjects", undefined, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 403);
        const responseBody = await response.json();
        assertEquals(responseBody.error, error.message);
        assertEquals(listSpy.calls.length, 1);
    });

    await t.step("should return 401 if no auth token is provided", async () => {
        const listSpy = spy(() => Promise.resolve({ data: [], status: 200 }));
        const mockHandlers = createMockHandlers({ listProjects: listSpy as any });
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
             getUserResult: { data: { user: null }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("listProjects");
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 401);
        const body = await response.json();
        assertEquals(body.error, "User not authenticated");
        assertEquals(listSpy.calls.length, 0);
    });
});

withSupabaseEnv("handleRequest - getProjectDetails", async (t) => {
    const projectId = 'proj-123';

    await t.step("should call getProjectDetails and return 200 on success", async () => {
        const getDetailsSpy = spy(() => Promise.resolve({ data: mockProject, status: 200 }));
        const mockHandlers = createMockHandlers({ getProjectDetails: getDetailsSpy });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("getProjectDetails", { projectId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body, mockProject);
        assertEquals(getDetailsSpy.calls.length, 1);
    });

    await t.step("should return error if getProjectDetails fails", async () => {
        const error: ServiceError = { message: "Not Found", status: 404, code: "NOT_FOUND" };
        const getDetailsSpy = spy(() => Promise.resolve({ error, status: 404 }));
        const mockHandlers = createMockHandlers({ getProjectDetails: getDetailsSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("getProjectDetails", { projectId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 404);
        const resBody = await response.json();
        assertEquals(resBody.error, error.message);
        assertEquals(getDetailsSpy.calls.length, 1);
    });

    await t.step("should return 401 if not authenticated", async () => {
        const getDetailsSpy = spy(() => Promise.resolve({ data: mockProject, status: 200 }));
        const mockHandlers = createMockHandlers({ getProjectDetails: getDetailsSpy });

        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: null }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        const req = createJsonRequest("getProjectDetails", { projectId }); // No token
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 401);
        const body = await response.json();
        assertEquals(body.error, "User not authenticated");
        assertEquals(getDetailsSpy.calls.length, 0);
    });
});

withSupabaseEnv("handleRequest - updateProjectDomain", async (t) => {
    const projectId = 'proj-123';
    const domainId = 'domain-2';
    
    await t.step("should call updateProjectDomain and return 200 on success", async () => {
        const updateSpy = spy(() => Promise.resolve({ data: mockProject }));
        const mockHandlers = createMockHandlers({ updateProjectDomain: updateSpy });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const payload = { projectId, selectedDomainId: domainId };
        const req = createJsonRequest("updateProjectDomain", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body, mockProject);
        assertEquals(updateSpy.calls.length, 1);
    });

    await t.step("should return error if updateProjectDomain fails", async () => {
        const error: ServiceError = { message: "Invalid Domain", status: 400, code: "INVALID_DOMAIN" };
        const updateSpy = spy(() => Promise.resolve({ error }));
        const mockHandlers = createMockHandlers({ updateProjectDomain: updateSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const payload = { projectId, selectedDomainId: 'invalid-domain' };
        const req = createJsonRequest("updateProjectDomain", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 400);
        const resBody = await response.json();
        assertEquals(resBody.error, error.message);
        assertEquals(updateSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - startSession", async (t) => {
    const projectId = 'proj-123';

    await t.step("should call startSession and return 200 on success", async () => {
        const startSpy = spy(() => Promise.resolve({ data: mockSession }));
        const mockHandlers = createMockHandlers({ startSession: startSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const payload = { projectId, sessionDescription: 'New session', selectedModelCatalogIds: ['model-1'] };
        const req = createJsonRequest("startSession", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body, mockSession);
        assertEquals(startSpy.calls.length, 1);
    });

    await t.step("should return error if startSession fails", async () => {
        const error: ServiceError = { message: "Too many active sessions", status: 429, code: "TOO_MANY_SESSIONS" };
        const startSpy = spy(() => Promise.resolve({ error }));
        const mockHandlers = createMockHandlers({ startSession: startSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const payload = { projectId, selectedModelCatalogIds: ['model-1'] };
        const req = createJsonRequest("startSession", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 429);
        const resBody = await response.json();
        assertEquals(resBody.error, error.message);
        assertEquals(startSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - generateContributions", async (t) => {
    const sessionId = 'sess-123';
    
    await t.step("should call generateContributions and return 202 on success", async () => {
        const mockResponse: GenerateContributionsSuccessResponse = { message: "Processing started", sessionId: 'sess-123', status: "202", contributions: [] };
        const generateSpy = spy(() => Promise.resolve({ success: true, data: mockResponse }));
        const mockHandlers = createMockHandlers({ generateContributions: generateSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const payload = { sessionId, stageId: 'stage-1' };
        const req = createJsonRequest("generateContributions", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 202);
        const body = await response.json();
        assertEquals(body, mockResponse);
        assertEquals(generateSpy.calls.length, 1);
    });

    await t.step("should return error if generateContributions fails", async () => {
        const error: ServiceError = { message: "AI model unavailable", status: 502, code: "AI_ERROR" };
        const generateSpy = spy(() => Promise.resolve({ success: false, error }));
        const mockHandlers = createMockHandlers({ generateContributions: generateSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const payload = { sessionId, stageId: 'stage-1' };
        const req = createJsonRequest("generateContributions", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );

        assertEquals(response.status, 502);
        const resBody = await response.json();
        assertEquals(resBody.error, error.message);
        assertEquals(generateSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - getContributionContentSignedUrlHandler", async (t) => {
    const contributionId = 'contrib-123';

    await t.step("should call handler and return 200 with signed URL on success", async () => {
        const signedUrl = "https://signed.url/content";
        const handlerSpy = spy(() => Promise.resolve({ data: { signedUrl }, status: 200 }));
        const mockHandlers = createMockHandlers({ getContributionContentSignedUrlHandler: handlerSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        
        const req = createJsonRequest("getContributionContentSignedUrl", { contributionId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body.signedUrl, signedUrl);
        assertEquals(handlerSpy.calls.length, 1);
    });

    await t.step("should return error if handler fails", async () => {
        const error: ServiceError = { message: "Not Found", status: 404, code: "NOT_FOUND" };
        const handlerSpy = spy(() => Promise.resolve({ error, status: 404 }));
        const mockHandlers = createMockHandlers({ getContributionContentSignedUrlHandler: handlerSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("getContributionContentSignedUrl", { contributionId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 404);
        const body = await response.json();
        assertEquals(body.error, error.message);
        assertEquals(handlerSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - deleteProject", async (t) => {
    const projectId = 'proj-to-delete';

    await t.step("should call deleteProject and return 200 on success", async () => {
        const deleteSpy = spy(() => Promise.resolve({ data: null, status: 200 }));
        const mockHandlers = createMockHandlers({ deleteProject: deleteSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("deleteProject", { projectId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 200);
        assertEquals(deleteSpy.calls.length, 1);
    });

    await t.step("should return error if deleteProject fails", async () => {
        const error = { message: "Permission Denied", status: 403 };
        const deleteSpy = spy(() => Promise.resolve({ error, status: 403 }));
        const mockHandlers = createMockHandlers({ deleteProject: deleteSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("deleteProject", { projectId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 403);
        const body = await response.json();
        assertEquals(body.error, error.message);
        assertEquals(deleteSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - cloneProject", async (t) => {
    const payload: CloneProjectPayload = {
        projectId: 'proj-original',
        newProjectName: 'Cloned Project'
    };

    await t.step("should call cloneProject and return 201 on success", async () => {
        const successResponse: CloneProjectResult = { data: { ...mockProject, id: 'proj-clone' }, error: null };
        const cloneSpy = spy(() => Promise.resolve(successResponse));
        const mockHandlers = createMockHandlers({ cloneProject: cloneSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("cloneProject", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 201);
        const body = await response.json();
        assertEquals(body.id, 'proj-clone');
        assertEquals(cloneSpy.calls.length, 1);
    });

    await t.step("should return error if cloneProject fails", async () => {
        const error: ServiceError = { message: "Cloning failed", status: 500, code: "CLONE_ERROR" };
        const errorResponse: CloneProjectResult = { data: null, error };
        const cloneSpy = spy(() => Promise.resolve(errorResponse));
        const mockHandlers = createMockHandlers({ cloneProject: cloneSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("cloneProject", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 500);
        const body = await response.json();
        assertEquals(body.error, error.message);
        assertEquals(cloneSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - exportProject", async (t) => {
    const projectId = 'proj-to-export';
    
    await t.step("should call exportProject and return 200 with URL on success", async () => {
        const exportUrl = "https://export.url/file";
        const exportSpy = spy(() => Promise.resolve({ data: { export_url: exportUrl }, status: 200 }));
        const mockHandlers = createMockHandlers({ exportProject: exportSpy });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("exportProject", { projectId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body.export_url, exportUrl);
        assertEquals(exportSpy.calls.length, 1);
    });

    await t.step("should return error if exportProject fails", async () => {
        const error: ServiceError = { message: "Export failed", status: 500, code: "EXPORT_ERROR" };
        const exportSpy = spy(() => Promise.resolve({ error, status: 500 }));
        const mockHandlers = createMockHandlers({ exportProject: exportSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        
        const req = createJsonRequest("exportProject", { projectId }, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 500);
        const body = await response.json();
        assertEquals(body.error, error.message);
        assertEquals(exportSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - getProjectResourceContent", async (t) => {
    const payload = { projectId: 'proj-123', resourceId: 'res-456' };

    await t.step("should call getProjectResourceContent and return 200 on success", async () => {
        const mockResponse: GetProjectResourceContentResponse = { fileName: 'test.txt', mimeType: 'text/plain', content: 'hello world' };
        const getSpy = spy(() => Promise.resolve({ data: mockResponse, status: 200 }));
        const mockHandlers = createMockHandlers({ getProjectResourceContent: getSpy });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("getProjectResourceContent", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body, mockResponse);
        assertEquals(getSpy.calls.length, 1);
    });

    await t.step("should return error if getProjectResourceContent fails", async () => {
        const error: ServiceError = { message: "Resource Not Found", status: 404, code: "NOT_FOUND" };
        const getSpy = spy(() => Promise.resolve({ error, status: 404 }));
        const mockHandlers = createMockHandlers({ getProjectResourceContent: getSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("getProjectResourceContent", payload, mockToken);
        const response = await handleRequest(
          req,
          mockHandlers,
          mockUserClient as any,
          mockAdminClient as any
        );
        
        assertEquals(response.status, 404);
        const body = await response.json();
        assertEquals(body.error, error.message);
        assertEquals(getSpy.calls.length, 1);
    });
});

withSupabaseEnv("handleRequest - fetchProcessTemplate", async (t) => {
    const templateId = 'template-123';
    const mockTemplate = { id: templateId, name: "Test Template", stages: [], transitions: [] };

    await t.step("should call fetchProcessTemplate and return 200 on success", async () => {
        const fetchSpy = spy(() => Promise.resolve({ data: mockTemplate, status: 200 }));
        const mockHandlers = createMockHandlers({ fetchProcessTemplate: fetchSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        
        const req = createJsonRequest("fetchProcessTemplate", { templateId }, mockToken);
        const response = await handleRequest(req, mockHandlers, mockUserClient as any, mockAdminClient as any);
        
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body.id, templateId);
        assertEquals(fetchSpy.calls.length, 1);
    });

    await t.step("should return 404 if template is not found", async () => {
        const error: ServiceError = { message: "Not Found", status: 404, code: "NOT_FOUND" };
        const fetchSpy = spy(() => Promise.resolve({ error, status: 404 }));
        const mockHandlers = createMockHandlers({ fetchProcessTemplate: fetchSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        
        const req = createJsonRequest("fetchProcessTemplate", { templateId: 'not-found' }, mockToken);
        const response = await handleRequest(req, mockHandlers, mockUserClient as any, mockAdminClient as any);
        
        assertEquals(response.status, 404);
        const body = await response.json();
        assertEquals(body.error, error.message);
        assertEquals(fetchSpy.calls.length, 1);
    });

    await t.step("should return 401 if not authenticated", async () => {
        const fetchSpy = spy(() => Promise.resolve({ data: mockTemplate, status: 200 }));
        const mockHandlers = createMockHandlers({ fetchProcessTemplate: fetchSpy as any });

        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: null }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        
        const req = createJsonRequest("fetchProcessTemplate", { templateId }); // No token
        const response = await handleRequest(req, mockHandlers, mockUserClient as any, mockAdminClient as any);

        assertEquals(response.status, 401);
        assertEquals(fetchSpy.calls.length, 0);
    });
});

withSupabaseEnv("handleRequest - updateSessionModels", async (t) => {
    const mockSessionId = 'sess-test-update';
    const mockSelectedModelCatalogIds = ['model-a', 'model-b'];
    const mockUpdatedSession: DialecticSession = {
        ...mockSession, // Use the global mockSession as a base
        id: mockSessionId,
        selected_model_catalog_ids: mockSelectedModelCatalogIds,
        updated_at: new Date().toISOString(),
    };

    const payload = { sessionId: mockSessionId, selectedModelCatalogIds: mockSelectedModelCatalogIds };

    await t.step("should call updateSessionModels and return 200 on success", async () => {
        const updateSpy = spy(() => Promise.resolve({ data: mockUpdatedSession, status: 200 }));
        const mockHandlers = createMockHandlers({ updateSessionModels: updateSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const req = createJsonRequest("updateSessionModels", payload, mockToken);
        const response = await handleRequest(req, mockHandlers, mockUserClient as any, mockAdminClient as any);
        
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body.id, mockSessionId);
        assertEquals(body.selected_model_catalog_ids, mockSelectedModelCatalogIds);
        assertEquals(updateSpy.calls.length, 1);
    });

    await t.step("should return error if updateSessionModels handler fails", async () => {
        const error: ServiceError = { message: "Update Failed", status: 500, code: "DB_UPDATE_ERROR" };
        const updateSpy = spy(() => Promise.resolve({ error, status: 500 }));
        const mockHandlers = createMockHandlers({ updateSessionModels: updateSpy as any });

        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        
        const req = createJsonRequest("updateSessionModels", payload, mockToken);
        const response = await handleRequest(req, mockHandlers, mockUserClient as any, mockAdminClient as any);
        
        assertEquals(response.status, 500);
        const body = await response.json();
        assertEquals(body.error, error.message);
        assertEquals(updateSpy.calls.length, 1);
    });

    await t.step("should return 401 if not authenticated", async () => {
        const updateSpy = spy(() => Promise.resolve({ data: mockUpdatedSession, status: 200 }));
        const mockHandlers = createMockHandlers({ updateSessionModels: updateSpy as any });

        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: null }, error: null } // Simulates auth failure
        });
        const { client: mockAdminClient } = createMockSupabaseClient();
        
        const req = createJsonRequest("updateSessionModels", payload); // No token
        const response = await handleRequest(req, mockHandlers, mockUserClient as any, mockAdminClient as any);

        assertEquals(response.status, 401);
        const body = await response.json();
        assertEquals(body.error, "User not authenticated");
        assertEquals(updateSpy.calls.length, 0);
    });

    await t.step("should return 400 if sessionId is missing from payload", async () => {
        const updateSpy = spy(() => Promise.resolve({ data: mockUpdatedSession, status: 200 }));
        // const mockHandlers = createMockHandlers({ updateSessionModels: updateSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const incompletePayload = { selectedModelCatalogIds: mockSelectedModelCatalogIds }; // Missing sessionId
        const req = createJsonRequest("updateSessionModels", incompletePayload, mockToken);
        const reqClone = req.clone(); // Clone the request

        const specificErrorSpy = spy(() => Promise.resolve({ error: {message: "sessionId is required", status: 400, code: "MISSING_PARAM"}, status: 400 }));
        const specificMockHandlers = createMockHandlers({ updateSessionModels: specificErrorSpy as any });
        
        // Use the cloned request
        const specificResponse = await handleRequest(reqClone, specificMockHandlers, mockUserClient as any, mockAdminClient as any);
        
        assertEquals(specificResponse.status, 400);
        const body = await specificResponse.json();
        assertEquals(body.error, "sessionId is required");
        assertEquals(specificErrorSpy.calls.length, 1); // The mock handler was called
    });

     await t.step("should return 400 if selectedModelCatalogIds is missing from payload", async () => {
        const updateSpy = spy(() => Promise.resolve({ data: mockUpdatedSession, status: 200 }));
        const mockHandlers = createMockHandlers({ updateSessionModels: updateSpy as any });
        
        const mockToken = "mock-jwt";
        const { client: mockUserClient } = createMockSupabaseClient('test-user-id', {
            getUserResult: { data: { user: mockUser }, error: null }
        });
        const { client: mockAdminClient } = createMockSupabaseClient();

        const incompletePayload = { sessionId: mockSessionId }; // Missing selectedModelCatalogIds
        const req = createJsonRequest("updateSessionModels", incompletePayload, mockToken);
        
        const specificErrorSpy = spy(() => Promise.resolve({ error: {message: "selectedModelCatalogIds is required", status: 400, code: "MISSING_PARAM"}, status: 400 }));
        const specificMockHandlers = createMockHandlers({ updateSessionModels: specificErrorSpy as any });
        
        const specificResponse = await handleRequest(req, specificMockHandlers, mockUserClient as any, mockAdminClient as any);
        
        assertEquals(specificResponse.status, 400);
        const body = await specificResponse.json();
        assertEquals(body.error, "selectedModelCatalogIds is required");
        assertEquals(specificErrorSpy.calls.length, 1); 
    });
}); 