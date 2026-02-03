import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { 
  describe, 
  it, 
  beforeEach, 
  afterEach 
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { User } from 'npm:@supabase/supabase-js';
import { SelectedModels } from './dialectic.interface.ts';
import { getSessionDetails } from './getSessionDetails.ts';
import { logger } from '../_shared/logger.ts';
import { 
  createMockSupabaseClient, 
  MockSupabaseClientSetup, 
  MockQueryBuilderState 
} from '../_shared/supabase.mock.ts';

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

  /** Session row as returned by PostgREST: dialectic_sessions has selected_model_ids (string[] | null), not selected_models. */
  const mockDbSession = {
    id: mockSessionId,
    project_id: mockProjectId,
    current_stage_id: mockStageId,
    iteration_count: 1,
    dialectic_stages: { id: mockStageId, slug: 'test-stage' },
    selected_model_ids: null as string[] | null,
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

  it("should return full session details including the activeSeedPrompt on success when skipSeedPrompt is false", async () => {
    const mockPromptContent = "This is the seed prompt from storage.";
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

            // Assert stage_slug filter is NOT present (only one seed_prompt per session exists)
            const hasStageSlugFilter = state.filters.some(
              (filter) =>
                filter.type === 'eq' &&
                filter.column === 'stage_slug',
            );
            if (hasStageSlugFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must NOT filter by stage_slug - only one seed_prompt exists per session'),
                count: 0,
                status: 400,
                statusText: 'Unnecessary stage_slug filter detected',
              });
            }

            // Assert iteration_number filter is NOT present (only one seed_prompt per session exists)
            const hasIterationNumberFilter = state.filters.some(
              (filter) =>
                filter.type === 'eq' &&
                filter.column === 'iteration_number',
            );
            if (hasIterationNumberFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must NOT filter by iteration_number - only one seed_prompt exists per session'),
                count: 0,
                status: 400,
                statusText: 'Unnecessary iteration_number filter detected',
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

    const result = await getSessionDetails({ sessionId: mockSessionId, skipSeedPrompt: false }, mockClientSetup.client as any, mockOwnerUser);
    
    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.id, mockSessionId);
    assertEquals(result.data.session.selected_models, [], "selected_models should be empty when session has no selected models");
    assertExists(result.data.activeSeedPrompt, "activeSeedPrompt should be present in the response when skipSeedPrompt is false");
    assertEquals(result.data.activeSeedPrompt?.promptContent, mockPromptContent);
  });

  it("should skip seed prompt query and return activeSeedPrompt as null when skipSeedPrompt is true", async () => {
    let dialecticProjectResourcesSelectCalled = false;

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
      genericMockResults: {
        'dialectic_sessions': { select: { data: [mockDbSession] } },
        'dialectic_projects': { select: { data: [mockDbProject] } },
        'dialectic_project_resources': {
          select: () => {
            dialecticProjectResourcesSelectCalled = true;
            return Promise.resolve({
              data: null,
              error: new Error('dialectic_project_resources select should not be called when skipSeedPrompt is true'),
              count: 0,
              status: 400,
              statusText: 'Query should not be executed',
            });
          },
        },
      },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId, skipSeedPrompt: true }, mockClientSetup.client as any, mockOwnerUser);
    
    assertEquals(dialecticProjectResourcesSelectCalled, false, "dialectic_project_resources select should NOT be called when skipSeedPrompt is true");
    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.id, mockSessionId);
    assertEquals(result.data.session.selected_models, [], "selected_models should be present and empty when session has no selected models");
    assertEquals(result.data.activeSeedPrompt, null, "activeSeedPrompt should be null when skipSeedPrompt is true");
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

  it("should return a 500 error if seed prompt is required but not found when skipSeedPrompt is false", async () => {
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

                // Assert stage_slug filter is NOT present (only one seed_prompt per session exists)
                const hasStageSlugFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'stage_slug',
                );
                if (hasStageSlugFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must NOT filter by stage_slug - only one seed_prompt exists per session'),
                    count: 0,
                    status: 400,
                    statusText: 'Unnecessary stage_slug filter detected',
                  });
                }

                // Assert iteration_number filter is NOT present (only one seed_prompt per session exists)
                const hasIterationNumberFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'iteration_number',
                );
                if (hasIterationNumberFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must NOT filter by iteration_number - only one seed_prompt exists per session'),
                    count: 0,
                    status: 400,
                    statusText: 'Unnecessary iteration_number filter detected',
                  });
                }

                // All filters satisfied but no resource found (PGRST116)
                return Promise.resolve({
                  data: null,
                  error: { name: 'MockDBError', code: 'PGRST116', message: 'Not found' },
                  count: 0,
                  status: 200,
                  statusText: 'OK',
                });
              },
            },
        },
    });

    const result = await getSessionDetails({ sessionId: mockSessionId, skipSeedPrompt: false }, mockClientSetup.client as any, mockOwnerUser);
    
    assertEquals(result.status, 500);
    assertEquals(result.error?.code, 'MISSING_REQUIRED_RESOURCE');
    assertEquals(result.error?.message, 'Seed prompt is required but not found.');
  });

  it("should return activeSeedPrompt when seed prompt exists", async () => {
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

    // Session has progressed to iteration 3, but seed_prompt is always at iteration 1
    const sessionWithIteration3 = {
      ...mockDbSession,
      iteration_count: 3,
    };

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
        genericMockResults: {
            'dialectic_sessions': { select: { data: [sessionWithIteration3] } },
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

                // Assert stage_slug filter is NOT present (only one seed_prompt per session exists)
                const hasStageSlugFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'stage_slug',
                );
                if (hasStageSlugFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must NOT filter by stage_slug - only one seed_prompt exists per session'),
                    count: 0,
                    status: 400,
                    statusText: 'Unnecessary stage_slug filter detected',
                  });
                }

                // Assert iteration_number filter is NOT present (only one seed_prompt per session exists)
                const hasIterationNumberFilter = state.filters.some(
                  (filter) =>
                    filter.type === 'eq' &&
                    filter.column === 'iteration_number',
                );
                if (hasIterationNumberFilter) {
                  return Promise.resolve({
                    data: null,
                    error: new Error('seed_prompt queries must NOT filter by iteration_number - only one seed_prompt exists per session'),
                    count: 0,
                    status: 400,
                    statusText: 'Unnecessary iteration_number filter detected',
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

    const result = await getSessionDetails({ sessionId: mockSessionId, skipSeedPrompt: false }, mockClientSetup.client as any, mockOwnerUser);
    
    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.id, mockSessionId);
    assertEquals(result.data.session.iteration_count, 3, "Session should have iteration_count = 3");
    assertExists(result.data.activeSeedPrompt, "activeSeedPrompt should be present when seed prompt exists, regardless of session.iteration_count");
    assertEquals(result.data.activeSeedPrompt?.promptContent, mockPromptContent);
    assertEquals(result.data.activeSeedPrompt?.source_prompt_resource_id, mockResource.id);
  });

  it("should use skipSeedPrompt default to false when not provided and fetch seed prompt", async () => {
    const mockPromptContent = "This is the seed prompt from storage (default behavior).";
    const mockResource = { 
      id: "res-456", 
      storage_path: "path/to",
      file_name: "prompt.md",
      storage_bucket: "dialectic-contributions",
      resource_type: 'seed_prompt',
      session_id: mockSessionId,
      stage_slug: 'test-stage',
      iteration_number: 1,
    };

    let queryWasCalled = false;

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
      genericMockResults: {
        'dialectic_sessions': { select: { data: [mockDbSession] } },
        'dialectic_projects': { select: { data: [mockDbProject] } },
        'dialectic_project_resources': {
          select: (state: MockQueryBuilderState) => {
            queryWasCalled = true;
            
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

            // Assert stage_slug filter is NOT present (only one seed_prompt per session exists)
            const hasStageSlugFilter = state.filters.some(
              (filter) =>
                filter.type === 'eq' &&
                filter.column === 'stage_slug',
            );
            if (hasStageSlugFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must NOT filter by stage_slug - only one seed_prompt exists per session'),
                count: 0,
                status: 400,
                statusText: 'Unnecessary stage_slug filter detected',
              });
            }

            // Assert iteration_number filter is NOT present (only one seed_prompt per session exists)
            const hasIterationNumberFilter = state.filters.some(
              (filter) =>
                filter.type === 'eq' &&
                filter.column === 'iteration_number',
            );
            if (hasIterationNumberFilter) {
              return Promise.resolve({
                data: null,
                error: new Error('seed_prompt queries must NOT filter by iteration_number - only one seed_prompt exists per session'),
                count: 0,
                status: 400,
                statusText: 'Unnecessary iteration_number filter detected',
              });
            }

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

    // Call without skipSeedPrompt (should default to false and fetch)
    const result = await getSessionDetails({ sessionId: mockSessionId }, mockClientSetup.client as any, mockOwnerUser);
    
    assertEquals(queryWasCalled, true, "dialectic_project_resources query should be called when skipSeedPrompt is not provided (defaults to false)");
    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertExists(result.data.activeSeedPrompt, "activeSeedPrompt should be present when skipSeedPrompt is not provided (defaults to false)");
    assertEquals(result.data.activeSeedPrompt?.promptContent, mockPromptContent);
  });

  it("should build selected_models from session.selected_model_ids (DB column) with id and displayName", async () => {
    const selectedModelIds: string[] = ["model-a", "model-b"];
    const sessionWithSelectedModelIds = {
      ...mockDbSession,
      selected_model_ids: selectedModelIds,
    };

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
      genericMockResults: {
        "dialectic_sessions": { select: { data: [sessionWithSelectedModelIds] } },
        "dialectic_projects": { select: { data: [mockDbProject] } },
        "dialectic_project_resources": {
          select: () =>
            Promise.resolve({
              data: null,
              error: new Error("seed_prompt query should not be called when skipSeedPrompt is true"),
              count: 0,
              status: 400,
              statusText: "Not called",
            }),
        },
      },
    });

    const result = await getSessionDetails(
      { sessionId: mockSessionId, skipSeedPrompt: true },
      mockClientSetup.client as any,
      mockOwnerUser
    );

    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.id, mockSessionId);
    assertEquals(
      result.data.session.selected_models.length,
      selectedModelIds.length,
      "selected_models should be built from selected_model_ids with same length"
    );
    assertEquals(
      result.data.session.selected_models[0].id,
      "model-a",
      "first selected model id should match selected_model_ids[0]"
    );
    assertExists(
      result.data.session.selected_models[0].displayName,
      "first selected model must have displayName"
    );
    assertEquals(
      result.data.session.selected_models[1].id,
      "model-b",
      "second selected model id should match selected_model_ids[1]"
    );
    assertExists(
      result.data.session.selected_models[1].displayName,
      "second selected model must have displayName"
    );
  });

  it("should return selected_models empty when session.selected_model_ids is null", async () => {
    const sessionWithNullIds = {
      ...mockDbSession,
      selected_model_ids: null,
    };

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
      genericMockResults: {
        "dialectic_sessions": { select: { data: [sessionWithNullIds] } },
        "dialectic_projects": { select: { data: [mockDbProject] } },
        "dialectic_project_resources": {
          select: () =>
            Promise.resolve({
              data: null,
              error: new Error("seed_prompt query should not be called when skipSeedPrompt is true"),
              count: 0,
              status: 400,
              statusText: "Not called",
            }),
        },
      },
    });

    const result = await getSessionDetails(
      { sessionId: mockSessionId, skipSeedPrompt: true },
      mockClientSetup.client as any,
      mockOwnerUser
    );

    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.selected_models.length, 0, "selected_models should be empty when selected_model_ids is null");
  });

  it("should return selected_models empty when session.selected_model_ids is empty array", async () => {
    const sessionWithEmptyIds = {
      ...mockDbSession,
      selected_model_ids: [] as string[],
    };

    mockClientSetup = createMockSupabaseClient(mockOwnerUser.id, {
      genericMockResults: {
        "dialectic_sessions": { select: { data: [sessionWithEmptyIds] } },
        "dialectic_projects": { select: { data: [mockDbProject] } },
        "dialectic_project_resources": {
          select: () =>
            Promise.resolve({
              data: null,
              error: new Error("seed_prompt query should not be called when skipSeedPrompt is true"),
              count: 0,
              status: 400,
              statusText: "Not called",
            }),
        },
      },
    });

    const result = await getSessionDetails(
      { sessionId: mockSessionId, skipSeedPrompt: true },
      mockClientSetup.client as any,
      mockOwnerUser
    );

    assertExists(result.data, "Response data should exist on success");
    assertEquals(result.status, 200);
    assertEquals(result.data.session.selected_models.length, 0, "selected_models should be empty when selected_model_ids is []");
  });
}); 