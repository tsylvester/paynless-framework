import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import type { User } from 'npm:@supabase/supabase-js';
import { getSessionDetails } from './getSessionDetails.ts';
import { logger } from '../_shared/logger.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from '../_shared/supabase.mock.ts';

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
      resource_type: 'seed_prompt',
      session_id: mockSessionId,
      stage_slug: 'test-stage',
    };

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
      genericMockResults: {
        'dialectic_sessions': { select: { data: [mockDbSession] } },
        'dialectic_projects': { select: { data: [mockDbProject] } },
        'dialectic_project_resources': {
          select: (state: MockQueryBuilderState) => {
            // Assert JSON path predicate is NOT present
            const hasJsonPathFilter = state.filters.some((filter) => {
              if (typeof filter.column === 'string' && filter.column.includes('resource_description->>')) {
                return true;
              }
              return false;
            });
            if (hasJsonPathFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must not use JSON-path predicates on resource_description'),
                count: 0,
                status: 400,
                statusText: 'JSON path filter detected',
              });
            }

            // Assert resource_type filter is present
            const hasResourceTypeFilter = state.filters.some(
              (filter) =>
                filter.type === 'eq' &&
                filter.column === 'resource_type' &&
                filter.value === 'seed_prompt',
            );
            if (!hasResourceTypeFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must filter by resource_type'),
                count: 0,
                status: 400,
                statusText: 'Missing resource_type filter',
              });
            }

            // Assert session_id filter is present
            const hasSessionIdFilter = state.filters.some(
              (filter) =>
                filter.type === 'eq' &&
                filter.column === 'session_id' &&
                filter.value === mockSessionId,
            );
            if (!hasSessionIdFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must filter by session_id'),
                count: 0,
                status: 400,
                statusText: 'Missing session_id filter',
              });
            }

            // Assert stage_slug filter is present
            const hasStageSlugFilter = state.filters.some(
              (filter) =>
                filter.type === 'eq' &&
                filter.column === 'stage_slug' &&
                filter.value === mockDbSession.dialectic_stages.slug,
            );
            if (!hasStageSlugFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must filter by stage_slug'),
                count: 0,
                status: 400,
                statusText: 'Missing stage_slug filter',
              });
            }

            // All filters satisfied, return success
            return Promise.resolve({
              data: [mockResource],
              error: null,
              count: 1,
              status: 200,
              statusText: 'OK',
            });
          },
        },
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

  it("should return a 500 error if seed prompt is required but not found", async () => {
    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: [mockDbSession] } },
            'dialectic_projects': { select: { data: [mockDbProject] } },
            'dialectic_project_resources': {
              select: (state: MockQueryBuilderState) => {
                // Assert JSON path predicate is NOT present
                const hasJsonPathFilter = state.filters.some((filter) => {
                  if (typeof filter.column === 'string' && filter.column.includes('resource_description->>')) {
                    return true;
                  }
                  return false;
                });
                if (hasJsonPathFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must not use JSON-path predicates on resource_description'),
                    count: 0,
                    status: 400,
                    statusText: 'JSON path filter detected',
                  });
                }

                // Assert resource_type filter is present
                const hasResourceTypeFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'resource_type' &&
                    filter.value === 'seed_prompt',
                );
                if (!hasResourceTypeFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must filter by resource_type'),
                    count: 0,
                    status: 400,
                    statusText: 'Missing resource_type filter',
                  });
                }

                // Assert session_id filter is present
                const hasSessionIdFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'session_id' &&
                    filter.value === mockSessionId,
                );
                if (!hasSessionIdFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must filter by session_id'),
                    count: 0,
                    status: 400,
                    statusText: 'Missing session_id filter',
                  });
                }

                // Assert stage_slug filter is present
                const hasStageSlugFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'stage_slug' &&
                    filter.value === mockDbSession.dialectic_stages.slug,
                );
                if (!hasStageSlugFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must filter by stage_slug'),
                    count: 0,
                    status: 400,
                    statusText: 'Missing stage_slug filter',
                  });
                }

                // All filters satisfied but no resource found
                return Promise.resolve({
                  data: null,
                  error: null,
                  count: 0,
                  status: 200,
                  statusText: 'OK',
                });
              },
            },
        },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockOwnerUser);
    
    assertEquals(result.status, 500);
    assertEquals(result.error?.code, 'MISSING_REQUIRED_RESOURCE');
    assertEquals(result.error?.message, 'Seed prompt is required but not found.');
  });

  it("should return activeSeedPrompt when seed prompt exists with iteration_number = 1 for iteration 1", async () => {
    const mockPromptContent = "This is the seed prompt for iteration 1.";
    const mockResource = { 
      id: "res-123", 
      storage_path: "path/to",
      file_name: "prompt.md",
      storage_bucket: "dialectic-contributions",
      resource_type: 'seed_prompt',
      session_id: mockSessionId,
      stage_slug: 'test-stage',
      iteration_number: 1,
    };

    const sessionWithIteration1 = {
      ...mockDbSession,
      iteration_count: 1,
    };

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: [sessionWithIteration1] } },
            'dialectic_projects': { select: { data: [mockDbProject] } },
            'dialectic_project_resources': {
              select: (state: MockQueryBuilderState) => {
                // Assert JSON path predicate is NOT present
                const hasJsonPathFilter = state.filters.some((filter) => {
                  if (typeof filter.column === 'string' && filter.column.includes('resource_description->>')) {
                    return true;
                  }
                  return false;
                });
                if (hasJsonPathFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must not use JSON-path predicates on resource_description'),
                    count: 0,
                    status: 400,
                    statusText: 'JSON path filter detected',
                  });
                }

                // Assert resource_type filter is present
                const hasResourceTypeFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'resource_type' &&
                    filter.value === 'seed_prompt',
                );
                if (!hasResourceTypeFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must filter by resource_type'),
                    count: 0,
                    status: 400,
                    statusText: 'Missing resource_type filter',
                  });
                }

                // Assert session_id filter is present
                const hasSessionIdFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'session_id' &&
                    filter.value === mockSessionId,
                );
                if (!hasSessionIdFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must filter by session_id'),
                    count: 0,
                    status: 400,
                    statusText: 'Missing session_id filter',
                  });
                }

                // Assert stage_slug filter is present
                const hasStageSlugFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'stage_slug' &&
                    filter.value === sessionWithIteration1.dialectic_stages.slug,
                );
                if (!hasStageSlugFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must filter by stage_slug'),
                    count: 0,
                    status: 400,
                    statusText: 'Missing stage_slug filter',
                  });
                }

                // Assert iteration_number filter uses .eq('iteration_number', 1) for iteration 1
                const hasIterationNumberEqFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'iteration_number' &&
                    filter.value === 1,
                );
                if (!hasIterationNumberEqFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must use .eq(\'iteration_number\', 1) for iteration 1'),
                    count: 0,
                    status: 400,
                    statusText: 'Missing iteration_number eq filter',
                  });
                }

                // Assert iteration_number IS NULL is NEVER used for iteration 1
                const hasIterationNumberIsNullFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'is' &&
                    filter.column === 'iteration_number' &&
                    filter.value === null,
                );
                if (hasIterationNumberIsNullFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must NOT use .is(\'iteration_number\', null) for iteration 1'),
                    count: 0,
                    status: 400,
                    statusText: 'Invalid iteration_number IS NULL filter detected',
                  });
                }

                // All filters satisfied, return success with the seed prompt resource
                return Promise.resolve({
                  data: [mockResource],
                  error: null,
                  count: 1,
                  status: 200,
                  statusText: 'OK',
                });
              },
            },
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
    assertExists(result.data.activeSeedPrompt, "activeSeedPrompt should be present when seed prompt exists with iteration_number = 1 for iteration 1");
    assertEquals(result.data.activeSeedPrompt?.promptContent, mockPromptContent);
    assertEquals(result.data.activeSeedPrompt?.source_prompt_resource_id, mockResource.id);
  });
}); 