// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub } from "jsr:@std/testing@0.225.1/mock";
import { handleUpdateSessionModels } from "./updateSessionModels.ts";
import type { UpdateSessionModelsPayload, DialecticSession, DialecticProject } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { logger } from "../_shared/logger.ts"; // Import the actual logger to potentially spy on

Deno.test("handleUpdateSessionModels - Happy Path: Successfully updates models", async () => {
    const mockUserId = "user-happy-update-id";
    const mockSessionId = "session-to-update-id";
    const mockProjectId = "project-of-session-id";
    const initialModels = ["model-old-1", "model-old-2"];
    const updatedModels = ["model-new-1", "model-new-2", "model-new-3"];

    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
    };

    const payload: UpdateSessionModelsPayload = {
        sessionId: mockSessionId,
        selectedModelCatalogIds: updatedModels,
    };

    const mockSessionBeforeUpdate: Partial<DialecticSession> = {
        id: mockSessionId,
        project_id: mockProjectId,
        selected_model_catalog_ids: initialModels,
        // user_id: mockUserId, // Removed: DialecticSession may not have user_id directly
    };

    const mockProject: Partial<DialecticProject> = {
        id: mockProjectId,
        user_id: mockUserId,
    };
    
    const mockSessionAfterUpdate: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Test Session",
        user_input_reference_url: null,
        iteration_count: 1,
        selected_model_catalog_ids: updatedModels,
        status: "active",
        associated_chat_id: "chat-123",
        current_stage_id: "stage-abc",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // user_id: mockUserId, // Removed
    };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async (state: MockQueryBuilderState) => { 
                    if (state.filters.some((f) => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionBeforeUpdate as DialecticSession], error: null, status: 200, statusText: 'OK', count: 1 };
                    }
                    return { data: null, error: null, status: 200, count: 0, statusText: 'OK' };
                },
                update: async () => ({ 
                    data: [mockSessionAfterUpdate],
                    error: null, 
                    status: 200, 
                    statusText: 'OK',
                    count: 1 
                }), 
            },
            dialectic_projects: { 
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some((f) => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some((f) => f.column === 'user_id' && f.value === mockUserId)) {
                        return { data: [mockProject as DialecticProject], error: null, status: 200, statusText: 'OK', count: 1 };
                    }
                    return { data: null, error: null, status: 200, count: 0, statusText: 'OK' };
                },
            },
        },
        mockUser: mockUser,
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "info"); 

    try {
        const result = await handleUpdateSessionModels(adminDbClient, payload, mockUserId);

        assertExists(result.data, `Update failed: ${result.error?.message}`);   
        assertEquals(result.error, undefined, "Error should be undefined on happy path");
        assertEquals(result.status, 200);
        assertObjectMatch(result.data, mockSessionAfterUpdate as any);
        assertEquals(result.data?.selected_model_catalog_ids, updatedModels);

        const sessionSelectSpies = mockAdminDbClientSetup.spies.getAllQueryBuilderSpies('dialectic_sessions');
        const projectSelectSpies = mockAdminDbClientSetup.spies.getAllQueryBuilderSpies('dialectic_projects');
        
        const sessionVerificationSelect = sessionSelectSpies?.find(s => s.select?.calls.some(c => c.args[0] === 'id, project_id'));
        const projectVerificationSelect = projectSelectSpies?.find(s => s.select?.calls.some(c => c.args[0] === 'id, user_id'));
        const sessionUpdateOperation = sessionSelectSpies?.find(s => s.update?.calls.length ===1);

        assert(sessionVerificationSelect, "Session select for verification was not called correctly");
        assert(projectVerificationSelect, "Project select for verification was not called correctly");
        assert(sessionUpdateOperation, "Session update was not called once");
        
        assert(loggerSpy.calls.some(call => call.args[0] === `[handleUpdateSessionModels] Attempting to update models for session ${mockSessionId} by user ${mockUserId}.`));
        assert(loggerSpy.calls.some(call => call.args[0] === `[handleUpdateSessionModels] Successfully updated models for session ${mockSessionId}.`));

    } finally {
        loggerSpy.restore();
    }
}); 

