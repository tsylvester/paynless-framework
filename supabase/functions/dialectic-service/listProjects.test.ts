import { assertEquals, assertExists } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.190.0/testing/bdd.ts";
import { stub } from "https://deno.land/std@0.190.0/testing/mock.ts";
import { listProjects } from "./listProjects.ts";
import * as sharedLogger from "../_shared/logger.ts";
import type { Database } from "../types_db.ts";
import type { User } from "npm:@supabase/gotrue-js@^2.6.3";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig, 
    type IMockSupabaseClient, 
    type IMockClientSpies
} from '../_shared/supabase.mock.ts';

const MOCK_USER_ID = "test-user-list-id";
const getMockUser = (id: string): User => ({
  id,
  app_metadata: { provider: "email" },
  user_metadata: { name: "Test User List" },
  aud: "authenticated",
  confirmation_sent_at: new Date().toISOString(),
  recovery_sent_at: "",
  email_change_sent_at: "",
  new_email: "",
  new_phone: "",
  invited_at: "",
  action_link: "",
  email: `${id}@example.com`,
  phone: "",
  created_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  email_confirmed_at: new Date().toISOString(),
  phone_confirmed_at: "",
  last_sign_in_at: new Date().toISOString(),
  role: "authenticated",
  updated_at: new Date().toISOString(),
  identities: [],
  factors: [],
});

type DialecticProjectRow = Database['public']['Tables']['dialectic_projects']['Row'];
type DialecticProjectWithDomain = DialecticProjectRow & {
  dialectic_domains: { name: string } | null;
};

// Helper to provide the DI override for auth
const getTestAuthOptions = (client: IMockSupabaseClient): { createSupabaseClientOverride: (req: Request) => any } => ({
  createSupabaseClientOverride: (_req: Request) => ({
    auth: client.auth
  } as any) 
});

