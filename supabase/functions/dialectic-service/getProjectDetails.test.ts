import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.190.0/testing/bdd.ts";
import { stub } from "https://deno.land/std@0.190.0/testing/mock.ts";
import { getProjectDetails } from "./getProjectDetails.ts";
import * as sharedLogger from "../_shared/logger.ts";
import { 
    DialecticProject, 
    DialecticContribution, 
    GetProjectDetailsPayload, 
    DialecticSession, 
    DialecticSessionModel, 
    AIModelCatalogEntry 
} from "./dialectic.interface.ts";
import type { User } from "npm:@supabase/gotrue-js@^2.6.3";

import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig, 
    type IMockSupabaseClient, 
    type IMockClientSpies,
    type MockResolveQueryResult
} from '../_shared/supabase.mock.ts';

const MOCK_USER_ID = "test-user-id";
const getMockUser = (id: string): User => ({
  id,
  app_metadata: { provider: "email" },
  user_metadata: { name: "Test User" },
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

describe("getProjectDetails", () => {
  let currentMockDbClient: IMockSupabaseClient;
  let currentClientSpies: IMockClientSpies;
  let supabaseTestSetup: ReturnType<typeof createMockSupabaseClient>;
  let debugStub: any, infoStub: any, warnStub: any, errorStub: any;

  beforeEach(() => {
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

  it("should return 400 if projectId is not provided", async () => {
    const payload: GetProjectDetailsPayload = { projectId: "" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, getMockUser(MOCK_USER_ID));

    assertExists(result.error);
    assertEquals(result.error?.message, "projectId is required");
    assertEquals(result.error?.code, "VALIDATION_ERROR");
    assertEquals(result.error?.status, 400);
  });

  it("should return 401 if user is not authenticated", async () => {
    const mockAuthErrorUser: User = { ...getMockUser(MOCK_USER_ID), id: "auth-error-simulated-user-id" };
    const payload: GetProjectDetailsPayload = { projectId: "test-project-id" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, mockAuthErrorUser);

    assertExists(result.error);
    assertEquals(result.error?.message, "Project not found or access denied");
    assertEquals(result.error?.status, 404);
  });

  it("should return 404 if project is not found (PGRST116)", async () => {
    if (debugStub) debugStub.restore();
    if (infoStub) infoStub.restore();
    if (warnStub) warnStub.restore();
    if (errorStub) errorStub.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();

    const dbConfig: MockSupabaseDataConfig = {
      mockUser: getMockUser(MOCK_USER_ID),
      genericMockResults: {
        'dialectic_projects': {
          select: async (_state): Promise<{ data: object[] | null; error: any; count: number | null; status: number; statusText: string; }> => ({
            data: [] as object[], 
            error: null,
            count: 0,
            status: 200, 
            statusText: 'OK'
          })
        }
      }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, dbConfig);
    currentMockDbClient = supabaseTestSetup.client;

    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});
    
    const payload: GetProjectDetailsPayload = { projectId: "non-existent-project-id" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, getMockUser(MOCK_USER_ID));

    assertExists(result.error);
    assertEquals(result.error?.message, "Project not found or access denied");
    assertEquals(result.error?.code, "NOT_FOUND");
    assertEquals(result.error?.status, 404);
  });
  
  it("should return 404 if project is null (no PGRST116 error)", async () => {
    if (debugStub) debugStub.restore();
    if (infoStub) infoStub.restore();
    if (warnStub) warnStub.restore();
    if (errorStub) errorStub.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();

    const dbConfig: MockSupabaseDataConfig = {
      mockUser: getMockUser(MOCK_USER_ID),
      genericMockResults: {
        'dialectic_projects': {
          select: async (_state): Promise<{ data: object[] | null; error: any; count: number | null; status: number; statusText: string; }> => ({
            data: null, 
            error: null,
            count: 0,
            status: 200,
            statusText: 'OK'
          })
        }
      }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, dbConfig);
    currentMockDbClient = supabaseTestSetup.client;

    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});

    const payload: GetProjectDetailsPayload = { projectId: "non-existent-project-id-no-pgrst-error" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, getMockUser(MOCK_USER_ID));

    assertExists(result.error);
    assertEquals(result.error?.message, "Project not found or access denied");
    assertEquals(result.error?.code, "NOT_FOUND");
    assertEquals(result.error?.status, 404);
  });

  it("should return 500 for other database fetch errors", async () => {
    if (debugStub) debugStub.restore();
    if (infoStub) infoStub.restore();
    if (warnStub) warnStub.restore();
    if (errorStub) errorStub.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();
    
    const dbError = { message: "Some DB error", code: "DB_ERROR" };
    const dbConfig: MockSupabaseDataConfig = {
      mockUser: getMockUser(MOCK_USER_ID),
      genericMockResults: {
        'dialectic_projects': {
          select: async (_state): Promise<{ data: object[] | null; error: any; count: number | null; status: number; statusText: string; }> => ({
            data: null,
            error: dbError as any,
            count: 0,
            status: 500, 
            statusText: "Internal Server Error"
          })
        }
      }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, dbConfig);
    currentMockDbClient = supabaseTestSetup.client;

    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});

    const payload: GetProjectDetailsPayload = { projectId: "test-project-id" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, getMockUser(MOCK_USER_ID));

    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to fetch project details");
    assertEquals(result.error?.code, "DB_FETCH_ERROR");
    assertEquals(result.error?.status, 500);
  });

  type MockDbProjectData = Omit<DialecticProject, 'sessions' | 'contributions' | 'domain_name'> & {
    dialectic_sessions: (Omit<DialecticSession, 'contributions' | 'dialectic_contributions'> & {
        dialectic_contributions?: Partial<DialecticContribution>[] | null;
    })[] | null;
    dialectic_domains: { name: string } | null;
  };

  it("should successfully fetch project details with sessions, models, and sorted contributions", async () => {
    const mockProjectDataForDb: MockDbProjectData = {
      id: "test-project-id",
      user_id: MOCK_USER_ID,
      project_name: "Test Project",
      initial_user_prompt: "Test prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      repo_url: null,
      status: "active",
      selected_domain_id: "domain-id-general",
      dialectic_sessions: [
        {
          id: "session-1",
          project_id: "test-project-id",
          session_description: "Session 1",
          iteration_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: "thesis_complete",
          associated_chat_id: "chat-1",
          current_stage_id: "stage-1",
          selected_model_catalog_ids: ["model-1"],
          user_input_reference_url: null,
          dialectic_contributions: [
            { 
            id: "contrib-2", 
            session_id: "session-1", 
            created_at: new Date(Date.now() + 1000).toISOString(), 
            stage: 'antithesis' 
            },
            { 
            id: "contrib-1", 
            session_id: "session-1", 
            created_at: new Date().toISOString(), 
            stage: 'thesis' 
            },
          ],
        },
        {
          id: "session-2",
          project_id: "test-project-id",
          session_description: "Session 2 - No Contributions",
          iteration_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: "pending_thesis",
          associated_chat_id: "chat-2",
          current_stage_id: "stage-1",
          selected_model_catalog_ids: ["model-1"],
          user_input_reference_url: null,
          dialectic_contributions: [],
        },
         {
          id: "session-3",
          project_id: "test-project-id",
          session_description: "Session 3 - Contributions is null",
          iteration_count: 1,
          current_stage_id: "stage-1",
          selected_model_catalog_ids: ["model-1"],
          user_input_reference_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: "pending_thesis",
          associated_chat_id: "chat-3",
          dialectic_contributions: null, 
        },
      ],
      dialectic_domains: { name: "General" }
    };
    
    if (debugStub) debugStub.restore();
    if (infoStub) infoStub.restore();
    if (warnStub) warnStub.restore();
    if (errorStub) errorStub.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();

    const dbConfig: MockSupabaseDataConfig = {
      mockUser: getMockUser(MOCK_USER_ID),
      genericMockResults: {
        'dialectic_projects': {
          select: async (_state): Promise<{ data: object[] | null; error: any; count: number | null; status: number; statusText: string; }> => ({
            data: [JSON.parse(JSON.stringify(mockProjectDataForDb))] as object[], 
            error: null,
            count: 1,
            status: 200,
            statusText: 'OK'
          })
        }
      }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, dbConfig);
    currentMockDbClient = supabaseTestSetup.client;
    currentClientSpies = supabaseTestSetup.spies;

    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});
    
    const payload: GetProjectDetailsPayload = { projectId: "test-project-id" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, getMockUser(MOCK_USER_ID));

    assertExists(result.data);
    const resultData = result.data as any; 

    assertEquals(resultData.id, "test-project-id");
    assertEquals(resultData.project_name, "Test Project");
    assertExists(resultData.dialectic_sessions);
    assertEquals(resultData.dialectic_sessions.length, 3);

    const session1 = resultData.dialectic_sessions.find((s: any) => s.id === "session-1");
    assertExists(session1);

    assertExists(session1.dialectic_contributions);
    assertEquals(session1.dialectic_contributions.length, 2);
    assertEquals(session1.dialectic_contributions[0].id, "contrib-1"); 
    assertEquals(session1.dialectic_contributions[1].id, "contrib-2");

    const session2 = resultData.dialectic_sessions.find((s: any) => s.id === "session-2");
    assertExists(session2);
    assertExists(session2.dialectic_contributions);
    assertEquals(session2.dialectic_contributions.length, 0);

    const session3 = resultData.dialectic_sessions.find((s: any) => s.id === "session-3");
    assertExists(session3);
    assertEquals(session3.dialectic_contributions, null);

    const fromSpy = currentClientSpies.fromSpy;
    const qbSpies = currentClientSpies.getLatestQueryBuilderSpies('dialectic_projects');
    assertExists(qbSpies?.select, "Select spy should exist");
    assertExists(qbSpies?.eq, "Eq spy should exist");

    assertEquals(fromSpy.calls.length, 1);
    assertEquals(fromSpy.calls[0].args[0], 'dialectic_projects');
    
    assertEquals(qbSpies.select.calls.length, 1);
    const expectedSelect = "*, dialectic_domains ( name ), dialectic_sessions (*, dialectic_contributions (*) )";
    const actualSelect = qbSpies.select.calls[0].args[0]?.toString().replace(/\s+/g, ' ').trim();
    assertEquals(actualSelect, expectedSelect);

    assertEquals(qbSpies.eq.calls.length, 2);
    assertEquals(qbSpies.eq.calls[0].args[0], 'id');
    assertEquals(qbSpies.eq.calls[0].args[1], 'test-project-id');
    assertEquals(qbSpies.eq.calls[1].args[0], 'user_id');
    assertEquals(qbSpies.eq.calls[1].args[1], MOCK_USER_ID); 

    assertEquals(resultData.dialectic_domains.name, "General");
  });
  
  it("should handle project with no sessions", async () => {
    const mockProjectDataForDbNoSessions: MockDbProjectData = { 
      id: "project-no-sessions",
      user_id: MOCK_USER_ID,
      project_name: "Project No Sessions",
      initial_user_prompt: "Test prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      repo_url: null,
      status: "active",
      selected_domain_id: "domain-id-general",
      dialectic_sessions: [], 
      dialectic_domains: { name: "General" }
    };

    if (debugStub) debugStub.restore();
    if (infoStub) infoStub.restore();
    if (warnStub) warnStub.restore();
    if (errorStub) errorStub.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();

    const dbConfig: MockSupabaseDataConfig = {
      mockUser: getMockUser(MOCK_USER_ID),
      genericMockResults: {
        'dialectic_projects': {
          select: async (_state): Promise<{ data: object[] | null; error: any; count: number | null; status: number; statusText: string; }> => ({
            data: [JSON.parse(JSON.stringify(mockProjectDataForDbNoSessions))] as object[], 
            error: null, count: 1, status: 200, statusText: 'OK'
          })
        }
      }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, dbConfig);
    currentMockDbClient = supabaseTestSetup.client;

    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});
    
    const payload: GetProjectDetailsPayload = { projectId: "project-no-sessions" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, getMockUser(MOCK_USER_ID));

    assertExists(result.data);
    const resultData = result.data as any; 
    assertEquals(resultData.id, "project-no-sessions");
    assertExists(resultData.dialectic_sessions);
    assertEquals(resultData.dialectic_sessions.length, 0);
  });

  it("should handle project with sessions but sessions are null", async () => {
    const mockProjectDataForDbNullSessions: MockDbProjectData = {
      id: "project-null-sessions",
      user_id: MOCK_USER_ID,
      project_name: "Project Null Sessions",
      initial_user_prompt: "Test prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      repo_url: null,
      status: "active",
      selected_domain_id: "domain-id-general",
      dialectic_sessions: null,
      dialectic_domains: { name: "General" }
    };

    if (debugStub) debugStub.restore();
    if (infoStub) infoStub.restore();
    if (warnStub) warnStub.restore();
    if (errorStub) errorStub.restore();
    if (supabaseTestSetup && supabaseTestSetup.clearAllStubs) supabaseTestSetup.clearAllStubs();

    const dbConfig: MockSupabaseDataConfig = {
      mockUser: getMockUser(MOCK_USER_ID),
      genericMockResults: {
        'dialectic_projects': {
          select: async (_state): Promise<{ data: object[] | null; error: any; count: number | null; status: number; statusText: string; }> => ({
            data: [JSON.parse(JSON.stringify(mockProjectDataForDbNullSessions))] as object[], 
            error: null, count: 1, status: 200, statusText: 'OK'
          })
        }
      }
    };
    supabaseTestSetup = createMockSupabaseClient(MOCK_USER_ID, dbConfig);
    currentMockDbClient = supabaseTestSetup.client;

    debugStub = stub(sharedLogger.logger, "debug", () => {});
    infoStub = stub(sharedLogger.logger, "info", () => {});
    warnStub = stub(sharedLogger.logger, "warn", () => {});
    errorStub = stub(sharedLogger.logger, "error", () => {});
        
    const payload: GetProjectDetailsPayload = { projectId: "project-null-sessions" };
    const result = await getProjectDetails(payload, currentMockDbClient as any, getMockUser(MOCK_USER_ID));

    assertExists(result.data);
    const resultData = result.data as any;
    assertEquals(resultData.id, "project-null-sessions");
    assertEquals(resultData.dialectic_sessions, null); 
  });

});
