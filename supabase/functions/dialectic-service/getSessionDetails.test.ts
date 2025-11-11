import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import type { User } from 'npm:@supabase/supabase-js';
import { getSessionDetails } from './getSessionDetails.ts';
import { logger } from '../_shared/logger.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';

const getMockUser = (id: string): User => ({
  id,
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
});

describe("getSessionDetails Unit Tests", () => {
  let loggerStubs: { info: any; warn: any; error: any };
  let mockClientSetup: MockSupabaseClientSetup | null = null;

  const mockSessionId = "unit-test-session-id";
  const mockUserId = "unit-test-user-id";
  const mockOwnerId = "owner-user-id";
  const mockUser = getMockUser(mockUserId);
  const mockOwnerUser = getMockUser(mockOwnerId);
  const mockProjectId = "unit-test-project-id";
  const mockStageId = "unit-test-stage-id";

  const mockDbSession = {
    id: mockSessionId,
    project_id: mockProjectId,
    current_stage_id: mockStageId,
    iteration_count: 1,
    dialectic_stages: { id: mockStageId, slug: 'test-stage' },
  };

  const mockDbProject = {
    id: mockProjectId,
    user_id: mockOwnerId,
  };

  beforeEach(() => {
    loggerStubs = {
      info: stub(logger, "info", () => {}),
      warn: stub(logger, "warn", () => {}),
      error: stub(logger, "error", () => {}),
    };
  });

  afterEach(() => {
    loggerStubs.info.restore();
    loggerStubs.warn.restore();
    loggerStubs.error.restore();
    if (mockClientSetup?.clearAllStubs) {
      mockClientSetup.clearAllStubs();
    }
  });

  it("should return full session details including the activeSeedPrompt on success", async () => {
    const mockPromptContent = "This is the seed prompt from storage.";
    const mockResource = { 
      id: "res-123", 
      storage_path: "path/to",
      file_name: "prompt.md",
      storage_bucket: "dialectic-contributions",
    };

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
      genericMockResults: {
        'dialectic_sessions': { select: { data: [mockDbSession] } },
        'dialectic_projects': { select: { data: [mockDbProject] } },
        'dialectic_project_resources': { select: { data: [mockResource] } },
      },
    });

    // Mock the storage client download method
    stub(mockClientSetup.client.storage, "from", () => ({
      download: () => Promise.resolve({ data: new Blob([mockPromptContent]), error: null }),
      upload: () => Promise.resolve({ data: { path: '' }, error: null }),
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null }),
      remove: () => Promise.resolve({ data: [], error: null }),
      list: () => Promise.resolve({ data: [], error: null }),
      copy: () => Promise.resolve({ data: { path: '' }, error: null }),
    }));

    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockOwnerUser);
    
    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.id, mockSessionId);
    assertExists(result.data.activeSeedPrompt, "activeSeedPrompt should be present in the response");
    assertEquals(result.data.activeSeedPrompt?.promptContent, mockPromptContent);
  });

  it("should return a 404 error if the session is not found", async () => {
    const dbError = { name: 'MockDBError', code: 'PGRST116', message: 'Not found' };
    mockClientSetup = createMockSupabaseClient(mockUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: null, error: dbError } },
        },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockUser);
    assertEquals(result.status, 404);
    assertEquals(result.error?.code, 'NOT_FOUND');
  });

  it("should return a 403 Forbidden error if the user does not own the project", async () => {
    mockClientSetup = createMockSupabaseClient(mockUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: [mockDbSession] } },
            'dialectic_projects': { select: { data: [mockDbProject] } }, // Project owned by mockOwnerId
        },
    });
    
    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockUser);
    assertEquals(result.status, 403);
    assertEquals(result.error?.code, 'FORBIDDEN');
  });

  it("should return a 500 error if a database query fails", async () => {
    const dbError = { name: 'MockDBError', message: "Internal Server Error", code: "XXYYZ" };
    mockClientSetup = createMockSupabaseClient(mockUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: null, error: dbError } },
        },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockUser);
    assertEquals(result.status, 500);
    assertEquals(result.error?.code, 'DB_ERROR');
  });

  it("should return a 500 error if the associated project is not found", async () => {
    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: [mockDbSession] } },
            'dialectic_projects': { select: { data: null, error: null } },
        },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockOwnerUser);
    assertEquals(result.status, 500);
    assertEquals(result.error?.code, 'INTERNAL_SERVER_ERROR');
  });

  it("should return a 500 error if fetching the project fails", async () => {
    const dbError = { name: 'MockDBError', message: "DB error on project fetch", code: "PGRST_ERROR" };
    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: [mockDbSession] } },
            'dialectic_projects': { select: { data: null, error: dbError } },
        },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockOwnerUser);
    assertEquals(result.status, 500);
    assertEquals(result.error?.code, 'DB_ERROR');
  });

  it("should return session details with a null activeSeedPrompt if no prompt is found", async () => {
    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: [mockDbSession] } },
            'dialectic_projects': { select: { data: [mockDbProject] } },
            'dialectic_project_resources': { select: { data: null, error: null } },
        },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockOwnerUser);
    
    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.id, mockSessionId);
    assertEquals(result.data.activeSeedPrompt, null);
  });
}); 