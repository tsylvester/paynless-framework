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
    const projectFolderPath = `projects/${mockProjectId}`;

    const mockFileList = [
        { name: 'file1.md', id: 'file1-id' },
        { name: 'folder1/file2.txt', id: 'file2-id' },
    ];
    const filesToRemove = mockFileList.map(f => `${projectFolderPath}/${f.name}`);

    // 1. Mock the DB calls
    const mockProjectsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'id' && f.value === mockProjectId)) {
            return { data: [{ id: mockProjectId, user_id: mockUserId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: null, error: { name: "PGRST116", message: "Not found" }, count: 0, status: 404, statusText: "Not Found" };
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
        },
        storageMock: {
            listResult: async (_bucketId, path, _options) => {
                if (path === projectFolderPath) {
                    return { data: mockFileList, error: null };
                }
                return { data: [], error: null };
            },
            removeResult: async (_bucketId, paths) => {
                if (JSON.stringify(paths.sort()) === JSON.stringify(filesToRemove.sort())) {
                    return { data: [{ bucket: 'dialectic-contributions', name: 'mocked-removal' }], error: null };
                }
                return { data: null, error: new Error("Mocked removal failed: paths did not match.") };
            },
        }
    };

    const { client: adminDbClient, spies, clearAllStubs } = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    
    // Ensure the storage spies are created by calling from()
    adminDbClient.storage.from('dialectic-contributions'); 
    const { listSpy, removeSpy } = getStorageSpies(adminDbClient, 'dialectic-contributions');

    // 3. Run the function
    const response = await deleteProject(adminDbClient as any, mockPayload, mockUserId);

    // 4. Assertions
    assertEquals(response.error, undefined, "Response error should be undefined on happy path");
    assertEquals(response.status, 204);

    // Assert DB calls
    assertEquals(mockProjectsSelect.calls.length, 1, "Project select should be called once for ownership check");
    assertEquals(mockProjectsDelete.calls.length, 1, "Project delete should be called once");

    // Assert Storage calls
    assertExists(listSpy, "The list spy for the storage bucket should exist.");
    assertEquals(listSpy.calls.length, 1, "Storage list should be called once");
    assertEquals(listSpy.calls[0].args[0], projectFolderPath, "Storage list should be called with the correct folder path");
    
    assertExists(removeSpy, "The remove spy for the storage bucket should exist.");
    assertEquals(removeSpy.calls.length, 1, "Storage remove should be called once");
    assertEquals(
        JSON.stringify(removeSpy.calls[0].args[0].sort()),
        JSON.stringify(filesToRemove.sort()),
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
