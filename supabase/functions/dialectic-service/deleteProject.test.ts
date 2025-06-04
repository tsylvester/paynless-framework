import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { deleteProject } from "./deleteProject.ts";
import type { DeleteProjectPayload } from "./dialectic.interface.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import type { Database } from "../types_db.ts"; // Assuming this is the correct path for db types
import type { SupabaseClient } from "@supabase/supabase-js";

// Define mock STORAGE_BUCKETS to resolve linter errors
const STORAGE_BUCKETS = {
    DIALECTIC_CONTRIBUTIONS: "mock-dialectic-contributions-bucket",
    DIALECTIC_PROJECT_RESOURCES: "mock-dialectic-project-resources-bucket",
};

Deno.test("deleteProject - Happy Path: successfully deletes a project and its resources", async () => {
    const mockUserId = "user-happy-path-id";
    const mockProjectId = "project-happy-path-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };

    const mockSessionsData = [{ id: "session-1" }, { id: "session-2" }];
    const mockContributionsData = [
        { id: "contrib-1", session_id: "session-1", content_storage_path: "path/c1.txt", raw_response_storage_path: "path/r1.json", content_storage_bucket: STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS },
        { id: "contrib-2", session_id: "session-2", content_storage_path: "path/c2.md", raw_response_storage_path: null, content_storage_bucket: STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS },
    ];
    const mockProjectResourcesData = [
        { id: "res-1", project_id: mockProjectId, storage_path: "resources/file1.pdf", storage_bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES },
        { id: "res-2", project_id: mockProjectId, storage_path: "resources/image.png", storage_bucket: "other-bucket" },
    ];

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
    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: mockSessionsData, error: null, count: mockSessionsData.length, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockContributionsSelect = spy(async (state: any) => {
        const sessionIds = mockSessionsData.map(s => s.id);
        if (state.filters.some((f: any) => f.column === 'session_id' && Array.isArray(f.value) && f.value.every((val: any) => sessionIds.includes(val as string)))) {
            return { data: mockContributionsData, error: null, count: mockContributionsData.length, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockProjectResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: mockProjectResourcesData, error: null, count: mockProjectResourcesData.length, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect },
        }
    };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const functionsInvokeSpy = spy(async (_functionName: string, _options: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const response = await deleteProject(adminDbClient, mockPayload, mockUserId);

    assertEquals(response.error, undefined, "Response error should be undefined on happy path");
    assertEquals(response.data, undefined, "Response data should be undefined on happy path");

    assertEquals(mockProjectsSelect.calls.length, 1, "Project select should be called once for ownership check");
    assertEquals(mockSessionsSelect.calls.length, 1, "Sessions select should be called once");
    assertEquals(mockContributionsSelect.calls.length, 1, "Contributions select should be called once");
    assertEquals(mockProjectResourcesSelect.calls.length, 1, "Project resources select should be called once");
    
    assertEquals(functionsInvokeSpy.calls.length, 3, "Should call storage-cleanup-service 3 times");
    const expectedCleanupCalls = [
        { bucket: STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS, paths: ["path/c1.txt", "path/r1.json", "path/c2.md"] },
        { bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES, paths: ["resources/file1.pdf"] },
        { bucket: "other-bucket", paths: ["resources/image.png"] }
    ];
    for (const expectedCall of expectedCleanupCalls) {
        const matchingCall = functionsInvokeSpy.calls.find(call => 
            call.args[0] === 'storage-cleanup-service' &&
            call.args[1].body.bucket === expectedCall.bucket &&
            JSON.stringify(call.args[1].body.paths.sort()) === JSON.stringify(expectedCall.paths.sort())
        );
        assertExists(matchingCall, `Expected cleanup call for bucket ${expectedCall.bucket} not found or paths mismatch.`);
    }
    assertEquals(mockProjectsDelete.calls.length, 1, "Project delete should be called once");
    mockAdminDbClientSetup.clearAllStubs?.();
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

Deno.test("deleteProject - Error fetching sessions (should still proceed)", async () => {
    const mockUserId = "user-session-fetch-error-id";
    const mockProjectId = "project-session-fetch-error-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };

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
    const mockSessionsSelect = spy(async (_state: any) => {
        return { data: null, error: new Error("Simulated DB error fetching sessions") as any, count: 0, status: 500, statusText: "Internal Server Error" };
    });
    const mockContributionsSelect = spy(async (_state: any) => { 
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockProjectResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: "res-x", project_id: mockProjectId, storage_path: "resources/some_file.pdf", storage_bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;
    
    const consoleErrorSpy = spy(console, "error");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);

        assertEquals(response.error, undefined, "Response error should be undefined even if session fetch failed");
        assertEquals(response.data, undefined, "Response data should be undefined");
        assertEquals(response.status, 204, "Response status should be 204 No Content");

        assertEquals(consoleErrorSpy.calls.length, 1);
        assertExists(consoleErrorSpy.calls[0].args.find(arg => typeof arg === 'string' && arg.includes("Error fetching sessions for project")));
        
        assertEquals(mockSessionsSelect.calls.length, 1);
        assertEquals(mockContributionsSelect.calls.length, 0); // Should not be called if sessions fail and sessionIds is empty
        assertEquals(mockProjectResourcesSelect.calls.length, 1);
        assertEquals(functionsInvokeSpy.calls.length, 1); // Only project resources
        assertExists(functionsInvokeSpy.calls.find(call => call.args[1].body.bucket === STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES && call.args[1].body.paths[0] === "resources/some_file.pdf")); // Path defined in this test
        assertEquals(mockProjectsDelete.calls.length, 1);
    } finally {
        consoleErrorSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - No sessions found (should still proceed)", async () => {
    const mockUserId = "user-no-sessions-id";
    const mockProjectId = "project-no-sessions-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const mockProjectResourcePath = "resources/file_for_no_session_case.txt";

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
    const mockSessionsSelect = spy(async (_state: any) => {
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" }; // No sessions
    });
    const mockContributionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'session_id' && Array.isArray(f.value) && f.value.length === 0)) {
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
        }
        return { data: [{id: "unexpected-contrib"}], error: new Error("Contributions mock called unexpectedly"), count: 1, status: 500, statusText: "Error" };
    });
    const mockProjectResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: "res-y", project_id: mockProjectId, storage_path: mockProjectResourcePath, storage_bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect }, 
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleInfoSpy = spy(console, "info");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);

        assertEquals(response.error, undefined);
        assertEquals(response.status, 204);
        assertEquals(mockSessionsSelect.calls.length, 1);
        assertEquals(mockContributionsSelect.calls.length, 0); // Should NOT be called if sessions is empty
        assertEquals(mockProjectResourcesSelect.calls.length, 1);
        assertEquals(functionsInvokeSpy.calls.length, 1); // Only project resources, as contributions paths are empty
        assertExists(functionsInvokeSpy.calls.find(call => call.args[1].body.bucket === STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES && call.args[1].body.paths[0] === mockProjectResourcePath));
        assertEquals(mockProjectsDelete.calls.length, 1);
    } finally {
        consoleInfoSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - Error fetching contributions (should still proceed)", async () => {
    const mockUserId = "user-contrib-fetch-error-id";
    const mockProjectId = "project-contrib-fetch-error-id";
    const mockSessionId = "session-for-contrib-error";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const mockProjectResourcePath = "resources/file_for_contrib_error_case.txt";

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
    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId, project_id: mockProjectId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockContributionsSelect = spy(async (_state: any) => {
        return { data: null, error: new Error("Simulated DB error fetching contributions") as any, count: 0, status: 500, statusText: "Internal Server Error" };
    });
    const mockProjectResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: "res-z", project_id: mockProjectId, storage_path: mockProjectResourcePath, storage_bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleErrorSpy = spy(console, "error");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);
        assertEquals(response.error, undefined);
        assertEquals(response.status, 204);
        assertEquals(consoleErrorSpy.calls.length, 1);
        assertExists(consoleErrorSpy.calls[0].args.find(arg => typeof arg === 'string' && arg.includes("Error fetching contributions for project deletion")));
        assertEquals(mockContributionsSelect.calls.length, 1);
        assertEquals(mockProjectResourcesSelect.calls.length, 1);
        assertEquals(functionsInvokeSpy.calls.length, 1); // Only project resources, as contributions errored resulting in empty paths
        assertExists(functionsInvokeSpy.calls.find(call => call.args[1].body.bucket === STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES && call.args[1].body.paths[0] === mockProjectResourcePath));
        assertEquals(mockProjectsDelete.calls.length, 1);
    } finally {
        consoleErrorSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - No contributions found (should still proceed)", async () => {
    const mockUserId = "user-no-contribs-id";
    const mockProjectId = "project-no-contribs-id";
    const mockSessionId = "session-for-no-contribs";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const mockProjectResourcePath = "resources/file_for_no_contribs_case.txt";

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
    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId, project_id: mockProjectId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockContributionsSelect = spy(async (_state: any) => { // No contributions found
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockProjectResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: "res-a", project_id: mockProjectId, storage_path: mockProjectResourcePath, storage_bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleInfoSpy = spy(console, "info");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);
        assertEquals(response.error, undefined);
        assertEquals(response.status, 204);
        assertEquals(mockProjectResourcesSelect.calls.length, 1); // Called, found none
        assertEquals(functionsInvokeSpy.calls.length, 1); // Only project resources as contribs paths are empty
        assertExists(functionsInvokeSpy.calls.find(call => call.args[1].body.bucket === STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES && call.args[1].body.paths[0] === mockProjectResourcePath));
        assertEquals(mockProjectsDelete.calls.length, 1);
    } finally {
        consoleInfoSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - Error fetching project resources (should still proceed)", async () => {
    const mockUserId = "user-resource-fetch-error-id";
    const mockProjectId = "project-resource-fetch-error-id";
    const mockSessionId = "session-for-resource-error";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const mockContributionPath = "contributions/path/c1.txt";

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
    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId, project_id: mockProjectId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockContributionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'session_id' && Array.isArray(f.value) && f.value.includes(mockSessionId))) {
            return { data: [{ id: "contrib-x", session_id: mockSessionId, content_storage_path: mockContributionPath, raw_response_storage_path: null, content_storage_bucket: STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockProjectResourcesSelect = spy(async (_state: any) => {
        return { data: null, error: new Error("Simulated DB error fetching project resources") as any, count: 0, status: 500, statusText: "Internal Server Error" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleErrorSpy = spy(console, "error");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);
        assertEquals(response.error, undefined);
        assertEquals(response.status, 204);
        assertEquals(consoleErrorSpy.calls.length, 1);
        assertExists(consoleErrorSpy.calls[0].args.find(arg => typeof arg === 'string' && arg.includes("Error fetching project resources for deletion")));
        assertEquals(mockProjectResourcesSelect.calls.length, 1);
        assertEquals(functionsInvokeSpy.calls.length, 1); // Only contributions, as project resources errored
        assertExists(functionsInvokeSpy.calls.find(call => call.args[1].body.bucket === STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS && call.args[1].body.paths[0] === mockContributionPath));
        assertEquals(mockProjectsDelete.calls.length, 1);
    } finally {
        consoleErrorSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - No project resources found (should still proceed)", async () => {
    const mockUserId = "user-no-resources-id";
    const mockProjectId = "project-no-resources-id";
    const mockSessionId = "session-for-no-resources";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const mockContributionPath = "contributions/path/c_no_res.txt";

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
    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId, project_id: mockProjectId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockContributionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'session_id' && Array.isArray(f.value) && f.value.includes(mockSessionId))) {
            return { data: [{ id: "contrib-y", session_id: mockSessionId, content_storage_path: mockContributionPath, raw_response_storage_path: null, content_storage_bucket: STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockProjectResourcesSelect = spy(async (_state: any) => { // No project resources
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleInfoSpy = spy(console, "info");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);
        assertEquals(response.error, undefined);
        assertEquals(response.status, 204);
        assertEquals(mockProjectResourcesSelect.calls.length, 1); // Called, found none
        assertEquals(functionsInvokeSpy.calls.length, 1); // Only contributions, as project resource paths are empty
        assertExists(functionsInvokeSpy.calls.find(call => call.args[1].body.bucket === STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS && call.args[1].body.paths[0] === mockContributionPath));
        assertEquals(mockProjectsDelete.calls.length, 1);
    } finally {
        consoleInfoSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - Error during storage-cleanup-service invocation (should still proceed)", async () => {
    const mockUserId = "user-storage-cleanup-error-id";
    const mockProjectId = "project-storage-cleanup-error-id";
    const mockSessionId = "session-for-storage-error";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const mockContributionPath = "contributions/path/c_storage_error.txt";
    const mockResourcePath = "resources/r_storage_error.pdf";

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
    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId, project_id: mockProjectId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockContributionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'session_id' && Array.isArray(f.value) && f.value.includes(mockSessionId))) {
            return { data: [{ id: "contrib-z", session_id: mockSessionId, content_storage_path: mockContributionPath, raw_response_storage_path: null, content_storage_bucket: STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockProjectResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: "res-b", project_id: mockProjectId, storage_path: mockResourcePath, storage_bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (functionName: string, options: { body: { bucket: string }}) => {
        if (functionName === 'storage-cleanup-service' && options.body.bucket === STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS) {
            return { data: null, error: { message: "Simulated storage-cleanup-service error for contributions" } };
        }
        return { data: null, error: null };
    });
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleErrorSpy = spy(console, "error");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);
        assertEquals(response.error, undefined);
        assertEquals(response.status, 204);
        assertEquals(consoleErrorSpy.calls.length, 1);
        assertExists(consoleErrorSpy.calls[0].args.find(arg => 
            typeof arg === 'string' && 
            arg.includes(`Error cleaning storage for bucket ${STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS}:`) &&
            consoleErrorSpy.calls[0].args.some(a => typeof a === 'object' && a !== null && (a as any).message === "Simulated storage-cleanup-service error for contributions")
        ));
        assertEquals(functionsInvokeSpy.calls.length, 2);
        assertEquals(mockProjectsDelete.calls.length, 1);
    } finally {
        consoleErrorSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - Error during final project deletion from DB (returns 500)", async () => {
    const mockUserId = "user-final-delete-error-id";
    const mockProjectId = "project-final-delete-error-id";
    const mockSessionId = "session-for-final-delete-error";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const mockContributionPath = "contributions/path/c_final_delete_error.txt";
    const mockResourcePath = "resources/r_final_delete_error.pdf";

    const mockProjectsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'id' && f.value === mockProjectId)) {
            return { data: [{ id: mockProjectId, user_id: mockUserId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: null, error: { name: "PGRST116", message: "Not found" }, count: 0, status: 404, statusText: "Not Found" };
    });
    const mockProjectsDelete = spy(async (_state: any) => {
        return { data: null, error: { name: "DBError", message: "Simulated DB error on final project delete", code: "XXYYZ" } as any, count: 0, status: 500, statusText: "Internal Server Error" };
    });
    const mockSessionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: mockSessionId, project_id: mockProjectId }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockContributionsSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'session_id' && Array.isArray(f.value) && f.value.includes(mockSessionId))) {
            return { data: [{ id: "contrib-final-err", session_id: mockSessionId, content_storage_path: mockContributionPath, raw_response_storage_path: null, content_storage_bucket: STORAGE_BUCKETS.DIALECTIC_CONTRIBUTIONS }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });
    const mockProjectResourcesSelect = spy(async (state: any) => {
        if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
            return { data: [{ id: "res-final-err", project_id: mockProjectId, storage_path: mockResourcePath, storage_bucket: STORAGE_BUCKETS.DIALECTIC_PROJECT_RESOURCES }], error: null, count: 1, status: 200, statusText: "OK" };
        }
        return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: { select: mockProjectsSelect, delete: mockProjectsDelete },
            dialectic_sessions: { select: mockSessionsSelect },
            dialectic_contributions: { select: mockContributionsSelect },
            dialectic_project_resources: { select: mockProjectResourcesSelect }
        }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleErrorSpy = spy(console, "error");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);
        assertExists(response.error);
        assertEquals(response.status, 500);
        assertEquals(response.error?.message, `Failed to delete project ${mockProjectId} from database.`);
        assertEquals(mockProjectsDelete.calls.length, 1);
        assertEquals(functionsInvokeSpy.calls.length, 2);
    } finally {
        consoleErrorSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

Deno.test("deleteProject - Unexpected error during processing (returns 500)", async () => {
    const mockUserId = "user-unexpected-error-id";
    const mockProjectId = "project-unexpected-error-id";
    const mockPayload: DeleteProjectPayload = { projectId: mockProjectId };
    const unexpectedErrorMessage = "Something truly unexpected happened!";

    const mockProjectsSelect = spy(async (_state: any) => { 
        throw new Error(unexpectedErrorMessage);
    });

    const mockAdminDbConfig: MockSupabaseDataConfig = {
        genericMockResults: { dialectic_projects: { select: mockProjectsSelect } }
    };
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, mockAdminDbConfig);
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>; 
    const functionsInvokeSpy = spy(async (_fn: string, _opts: any) => ({ data: null, error: null }));
    if (!(adminDbClient as any).functions) { (adminDbClient as any).functions = {}; }
    (adminDbClient.functions as any).invoke = functionsInvokeSpy;

    const consoleErrorSpy = spy(console, "error");
    try {
        const response = await deleteProject(adminDbClient, mockPayload, mockUserId);
        assertExists(response.error);
        assertEquals(response.status, 500);
        assertEquals(response.error?.message, "Error fetching project: " + unexpectedErrorMessage);
        assertExists(response.error?.details, "Error details should exist");
        assertExists(response.error?.details?.includes(unexpectedErrorMessage), "Error details string should contain the original error message");
        assertEquals(mockProjectsSelect.calls.length, 1);
        assertEquals(functionsInvokeSpy.calls.length, 0);
    } finally {
        consoleErrorSpy.restore();
    }
    mockAdminDbClientSetup.clearAllStubs?.();
});

// End of tests
