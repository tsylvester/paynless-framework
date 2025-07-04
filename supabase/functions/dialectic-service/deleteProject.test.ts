import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { deleteProject } from "./deleteProject.ts";
import type { DeleteProjectPayload } from "./dialectic.interface.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import type { Database } from "../types_db.ts"; // Assuming this is the correct path for db types
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageSpies } from "../_shared/supabase.mock.ts";

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

    const filesToRemove = [
        ...mockProjectResources.map(r => r.storage_path),
        ...mockContributions.flatMap(c => [
            c.storage_path,
            c.raw_response_storage_path,
        ].filter(Boolean) as string[]),
    ];

    // 1. Mock the DB calls
    const mockProjectsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'id' && f.value === mockProjectId)) {
            return { data: [{ id: mockProjectId, user_id: mockUserId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: null, error: { name: "PGRST116", message: "Not found" }, count: 0, status: 404, statusText: "Not Found" };
    });
    
    const mockResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: mockProjectResources, error: null, count: mockProjectResources.length, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockContributionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'session_id' && f.value.includes(mockSessionId))) {
            return { data: mockContributions, error: null, count: mockContributions.length, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockProjectsDelete = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'id' && f.value === mockProjectId)) {
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
            removeResult: async (bucketId, paths) => {
                // Basic check to see if the paths to remove match what's expected
                // Sort both arrays for consistent comparison
                const sortedPaths = [...paths].sort();
                const sortedFilesToRemove = [...filesToRemove].sort();
                if (bucketId === 'dialectic-contributions' && JSON.stringify(sortedPaths) === JSON.stringify(sortedFilesToRemove)) {
                    return { data: [{ bucket: bucketId, name: 'mocked-removal' }], error: null };
                }
                return { data: null, error: new Error(`Mocked removal failed: paths did not match. Expected ${JSON.stringify(sortedFilesToRemove)}, got ${JSON.stringify(sortedPaths)}`) };
            },
        }
    };

    const { client: adminDbClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    
    // Ensure the storage spies are created by calling from()
    adminDbClient.storage.from('dialectic-contributions'); 
    const { removeSpy } = getStorageSpies(adminDbClient, 'dialectic-contributions');

    // 3. Run the function
    const response = await deleteProject(adminDbClient as any, mockPayload, mockUserId);

    // 4. Assertions
    assertEquals(response.error, undefined, "Response error should be undefined on happy path");
    assertEquals(response.status, 204);

    // Assert DB calls
    assertEquals(mockProjectsSelect.calls.length, 1, "Project select should be called once for ownership check");
    assertEquals(mockResourcesSelect.calls.length, 1, "Resources select should be called once");
    assertEquals(mockSessionsSelect.calls.length, 1, "Sessions select should be called once");
    assertEquals(mockContributionsSelect.calls.length, 1, "Contributions select should be called once");
    assertEquals(mockProjectsDelete.calls.length, 1, "Project delete should be called once");

    // Assert Storage calls
    assertExists(removeSpy, "The remove spy for the storage bucket should exist.");
    // It will be called once per bucket
    assertEquals(removeSpy.calls.length, 1, "Storage remove should be called once per bucket");
    
    // Check that the call to remove was for all the expected files
    const removedPathsInCall = removeSpy.calls[0].args[0].sort(); // Get the paths from the call and sort
    assertEquals(
        JSON.stringify(removedPathsInCall),
        JSON.stringify(filesToRemove.sort()), // Sort expected paths for comparison
        "Storage remove was not called with the correct file paths"
    );

    clearAllStubs?.();
});

Deno.test("deleteProject - Project Not Found (404)", async () => {
    const mockUserId = "user-not-found-id";
    const mockProjectId = "project-not-found-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };

    const mockProjectsSelect = spy(async (_state: any) => {
        return { data: null, error: { name: "PGRST116", message: "Not found", code: "PGRST116" }, count: 0, status: 404, statusText: "Not Found" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: { dialectic_projects: { select: mockProjectsSelect } }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const response = await deleteProject(adminDbClient, mockPayload, mockUserId);

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

    const mockProjectsSelect = spy(async (_state: any) => {
        return { data: [{ id: mockProjectId, user_id: ownerUserId }], error: null, count: 1, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: { dialectic_projects: { select: mockProjectsSelect } }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(requesterUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const response = await deleteProject(adminDbClient, mockPayload, requesterUserId);

    assertExists(response.error, "Error should exist for unauthorized access");
    assertEquals(response.status, 403);
    assertEquals(response.error?.message, "User is not authorized to delete this project.");
    assertEquals(response.data, undefined);
    assertEquals(mockProjectsSelect.calls.length, 1);
    assertEquals(functionsInvokeSpy.calls.length, 0);
    mockAdminDbClientSetup.clearAllStubs?.();
});
