// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { stub } from "jsr:@std/testing@0.225.1/mock";
import { handleUpdateSessionModels } from "./updateSessionModels.ts";
import type { DialecticSession, DialecticProject } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient, type MockQueryBuilderState } from "../_shared/supabase.mock.ts";
import { logger } from "../_shared/logger.ts";
import {
    mockUpdateSessionModelsPayload,
    mockUpdateSessionModelsSelectedModels,
} from "./updateSessionModels.mock.ts";

Deno.test("handleUpdateSessionModels - Happy Path: Successfully updates models", async () => {
    const mockUserId = "user-happy-update-id";
    const mockSessionId = "session-to-update-id";
    const mockProjectId = "project-of-session-id";
    const initialModels: string[] = ["model-old-1", "model-old-2"];
    const updatedModels: string[] = ["model-new-1", "model-new-2", "model-new-3"];

    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };

    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: mockUpdateSessionModelsSelectedModels({ ids: updatedModels }),
    });

    const mockSessionBeforeUpdate: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: null,
        user_input_reference_url: null,
        iteration_count: 0,
        selected_models: mockUpdateSessionModelsSelectedModels({ ids: initialModels }),
        status: "active",
        associated_chat_id: null,
        current_stage_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };

    const mockProject: DialecticProject = {
        id: mockProjectId,
        user_id: mockUserId,
        project_name: "mock-project",
        initial_user_prompt: "",
        selected_domain_id: "mock-domain",
        repo_url: null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockSessionRowAfterUpdate = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Test Session",
        user_input_reference_url: null,
        iteration_count: 1,
        selected_model_ids: updatedModels,
        status: "active",
        associated_chat_id: "chat-123",
        current_stage_id: "stage-abc",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };

    const { selected_model_ids: _rowModelIds, ...sessionRowRest } = mockSessionRowAfterUpdate;
    const mockSessionAfterUpdate: DialecticSession = {
        ...sessionRowRest,
        selected_models: mockUpdateSessionModelsSelectedModels({ ids: updatedModels }),
    };

    const mockCatalogRows = updatedModels.map((id) => ({ id, name: id }));

    const sharedDbConfig = {
        genericMockResults: {
            dialectic_sessions: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some((f) => f.column === "id" && f.value === mockSessionId)) {
                        return {
                            data: [mockSessionBeforeUpdate],
                            error: null,
                            status: 200,
                            statusText: "OK",
                            count: 1,
                        };
                    }
                    return { data: null, error: null, status: 200, count: 0, statusText: "OK" };
                },
                update: async () => ({
                    data: [mockSessionRowAfterUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            dialectic_projects: {
                select: async (state: MockQueryBuilderState) => {
                    if (
                        state.filters.some((f) => f.column === "id" && f.value === mockProjectId) &&
                        state.filters.some((f) => f.column === "user_id" && f.value === mockUserId)
                    ) {
                        return {
                            data: [mockProject],
                            error: null,
                            status: 200,
                            statusText: "OK",
                            count: 1,
                        };
                    }
                    return { data: null, error: null, status: 200, count: 0, statusText: "OK" };
                },
            },
            ai_providers: {
                select: async () => ({
                    data: mockCatalogRows,
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: mockCatalogRows.length,
                }),
            },
        },
        mockUser: mockUser,
    };

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, sharedDbConfig);

    const mockUserClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {},
        rpcResults: {
            validate_model_tier_access: {
                data: [{
                    valid: true,
                    user_tier_level: 2,
                    max_models_per_project: 5,
                    over_model_limit: false,
                    disallowed_model_ids: [],
                }],
                error: null,
            },
        },
        mockUser: mockUser,
    });

    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "info");

    try {
        const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);

        assertEquals(
            mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
        assertEquals(
            mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            1,
        );

        assertExists(result.data, `Update failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on happy path");
        assertEquals(result.status, 200);
        const { selected_models: _expectedModels, ...sessionFields } = mockSessionAfterUpdate;
        assertObjectMatch(result.data, sessionFields);
        assertEquals(result.data?.selected_models, mockUpdateSessionModelsSelectedModels({ ids: updatedModels }));

        const sessionSelectSpies = mockDbClientSetup.spies.getAllQueryBuilderSpies("dialectic_sessions");
        const projectSelectSpies = mockDbClientSetup.spies.getAllQueryBuilderSpies("dialectic_projects");

        const sessionVerificationSelect = sessionSelectSpies?.find((s) =>
            s.select?.calls.some((c) => c.args[0] === "id, project_id")
        );
        const projectVerificationSelect = projectSelectSpies?.find((s) =>
            s.select?.calls.some((c) => c.args[0] === "id, user_id")
        );
        const sessionUpdateOperation = sessionSelectSpies?.find((s) => s.update?.calls.length === 1);

        assert(sessionVerificationSelect, "Session select for verification was not called correctly");
        assert(projectVerificationSelect, "Project select for verification was not called correctly");
        assert(sessionUpdateOperation, "Session update was not called once");

        assert(
            loggerSpy.calls.some((call) =>
                call.args[0] ===
                    `[handleUpdateSessionModels] Attempting to update models for session ${mockSessionId} by user ${mockUserId}.`
            ),
        );
        assert(
            loggerSpy.calls.some((call) =>
                call.args[0] === `[handleUpdateSessionModels] Successfully updated models for session ${mockSessionId}.`
            ),
        );
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: Session Not Found", async () => {
    const mockUserId = "user-session-not-found-id";
    const mockSessionId = "non-existent-session-id";
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: [{ id: "model-1", displayName: "Model 1" }],
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some((f) => f.column === "id" && f.value === mockSessionId)) {
                        return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
                    }
                    return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
                },
            },
        },
        mockUser: mockUser,
    });
    const mockUserClientSetup = createMockSupabaseClient(mockUserId, { mockUser: mockUser });
    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "warn");

    try {
        const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);
        assertExists(result.error, "Error should exist when session not found");
        assertEquals(result.status, 404);
        assertEquals(result.error?.message, "Session not found.");
        assertEquals(result.error?.code, "SESSION_NOT_FOUND");
        assert(
            loggerSpy.calls.some((call) =>
                call.args[0] === "[handleUpdateSessionModels] Session not found for update:"
            ),
            "Logger for session not found was not called",
        );
        assertEquals(
            mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
        assertEquals(
            mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: Project Not Found/Forbidden", async () => {
    const mockUserId = "user-project-forbidden-id";
    const mockSessionId = "session-project-forbidden-id";
    const mockProjectId = "project-impostor-trying-to-access-id";
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: [{ id: "model-1", displayName: "Model 1" }],
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockSessionInstance: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "",
        iteration_count: 0,
        selected_models: [],
        status: "",
        created_at: "",
        updated_at: "",
        user_input_reference_url: null,
        associated_chat_id: null,
        current_stage_id: null,
        viewing_stage_id: null,
    };

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some((f) => f.column === "id" && f.value === mockSessionId)) {
                        return { data: [mockSessionInstance], error: null, status: 200, statusText: "OK", count: 1 };
                    }
                    return {
                        data: null,
                        error: new Error("Session lookup failed in project forbidden test"),
                        status: 500,
                        count: 0,
                        statusText: "Error",
                    };
                },
            },
            dialectic_projects: {
                select: async (state: MockQueryBuilderState) => {
                    if (
                        state.filters.some((f) => f.column === "id" && f.value === mockProjectId) &&
                        state.filters.some((f) => f.column === "user_id" && f.value === mockUserId)
                    ) {
                        return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
                    }
                    return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
                },
            },
        },
        mockUser: mockUser,
    });
    const mockUserClientSetup = createMockSupabaseClient(mockUserId, { mockUser: mockUser });
    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "warn");

    try {
        const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 403);
        assertEquals(result.error?.message, "Forbidden: You do not have permission to update this session.");
        assertEquals(result.error?.code, "FORBIDDEN_SESSION_UPDATE");
        assert(
            loggerSpy.calls.some((call) =>
                call.args[0] ===
                    "[handleUpdateSessionModels] User does not own the project associated with the session, or project not found."
            ),
            "Logger for forbidden project access was not called",
        );
        assertEquals(
            mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
        assertEquals(
            mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: DB Error on Session Fetch", async () => {
    const mockUserId = "user-db-error-session-fetch-id";
    const mockSessionId = "session-db-error-fetch-id";
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: [{ id: "model-1", displayName: "Model 1" }],
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({
                    data: null,
                    error: new Error("Simulated DB error on session fetch"),
                    status: 500,
                    statusText: "Internal Server Error",
                    count: 0,
                }),
            },
        },
        mockUser: mockUser,
    });
    const mockUserClientSetup = createMockSupabaseClient(mockUserId, { mockUser: mockUser });
    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "error");

    try {
        const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 500);
        assertEquals(result.error?.message, "Error fetching session for update.");
        assertEquals(result.error?.code, "SESSION_FETCH_ERROR");
        assertEquals(result.error?.details, "Simulated DB error on session fetch");
        assert(
            loggerSpy.calls.some((call) =>
                call.args[0] === "[handleUpdateSessionModels] Error fetching session for verification:"
            ),
            "Logger for session fetch DB error was not called",
        );
        assertEquals(
            mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
        assertEquals(
            mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: DB Error on Project Fetch", async () => {
    const mockUserId = "user-db-error-project-fetch-id";
    const mockSessionId = "session-db-error-project-fetch-id";
    const mockProjectId = "project-for-db-error-fetch-id";
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: [{ id: "model-1", displayName: "Model 1" }],
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockSession: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: null,
        user_input_reference_url: null,
        iteration_count: 0,
        selected_models: [],
        status: "active",
        associated_chat_id: null,
        current_stage_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({
                    data: [mockSession],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            dialectic_projects: {
                select: async () => ({
                    data: null,
                    error: new Error("Simulated DB error on project fetch"),
                    status: 500,
                    statusText: "Internal Server Error",
                    count: 0,
                }),
            },
        },
        mockUser: mockUser,
    });
    const mockUserClientSetup = createMockSupabaseClient(mockUserId, { mockUser: mockUser });
    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "error");

    try {
        const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 500);
        assertEquals(result.error?.message, "Error verifying project ownership.");
        assertEquals(result.error?.code, "PROJECT_FETCH_ERROR");
        assertEquals(result.error?.details, "Simulated DB error on project fetch");
        assert(
            loggerSpy.calls.some((call) =>
                call.args[0] ===
                    "[handleUpdateSessionModels] Error fetching project for session ownership verification:"
            ),
            "Logger for project fetch DB error was not called",
        );
        assertEquals(
            mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
        assertEquals(
            mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Error: DB Error on Session Update", async () => {
    const mockUserId = "user-db-error-session-update-id";
    const mockSessionId = "session-db-error-update-id";
    const mockProjectId = "project-for-db-error-update-id";
    const updatedModels: string[] = ["model-new-1"];
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: mockUpdateSessionModelsSelectedModels({ ids: updatedModels }),
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockSessionBeforeUpdate: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: null,
        user_input_reference_url: null,
        iteration_count: 0,
        selected_models: [],
        status: "active",
        associated_chat_id: null,
        current_stage_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };
    const mockProject: DialecticProject = {
        id: mockProjectId,
        user_id: mockUserId,
        project_name: "mock-project",
        initial_user_prompt: "",
        selected_domain_id: "mock-domain",
        repo_url: null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({
                    data: [mockSessionBeforeUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
                update: async () => ({
                    data: null,
                    error: new Error("Simulated DB error on session update"),
                    status: 500,
                    statusText: "Internal Server Error",
                    count: 0,
                }),
            },
            dialectic_projects: {
                select: async () => ({
                    data: [mockProject],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
        },
        mockUser: mockUser,
    });
    const mockUserClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {},
        rpcResults: {
            validate_model_tier_access: {
                data: [{
                    valid: true,
                    user_tier_level: 2,
                    max_models_per_project: 5,
                    over_model_limit: false,
                    disallowed_model_ids: [],
                }],
                error: null,
            },
        },
        mockUser: mockUser,
    });
    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerSpy = stub(logger, "error");

    try {
        const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);
        assertExists(result.error);
        assertEquals(result.status, 500);
        assertEquals(result.error?.message, "Failed to update session models.");
        assertEquals(result.error?.code, "DB_UPDATE_FAILED");
        assertEquals(result.error?.details, "Simulated DB error on session update");
        assert(
            loggerSpy.calls.some((call) =>
                call.args[0] === "[handleUpdateSessionModels] Error updating session models in DB:"
            ),
            "Logger for session update DB error was not called",
        );
        assertEquals(
            mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            0,
        );
        assertEquals(
            mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
            1,
        );
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("handleUpdateSessionModels - Happy Path: validates selected models against tier limits before update", async () => {
    const mockUserId = "user-tier-validation-update-id";
    const mockSessionId = "session-tier-validation-update-id";
    const mockProjectId = "project-tier-validation-update-id";
    const updatedModels: string[] = ["model-allowed-1", "model-allowed-2"];
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: mockUpdateSessionModelsSelectedModels({ ids: updatedModels }),
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockSessionBeforeUpdate: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session before update",
        user_input_reference_url: null,
        iteration_count: 1,
        selected_models: mockUpdateSessionModelsSelectedModels({ ids: ["model-old-1"] }),
        status: "active",
        associated_chat_id: null,
        current_stage_id: "stage-tier-validation",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };
    const mockSessionRowAfterUpdate = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session after update",
        user_input_reference_url: null,
        iteration_count: 2,
        selected_model_ids: updatedModels,
        status: "active",
        associated_chat_id: "chat-tier-validation",
        current_stage_id: "stage-tier-validation",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockCatalogRows = updatedModels.map((id) => ({ id, name: id }));

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async (state: MockQueryBuilderState) => {
                    if (state.filters.some((filter) => filter.column === "id" && filter.value === mockSessionId)) {
                        return { data: [mockSessionBeforeUpdate], error: null, status: 200, statusText: "OK", count: 1 };
                    }
                    return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
                },
                update: async () => ({
                    data: [mockSessionRowAfterUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            dialectic_projects: {
                select: async (state: MockQueryBuilderState) => {
                    if (
                        state.filters.some((filter) => filter.column === "id" && filter.value === mockProjectId) &&
                        state.filters.some((filter) => filter.column === "user_id" && filter.value === mockUserId)
                    ) {
                        return {
                            data: [{ id: mockProjectId, user_id: mockUserId }],
                            error: null,
                            status: 200,
                            statusText: "OK",
                            count: 1,
                        };
                    }
                    return { data: null, error: null, status: 200, statusText: "OK", count: 0 };
                },
            },
            ai_providers: {
                select: async () => ({
                    data: mockCatalogRows,
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: mockCatalogRows.length,
                }),
            },
        },
        mockUser: mockUser,
    });

    const mockUserClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {},
        rpcResults: {
            validate_model_tier_access: {
                data: [{
                    valid: true,
                    user_tier_level: 2,
                    max_models_per_project: 3,
                    over_model_limit: false,
                    disallowed_model_ids: [],
                }],
                error: null,
            },
        },
        mockUser: mockUser,
    });

    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);

    assertEquals(
        mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        0,
    );
    assertEquals(
        mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        1,
    );

    assertExists(result.data, `Update failed: ${result.error?.message}`);
    assertEquals(result.error, undefined);
    assertEquals(result.status, 200);
    assertEquals(result.data?.selected_models, payload.selectedModels);
    assertEquals(mockUserClientSetup.spies.rpcSpy.calls[0].args[0], "validate_model_tier_access");
    assertEquals(
        mockUserClientSetup.spies.rpcSpy.calls[0].args[1],
        { p_model_ids: updatedModels },
    );
    assertEquals(
        mockDbClientSetup.spies.getHistoricQueryBuilderSpies("dialectic_sessions", "update")?.callCount,
        1,
    );
});

Deno.test("handleUpdateSessionModels - Error: returns MODEL_TIER_DISALLOWED when tier validation rejects a selected model", async () => {
    const mockUserId = "user-tier-disallowed-update-id";
    const mockSessionId = "session-tier-disallowed-update-id";
    const mockProjectId = "project-tier-disallowed-update-id";
    const updatedModels: string[] = ["model-disallowed"];
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: mockUpdateSessionModelsSelectedModels({ ids: updatedModels }),
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockSessionBeforeUpdate: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session before disallowed update",
        user_input_reference_url: null,
        iteration_count: 1,
        selected_models: [],
        status: "active",
        associated_chat_id: null,
        current_stage_id: "stage-tier-disallowed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };
    const mockSessionRowAfterUpdate = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session after disallowed update",
        user_input_reference_url: null,
        iteration_count: 2,
        selected_model_ids: updatedModels,
        status: "active",
        associated_chat_id: null,
        current_stage_id: "stage-tier-disallowed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockCatalogRows = updatedModels.map((id) => ({ id, name: id }));

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({
                    data: [mockSessionBeforeUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
                update: async () => ({
                    data: [mockSessionRowAfterUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUserId }],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            ai_providers: {
                select: async () => ({
                    data: mockCatalogRows,
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: mockCatalogRows.length,
                }),
            },
        },
        mockUser: mockUser,
    });

    const mockUserClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {},
        rpcResults: {
            validate_model_tier_access: {
                data: [{
                    valid: false,
                    user_tier_level: 1,
                    max_models_per_project: 3,
                    over_model_limit: false,
                    disallowed_model_ids: updatedModels,
                }],
                error: null,
            },
        },
        mockUser: mockUser,
    });

    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);

    assertEquals(
        mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        0,
    );
    assertEquals(
        mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        1,
    );

    assertExists(result.error);
    assertEquals(result.status, 403);
    assertEquals(result.error?.code, "MODEL_TIER_DISALLOWED");
    const err = result.error;
    assertExists(err);
    const det = err.details;
    assert(Array.isArray(det), "error.details must be an array");
    const d0 = det[0];
    assert(d0 !== null && typeof d0 === "object");
    if (!("disallowed_model_ids" in d0) || !("user_tier_level" in d0)) {
        throw new Error("expected disallowed_model_ids and user_tier_level on details[0]");
    }
    assertEquals(d0["disallowed_model_ids"], updatedModels);
    assertEquals(d0["user_tier_level"], 1);
    assertEquals(
        mockDbClientSetup.spies.getHistoricQueryBuilderSpies("dialectic_sessions", "update")?.callCount,
        0,
    );
});

Deno.test("handleUpdateSessionModels - Error: returns MODEL_LIMIT_EXCEEDED when tier validation rejects model count", async () => {
    const mockUserId = "user-model-limit-update-id";
    const mockSessionId = "session-model-limit-update-id";
    const mockProjectId = "project-model-limit-update-id";
    const updatedModels: string[] = ["model-limit-1", "model-limit-2"];
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: mockUpdateSessionModelsSelectedModels({ ids: updatedModels }),
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockSessionBeforeUpdate: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session before over-limit update",
        user_input_reference_url: null,
        iteration_count: 1,
        selected_models: [],
        status: "active",
        associated_chat_id: null,
        current_stage_id: "stage-model-limit",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };
    const mockSessionRowAfterUpdate = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session after over-limit update",
        user_input_reference_url: null,
        iteration_count: 2,
        selected_model_ids: updatedModels,
        status: "active",
        associated_chat_id: null,
        current_stage_id: "stage-model-limit",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockCatalogRows = updatedModels.map((id) => ({ id, name: id }));

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({
                    data: [mockSessionBeforeUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
                update: async () => ({
                    data: [mockSessionRowAfterUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUserId }],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            ai_providers: {
                select: async () => ({
                    data: mockCatalogRows,
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: mockCatalogRows.length,
                }),
            },
        },
        mockUser: mockUser,
    });

    const mockUserClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {},
        rpcResults: {
            validate_model_tier_access: {
                data: [{
                    valid: false,
                    user_tier_level: 1,
                    max_models_per_project: 1,
                    over_model_limit: true,
                    disallowed_model_ids: [],
                }],
                error: null,
            },
        },
        mockUser: mockUser,
    });

    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);

    assertEquals(
        mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        0,
    );
    assertEquals(
        mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        1,
    );

    assertExists(result.error);
    assertEquals(result.status, 403);
    assertEquals(result.error?.code, "MODEL_LIMIT_EXCEEDED");
    const errLimit = result.error;
    assertExists(errLimit);
    const detLimit = errLimit.details;
    assert(Array.isArray(detLimit), "error.details must be an array");
    const d0Limit = detLimit[0];
    assert(d0Limit !== null && typeof d0Limit === "object");
    if (
        !("over_model_limit" in d0Limit) ||
        !("max_models_per_project" in d0Limit) ||
        !("user_tier_level" in d0Limit)
    ) {
        throw new Error("expected over_model_limit, max_models_per_project, user_tier_level on details[0]");
    }
    assertEquals(d0Limit["over_model_limit"], true);
    assertEquals(d0Limit["max_models_per_project"], 1);
    assertEquals(d0Limit["user_tier_level"], 1);
    assertEquals(
        mockDbClientSetup.spies.getHistoricQueryBuilderSpies("dialectic_sessions", "update")?.callCount,
        0,
    );
});

Deno.test("handleUpdateSessionModels - Error: returns TIER_VALIDATION_FAILED when model tier validation RPC fails", async () => {
    const mockUserId = "user-tier-rpc-failed-update-id";
    const mockSessionId = "session-tier-rpc-failed-update-id";
    const mockProjectId = "project-tier-rpc-failed-update-id";
    const updatedModels: string[] = ["model-rpc-failed"];
    const payload = mockUpdateSessionModelsPayload({
        sessionId: mockSessionId,
        selectedModels: mockUpdateSessionModelsSelectedModels({ ids: updatedModels }),
    });
    const mockUser: User = {
        id: mockUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockSessionBeforeUpdate: DialecticSession = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session before RPC failure",
        user_input_reference_url: null,
        iteration_count: 1,
        selected_models: [],
        status: "active",
        associated_chat_id: null,
        current_stage_id: "stage-rpc-failed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewing_stage_id: null,
    };
    const mockSessionRowAfterUpdate = {
        id: mockSessionId,
        project_id: mockProjectId,
        session_description: "Session after RPC failure",
        user_input_reference_url: null,
        iteration_count: 2,
        selected_model_ids: updatedModels,
        status: "active",
        associated_chat_id: null,
        current_stage_id: "stage-rpc-failed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockCatalogRows = updatedModels.map((id) => ({ id, name: id }));

    const mockDbClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {
            dialectic_sessions: {
                select: async () => ({
                    data: [mockSessionBeforeUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
                update: async () => ({
                    data: [mockSessionRowAfterUpdate],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUserId }],
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: 1,
                }),
            },
            ai_providers: {
                select: async () => ({
                    data: mockCatalogRows,
                    error: null,
                    status: 200,
                    statusText: "OK",
                    count: mockCatalogRows.length,
                }),
            },
        },
        mockUser: mockUser,
    });

    const mockUserClientSetup = createMockSupabaseClient(mockUserId, {
        genericMockResults: {},
        rpcResults: {
            validate_model_tier_access: {
                data: null,
                error: new Error("Simulated tier validation failure"),
            },
        },
        mockUser: mockUser,
    });

    const dbClient: SupabaseClient<Database> = mockDbClientSetup.client as unknown as SupabaseClient<Database>;
    const userClient: SupabaseClient<Database> = mockUserClientSetup.client as unknown as SupabaseClient<Database>;
    const result = await handleUpdateSessionModels(dbClient, userClient, payload, mockUserId);

    assertEquals(
        mockDbClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        0,
    );
    assertEquals(
        mockUserClientSetup.spies.rpcSpy.calls.filter((call) => call.args[0] === "validate_model_tier_access").length,
        1,
    );

    assertExists(result.error);
    assertEquals(result.status, 500);
    assertEquals(result.error?.code, "TIER_VALIDATION_FAILED");
    assertEquals(result.error?.details, undefined);
    assertEquals(
        mockDbClientSetup.spies.getHistoricQueryBuilderSpies("dialectic_sessions", "update")?.callCount,
        0,
    );
});
