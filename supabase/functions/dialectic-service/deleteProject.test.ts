import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { deleteProject } from "./deleteProject.ts";
import type { DeleteProjectPayload } from "./dialectic.interface.ts";
import { createMockSupabaseClient, type MockQueryBuilderState, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import type { Database } from "../types_db.ts"; // Assuming this is the correct path for db types
import type { SupabaseClient } from "@supabase/supabase-js";

// Define mock STORAGE_BUCKETS to resolve linter errors
const STORAGE_BUCKETS = {
    DIALECTIC_CONTRIBUTIONS: "mock-dialectic-contributions-bucket",
    dialectic_contributions: "mock-dialectic-contributions-bucket",
};

Deno.test("deleteProject - Happy Path: successfully deletes a project and its resources", async () => {
    const mockUserId = "user-happy-path-id";
    const mockProjectId = "project-happy-path-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };

    const mockProjectResources = [
        { storage_bucket: 'dialectic-contributions', storage_path: `projects/${mockProjectId}/project_file1.md` },
    ];
    const mockSessionId = "session-happy-path-id";
    const mockContributions = [
        {
            storage_bucket: 'dialectic-contributions',
            storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contrib1.md`,
            raw_response_storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contrib1_raw.json`,
        },
        {
            storage_bucket: 'dialectic-contributions',
            storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contrib2.md`,
            raw_response_storage_path: null, // Test case with no raw response path
        },
    ];

    const projectRootPath = `projects/${mockProjectId}`;
    const filesInStorageList = [
        { id: '1', name: 'project_file1.md', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} },
        { id: undefined, name: 'sessions', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} }
    ];
    const sessionFolderPath = `${projectRootPath}/sessions`;
    const filesInSessionFolderList = [
        { id: '2', name: 'contrib1.md', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} },
        { id: '3', name: 'contrib1_raw.json', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} },
        { id: '4', name: 'contrib2.md', created_at: '', updated_at: '', last_accessed_at: '', metadata: {} }
    ];
    const filesToRemove = [
        `${projectRootPath}/project_file1.md`,
        `${sessionFolderPath}/contrib1.md`,
        `${sessionFolderPath}/contrib1_raw.json`,
        `${sessionFolderPath}/contrib2.md`
    ].sort();

    const listCalls: string[] = [];
    const removeCalls: string[][] = [];

    // 1. Mock the DB calls
    const mockProjectsSelect = spy(async (state: MockQueryBuilderState) => {
        if (state.filters.some((f) => f.column === 'id' && f.value === mockProjectId)) {
            return { data: [{ id: mockProjectId, user_id: mockUserId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: null, error: { name: "PGRST116", message: "Not found" }, count: 0, status: 404, statusText: "Not Found" };
    });
    
    const mockResourcesSelect = spy(async (state: MockQueryBuilderState) => {
        if (state.filters.some((f) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockSessionsSelect = spy(async (state: MockQueryBuilderState) => {
        if (state.filters.some((f) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockContributionsSelect = spy(async (state: MockQueryBuilderState) => {
        if (state.filters.some((f) => f.column === 'session_id' && Array.isArray(f.value) && f.value.includes(mockSessionId))) {
            return { data: mockContributions, error: null, count: mockContributions.length, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockProjectsDelete = spy(async (state: MockQueryBuilderState) => {
        if (state.filters.some((f) => f.column === 'id' && f.value === mockProjectId)) {
            return { data: [{ id: mockProjectId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: null, error: new Error("Failed to delete project in mock"), count: 0, status: 500, statusText: "Error" };
    });

    // 2. Set up the mock client with storage mock results
    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_project_resources: { select: mockResourcesSelect },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
        },
        storageMock: {
            listResult: async (_bucketId: string, path: string | undefined, _options: unknown) => {
                if (path !== undefined) listCalls.push(path);
                if (path === projectRootPath) return { data: filesInStorageList, error: null };
                if (path === sessionFolderPath) return { data: filesInSessionFolderList, error: null };
                if (path === `${projectRootPath}/sessions/sessions`) return { data: [], error: null };
                return { data: [], error: new Error(`Mock list not configured for path: ${path}`) };
            },
            removeResult: async (bucketId: string, paths: string[]) => {
                removeCalls.push([...paths]);
                if (bucketId === 'dialectic-contributions' && paths.length > 0) {
                    return { data: [{ bucket: bucketId, name: 'mocked-removal' }], error: null };
                }
                return { data: null, error: new Error(`Mocked removal failed for bucket ${bucketId} with paths: ${JSON.stringify(paths)}`) };
            },
        }
    };

    const { client: adminDbClient, clearAllStubs } = createMockSupabaseClient(mockUserId, mockAdminDbConfig);

    // 3. Run the function
    const response = await deleteProject(adminDbClient as unknown as SupabaseClient<Database>, mockPayload, mockUserId);

    // 4. Assertions
    assertEquals(response.error, undefined, "Response error should be undefined on happy path");
    assertEquals(response.status, 204);

    // Assert DB calls
    assertEquals(mockProjectsSelect.calls.length, 1, "Project select should be called once for ownership check");
    assertEquals(mockResourcesSelect.calls.length, 1, "Resources select should be called once to get buckets");
    assertEquals(mockSessionsSelect.calls.length, 1, "Sessions select should be called once to get buckets");
    assertEquals(mockContributionsSelect.calls.length, 1, "Contributions select should be called once to get buckets");
    assertEquals(mockProjectsDelete.calls.length, 1, "Project delete should be called once");

    // Assert Storage calls (recorded in listResult/removeResult callbacks)
    assertEquals(listCalls.length, 2, "Storage list should be called for the root project folder and the sessions sub-folder.");
    assertEquals(removeCalls.length, 2, "Storage remove should be called once for files in root, and once for files in session folder.");
    const allRemovedPaths = removeCalls.flatMap((paths: string[]) => paths).sort();
    assertEquals(
        JSON.stringify(allRemovedPaths),
        JSON.stringify(filesToRemove),
        "Storage remove was not called with the correct file paths across all calls"
    );

    clearAllStubs?.();
});

Deno.test("deleteProject - Project Not Found (404)", async () => {
    const mockUserId = "user-not-found-id";
    const mockProjectId = "project-not-found-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };

    const mockProjectsSelect = spy(async (_state: MockQueryBuilderState) => {
        return { data: null, error: { name: "PGRST116", message: "Not found", code: "PGRST116" }, count: 0, status: 404, statusText: "Not Found" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: { dialectic_projects: { select: mockProjectsSelect } }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client;
    const functionsInvokeSpy = spy(async (_fn: string, _opts: unknown) => ({ data: null, error: null }));
    adminDbClient.functions = { invoke: functionsInvokeSpy };

    const response = await deleteProject(adminDbClient as unknown as SupabaseClient<Database>, mockPayload, mockUserId);

    assertExists(response.error, "Error should exist for not found project");
    assertEquals(response.status, 404);
    assertEquals(response.error?.message, `Project with ID ${mockProjectId} not found.`);
    assertEquals(response.data, undefined);
    assertEquals(mockProjectsSelect.calls.length, 1);
    assertEquals(functionsInvokeSpy.calls.length, 0);
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - User Not Authorized (403)", async () => {
    const ownerUserId = "owner-user-id";
    const requesterUserId = "requester-user-id";
    const mockProjectId = "project-auth-fail-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };

    const mockProjectsSelect = spy(async (_state: MockQueryBuilderState) => {
        return { data: [{ id: mockProjectId, user_id: ownerUserId }], error: null, count: 1, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: { dialectic_projects: { select: mockProjectsSelect } }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(requesterUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client;
    const functionsInvokeSpy = spy(async (_fn: string, _opts: unknown) => ({ data: null, error: null }));
    adminDbClient.functions = { invoke: functionsInvokeSpy };

    const response = await deleteProject(adminDbClient as unknown as SupabaseClient<Database>, mockPayload, requesterUserId);

    assertExists(response.error, "Error should exist for unauthorized access");
    assertEquals(response.status, 403);
    assertEquals(response.error?.message, "User is not authorized to delete this project.");
    assertEquals(response.data, undefined);
    assertEquals(mockProjectsSelect.calls.length, 1);
    assertEquals(functionsInvokeSpy.calls.length, 0);
    mockAdminDbClientSetup.clearAllStubs?.();
});