Deno.test("handleUpdateSessionModels - Error: Session Not Found", async () => {
    const mockUserId = "user-session-not-found-id";
    const mockSessionId = "non-existent-session-id";
    const payload: UpdateSessionModelsPayload = {
        sessionId: mockSessionId,
        selectedModelCatalogIds: ["model-1"],
    };
    const mockUser: User = { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: null, error: null, status: 200, statusText: 'OK', count: 0 };
                    }
                    return { data: null, error: null, status: 200, statusText: 'OK', count: 0 }; 
                },
            },
        },
        mockUser: mockUser,
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "warn");

    try {
        const result = await handleUpdateSessionModels(adminDbClient, payload, mockUserId);
        assertExists(result.error, "Error should exist when session not found");
        assertEquals(result.status, 404);
        assertEquals(result.error?.message, "Session not found.");
        assertEquals(result.error?.code, "SESSION_NOT_FOUND");
        assert(loggerSpy.calls.some(call => call.args[0] === '[handleUpdateSessionModels] Session not found for update:'), "Logger for session not found was not called");
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: Project Not Found/Forbidden", async () => {
    const mockUserId = "user-project-forbidden-id";
    const mockSessionId = "session-project-forbidden-id";
    const mockProjectId = "project-impostor-trying-to-access-id";
    const payload: UpdateSessionModelsPayload = {
        sessionId: mockSessionId,
        selectedModelCatalogIds: ["model-1"],
    };
    const mockUser: User = { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
    const mockSessionInstance: DialecticSession = {
        id: mockSessionId, 
        project_id: mockProjectId, 
        session_description: '', iteration_count:0, selected_model_catalog_ids:[], status:'', created_at:'', updated_at:'',
        user_input_reference_url: null,
        associated_chat_id: null,
        current_stage_id: null,
    };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionInstance], error: null, status: 200, statusText: 'OK', count: 1 };
                    }
                    return { data: null, error: new Error("Session lookup failed in project forbidden test"), status: 500, count: 0, statusText: 'Error' }; 
                },
            },
            dialectic_projects: {
                select: async (state: MockQueryBuilderState) => {
                     if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                         state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return { data: null, error: null, status: 200, statusText: 'OK', count: 0 }; 
                     }
                    return { data: null, error: null, status: 200, statusText: 'OK', count: 0 }; 
                },
            },
        },
        mockUser: mockUser,
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "warn");

    try {
        const result = await handleUpdateSessionModels(adminDbClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 403);
        assertEquals(result.error?.message, "Forbidden: You do not have permission to update this session.");
        assertEquals(result.error?.code, "FORBIDDEN_SESSION_UPDATE");
        assert(loggerSpy.calls.some(call => call.args[0] === '[handleUpdateSessionModels] User does not own the project associated with the session, or project not found.'), "Logger for forbidden project access was not called");
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: DB Error on Session Fetch", async () => {
    const mockUserId = "user-db-error-session-fetch-id";
    const mockSessionId = "session-db-error-fetch-id";
    const payload: UpdateSessionModelsPayload = { sessionId: mockSessionId, selectedModelCatalogIds: ["model-1"] };
    const mockUser: User = { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({ data: null, error: new Error("Simulated DB error on session fetch"), status: 500, statusText: 'Internal Server Error', count: 0 }),
            },
        },
        mockUser: mockUser,
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "error");

    try {
        const result = await handleUpdateSessionModels(adminDbClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 500);
        assertEquals(result.error?.message, "Error fetching session for update.");
        assertEquals(result.error?.code, "SESSION_FETCH_ERROR");
        assertEquals(result.error?.details, "Simulated DB error on session fetch");
        assert(loggerSpy.calls.some(call => call.args[0] === '[handleUpdateSessionModels] Error fetching session for verification:'), "Logger for session fetch DB error was not called");
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: DB Error on Project Fetch", async () => {
    const mockUserId = "user-db-error-project-fetch-id";
    const mockSessionId = "session-db-error-project-fetch-id";
    const mockProjectId = "project-for-db-error-fetch-id";
    const payload: UpdateSessionModelsPayload = { sessionId: mockSessionId, selectedModelCatalogIds: ["model-1"] };
    const mockUser: User = { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
    const mockSession: Partial<DialecticSession> = { id: mockSessionId, project_id: mockProjectId };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({ data: [mockSession as DialecticSession], error: null, status: 200, statusText: 'OK', count: 1 }),
            },
            dialectic_projects: {
                select: async () => ({ data: null, error: new Error("Simulated DB error on project fetch"), status: 500, statusText: 'Internal Server Error', count: 0 }),
            },
        },
        mockUser: mockUser,
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "error");

    try {
        const result = await handleUpdateSessionModels(adminDbClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 500);
        assertEquals(result.error?.message, "Error verifying project ownership.");
        assertEquals(result.error?.code, "PROJECT_FETCH_ERROR");
        assertEquals(result.error?.details, "Simulated DB error on project fetch");
        assert(loggerSpy.calls.some(call => call.args[0] === '[handleUpdateSessionModels] Error fetching project for session ownership verification:'), "Logger for project fetch DB error was not called");
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: DB Error on Session Update", async () => {
    const mockUserId = "user-db-error-session-update-id";
    const mockSessionId = "session-db-error-update-id";
    const mockProjectId = "project-for-db-error-update-id";
    const updatedModels = ["model-new-1"];
    const payload: UpdateSessionModelsPayload = { sessionId: mockSessionId, selectedModelCatalogIds: updatedModels };
    const mockUser: User = { id: mockUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
    const mockSessionBeforeUpdate: Partial<DialecticSession> = { id: mockSessionId, project_id: mockProjectId };
    const mockProject: Partial<DialecticProject> = { id: mockProjectId, user_id: mockUserId };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({ data: [mockSessionBeforeUpdate as DialecticSession], error: null, status: 200, statusText: 'OK', count: 1 }),
                update: async () => ({ data: null, error: new Error("Simulated DB error on session update"), status: 500, statusText: 'Internal Server Error', count: 0 }),
            },
            dialectic_projects: {
                select: async () => ({ data: [mockProject as DialecticProject], error: null, status: 200, statusText: 'OK', count: 1 }),
            },
        },
        mockUser: mockUser,
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "error");

    try {
        const result = await handleUpdateSessionModels(adminDbClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 500);
        assertEquals(result.error?.message, "Failed to update session models.");
        assertEquals(result.error?.code, "DB_UPDATE_FAILED");
        assertEquals(result.error?.details, "Simulated DB error on session update");
        assert(loggerSpy.calls.some(call => call.args[0] === '[handleUpdateSessionModels] Error updating session models in DB:'), "Logger for session update DB error was not called");
    } finally {
        loggerSpy.restore();
    }
}); 