describe("listProjects", () => {
  let mockRequest: Request;
  let currentMockDbClient: IMockSupabaseClient;
  let currentClientSpies: IMockClientSpies;
  let supabaseTestSetup: ReturnType<typeof createMockSupabaseClient>;
  let debugStub: any, infoStub: any, warnStub: any, errorStub: any;

  beforeEach(() => {
    mockRequest = new Request("http://localhost/listProjects", {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
    });
    
    // Default setup for most tests, can be overridden per test
    const defaultConfig: MockSupabaseDataConfig = {
      mockUser: getMockUser(MOCK_USER_ID),
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, defaultConfig);
    currentMockDbClient = supabaseTestSetup.client;
    currentClientSpies = supabaseTestSetup.spies;

    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});
  });

  afterEach(() => {
    debugStub?.restore();
    infoStub?.restore();
    warnStub?.restore();
    errorStub?.restore();
    
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) {
      supabaseTestSetup.clearAllStubs();
    }
  });

  it("should return a list of projects for an authenticated user", async () => {
    const mockProjectsData: DialecticProjectWithDomain[] = [
      { id: "proj-1", user_id: MOCK_USER_ID, project_name: "Project Alpha", created_at: new Date().toISOString(), initial_user_prompt: "prompt1", repo_url: null, selected_domain_id: "domain-1", status: "active", updated_at: new Date().toISOString(), user_domain_overlay_values: {}, initial_prompt_resource_id: null, selected_domain_overlay_id: null, process_template_id: null, dialectic_domains: { name: 'Domain A'} },
      { id: "proj-2", user_id: MOCK_USER_ID, project_name: "Project Beta", created_at: new Date(Date.now() - 100000).toISOString(), initial_user_prompt: "prompt2", repo_url:null, selected_domain_id: "domain-2", status: "active", updated_at: new Date().toISOString(), user_domain_overlay_values: null, initial_prompt_resource_id: null, selected_domain_overlay_id: null, process_template_id: null, dialectic_domains: { name: 'Domain B'} },
    ];

    // Restore global stubs before re-initializing and re-stubbing locally
    debugStub?.restore();
    infoStub?.restore();
    warnStub?.restore();
    errorStub?.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();
    
    const testConfig: MockSupabaseDataConfig = {
        mockUser: getMockUser(MOCK_USER_ID),
        genericMockResults: {
            'dialectic_projects': {
                select: async (_state: any) => ({ data: mockProjectsData as any[], error: null, count: mockProjectsData.length, status: 200, statusText: 'OK' })
            }
        }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, testConfig);
    currentMockDbClient = supabaseTestSetup.client;
    currentClientSpies = supabaseTestSetup.spies; 
    
    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});


    const result = await listProjects(getMockUser(MOCK_USER_ID), currentMockDbClient as any);

    assertExists(result.data);
    assertEquals(result.data?.length, 2);
    assertEquals(result.data?.[0].id, "proj-1");
    assertEquals((result.data?.[0] as any).domain_name, "Domain A");
    assertEquals(result.data?.[1].id, "proj-2");
    assertEquals((result.data?.[1] as any).domain_name, "Domain B");
    assertEquals(result.error, undefined);

    const fromSpy = currentClientSpies.fromSpy;
    const qbSpies = currentClientSpies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(qbSpies?.select, "Select spy should exist");
    assertExists(qbSpies?.eq, "Eq spy should exist");
    // assertExists(qbSpies?.order, "Order spy should exist"); // Removed for now

    assertEquals(fromSpy.calls.length, 1);
    assertEquals(fromSpy.calls[0].args[0], 'dialectic_projects');
    assertEquals(qbSpies.select.calls.length, 1);
    assertEquals(qbSpies.select.calls[0].args[0], '*, dialectic_domains(name)');
    assertEquals(qbSpies.eq.calls.length, 1);
    assertEquals(qbSpies.eq.calls[0].args[0], 'user_id');
    assertEquals(qbSpies.eq.calls[0].args[1], MOCK_USER_ID);
    // assertEquals(qbSpies.order.calls.length, 1); // Removed for now
    // assertEquals(qbSpies.order.calls[0].args[0], 'created_at'); // Removed for now
    // assertEquals(qbSpies.order.calls[0].args[1], { ascending: false }); // Removed for now
  });

  it("should return an empty list if the user has no projects", async () => {
    // Restore global stubs before re-initializing and re-stubbing locally
    debugStub?.restore();
    infoStub?.restore();
    warnStub?.restore();
    errorStub?.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();
    
    const testConfig: MockSupabaseDataConfig = {
        mockUser: getMockUser(MOCK_USER_ID),
        genericMockResults: {
            'dialectic_projects': {
                select: async (_state: any) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
            }
        }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, testConfig);
    currentMockDbClient = supabaseTestSetup.client;
    
    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});

    const result = await listProjects(getMockUser(MOCK_USER_ID), currentMockDbClient as any);

    assertExists(result.data);
    assertEquals(result.data?.length, 0);
    assertEquals(result.error, undefined);
  });

  it("should return 500 for database errors", async () => {
    const dbError = { message: "Simulated DB Error", code: "DB_FAIL", details: "Connection lost" };
    // Restore global stubs before re-initializing and re-stubbing locally
    debugStub?.restore();
    infoStub?.restore();
    warnStub?.restore();
    errorStub?.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();
    
    const testConfig: MockSupabaseDataConfig = {
        mockUser: getMockUser(MOCK_USER_ID),
        genericMockResults: {
            'dialectic_projects': {
                select: async (_state: any) => ({ data: null, error: dbError as any, count: 0, status: 500, statusText: 'Internal Server Error' })
            }
        }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, testConfig);
    currentMockDbClient = supabaseTestSetup.client;
    
    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});


    const result = await listProjects(getMockUser(MOCK_USER_ID), currentMockDbClient as any);

    assertExists(result.error);
    assertEquals(result.data, undefined);
    assertEquals(result.error?.message, "Failed to fetch projects");
    assertEquals(result.error?.status, 500);
    assertEquals(result.error?.code, "DB_ERROR");
    assertEquals(result.error?.details, dbError.message); 
  });

});
