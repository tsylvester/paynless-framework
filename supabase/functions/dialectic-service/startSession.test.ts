import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext, mockSession } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload, StartSessionSuccessResponse } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as sharedLogger from "../_shared/logger.ts";
import { createMockSupabaseClient, type IMockSupabaseClient, type MockSupabaseClientSetup, type IMockSupabaseAuth } from "../_shared/supabase.mock.ts";

// Mock the actual logger instance or its methods for global test use if needed
// const loggerSpyInfo = spy(sharedLogger.logger, 'info');
// const loggerSpyError = spy(sharedLogger.logger, 'error');
// const loggerSpyWarn = spy(sharedLogger.logger, 'warn');

// Restore spies after each test if they are global
// Deno.afterEach(() => {
//   loggerSpyInfo.restore();
//   loggerSpyError.restore();
//   loggerSpyWarn.restore();
// });

Deno.test("startSession - Happy Path", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-happy-path-id";
    const mockProjectId = "project-happy-path-id";
    const mockThesisPromptName = "default_thesis_happy";
    const mockThesisPromptId = "thesis-prompt-happy-id";
    const mockThesisPromptText = "This is the happy path thesis prompt.";
    const mockNewChatId = "newly-generated-chat-id-happy";
    const mockNewSessionId = "new-session-id-happy";
    const mockSelectedModelIds = ["model-catalog-id-1", "model-catalog-id-2"];

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: "A happy path test session",
        thesisPromptTemplateName: mockThesisPromptName,
        // originatingChatId is omitted to trigger new chat ID generation
    };

    // 1. Mock User Auth
    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);
    const getUserSpy = mockUserAuthClientSetup.spies.auth.getUserSpy;

    // 2. Mock Admin DB Client operations
    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-happy-path", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Initial prompt for happy path", selected_domain_tag: "general" }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock (happy path)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    // Thesis prompt fetch
                    if (state.filters.some(f => f.column === 'name' && f.value === mockThesisPromptName) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                         // Assuming context filter might also be applied by the function, accept if name and active matches
                        return { data: [{ id: mockThesisPromptId, prompt_text: mockThesisPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    // Reverted: Removed default antithesis prompt fetch from mock
                    return { data: null, error: new Error("Thesis prompt not found in mock (happy path)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayload &&
                        insertPayload.project_id === mockProjectId &&
                        insertPayload.associated_chat_id === mockNewChatId &&
                        insertPayload.active_thesis_prompt_template_id === mockThesisPromptId &&
                        insertPayload.session_description === payload.sessionDescription &&
                        insertPayload.status === "pending_thesis"
                    ) {
                        return { data: [{ id: mockNewSessionId }], error: null, count: 1, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session insert failed in mock (happy path condition mismatch)"), count: 0, status: 500, statusText: "Error" };
                },
                update: async (state) => {
                    const updatePayload = state.updateData as Record<string, unknown> | undefined;
                    if (state.filters.some(f => f.column === 'id' && f.value === mockNewSessionId) &&
                        updatePayload && typeof updatePayload.current_stage_seed_prompt === 'string' ) { // Basic check for seed prompt update
                        return { data: [{ id: mockNewSessionId }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Session update failed in mock (happy path condition mismatch)"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_session_models: {
                insert: async (state) => {
                    const insertPayloadArray = state.insertData as any[];
                    if (Array.isArray(insertPayloadArray) &&
                        insertPayloadArray.length === mockSelectedModelIds.length &&
                        insertPayloadArray.every(item => item.session_id === mockNewSessionId && mockSelectedModelIds.includes(item.model_id))
                    ) {
                        return { data: insertPayloadArray, error: null, count: insertPayloadArray.length, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session models insert failed (happy path condition mismatch)"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    // 3. Mock randomUUID
    const mockRandomUUIDFn = spy(() => mockNewChatId);

    // 4. Mock Logger
    const loggerInfoFn = spy();
    const loggerWarnFn = spy();
    const loggerErrorFn = spy();
    const loggerDebugFn = spy();
    const mockLogger = {
        info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn,
    } as any as sharedLogger.Logger;

    // 5. Prepare Deps
    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
        randomUUID: mockRandomUUIDFn,
    };

    try {
        // 6. Call startSession
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        // 7. Assertions
        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on happy path");

        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            sessionId: mockNewSessionId,
            associatedChatId: mockNewChatId,
            initialStatus: "pending_thesis",
        };
        assertObjectMatch(result.data as any, expectedResponse as any);

        // Assert mock calls
        assertEquals(mockRandomUUIDFn.calls.length, 1, "randomUUID should be called once");
        assertEquals(mockInternalCreateSupabaseClientSpy.calls.length, 1, "createSupabaseClient (internal) should be called once");
        assertEquals(getUserSpy.calls.length, 1, "auth.getUser should be called once");

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy, "Project select spy should exist");
        assertEquals(projectSelectSpy.calls.length, 1, "Project select should be called once");

        const thesisPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(thesisPromptSelectSpy, "Thesis prompt select spy should exist");
        assertEquals(thesisPromptSelectSpy.calls.length, 1, "Thesis prompt select should be called once");
        
        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertExists(sessionInsertSpy, "Session insert spy should exist");
        assertEquals(sessionInsertSpy.calls.length, 1, "Session insert should be called once");

        const sessionModelsInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_session_models")?.insert;
        assertExists(sessionModelsInsertSpy, "Session models insert spy should exist");
        assertEquals(sessionModelsInsertSpy.calls.length, 1, "Session models insert should be called once");

        const sessionUpdateSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.update;
        assertExists(sessionUpdateSpy, "Session update spy should exist");
        assertEquals(sessionUpdateSpy.calls.length, 1, "Session update should be called once");
        
        // Basic logger call checks (can be more specific if needed)
        assert(loggerInfoFn.calls.length >= 4, "Expected at least 4 info logs for happy path operations"); // Start, project, thesis, session created, session updated
        assertEquals(loggerWarnFn.calls.length, 0, "No warnings expected on happy path");
        assertEquals(loggerErrorFn.calls.length, 0, "No errors expected on happy path");

    } finally {
        // 8. Cleanup
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - User Not Authenticated", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const payload: StartSessionPayload = {
        projectId: "project-123",
        selectedModelCatalogIds: ["model-abc"],
    };

    const mockAdminDbClientSetup: MockSupabaseClientSetup = createMockSupabaseClient("test-admin-user-id");
    const mockUserAuthClientSetup: MockSupabaseClientSetup = createMockSupabaseClient(
        undefined, 
        { simulateAuthError: new Error("Simulated Auth Error") }
    );
    const getUserSpy = mockUserAuthClientSetup.spies.auth.getUserSpy;
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    // Create fresh spies for logger methods (do not spy on sharedLogger.logger directly here)
    const loggerInfoFn = spy(); 
    const loggerWarnFn = spy();
    const loggerErrorFn = spy();
    const loggerDebugFn = spy();

    const mockLogger = {
        info: loggerInfoFn,
        warn: loggerWarnFn,
        error: loggerErrorFn, 
        debug: loggerDebugFn,
    } as any as sharedLogger.Logger; // Cast to satisfy the interface

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockReq, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.message, "User not authenticated");
        assertEquals(result.error?.status, 401);

        assertEquals(mockInternalCreateSupabaseClientSpy.calls.length, 1);
        const createClientCall = mockInternalCreateSupabaseClientSpy.calls[0];
        assertExists(createClientCall);
        // deno-lint-ignore no-explicit-any tuple-zero-index
        assertEquals(createClientCall.args.length, 1);
        // deno-lint-ignore no-explicit-any tuple-zero-index
        assertEquals(createClientCall.args[0], mockReq);

        assertEquals(getUserSpy.calls.length, 1);

        assertEquals(loggerInfoFn.calls.length, 1);
        const firstInfoCall = loggerInfoFn.calls[0];
        assertExists(firstInfoCall);
        assertExists(firstInfoCall.args, "Info call arguments should exist");
        if (firstInfoCall.args.length > 0) {
            // deno-lint-ignore no-explicit-any tuple-zero-index
            assert(typeof firstInfoCall.args[0] === 'string' && firstInfoCall.args[0].includes("startSession called with payload:"));
        } else {
            assert(false, "Logger info call did not have arguments as expected.");
        }

        assertEquals(loggerWarnFn.calls.length, 1);
        const firstWarnCall = loggerWarnFn.calls[0];
        assertExists(firstWarnCall);
        assertExists(firstWarnCall.args, "Warn call arguments should exist");
        if (firstWarnCall.args.length > 0) {
            assert(typeof firstWarnCall.args[0] === 'string' && firstWarnCall.args[0].includes("[startSession] User not authenticated."));
            assertObjectMatch(firstWarnCall.args[1] as Record<string, unknown>, { 
                error: { message: "Simulated Auth Error" } 
            });
        } else {
            assert(false, "Logger warn call did not have arguments as expected.");
        }
    } finally {
        // Standalone spies like loggerInfoFn don't need restore.
        // Spies on mock client instances are cleared by clearAllStubs.
        mockAdminDbClientSetup.clearAllStubs?.();
        mockUserAuthClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Project Not Found", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-id-owns-nothing";
    const payload: StartSessionPayload = {
        projectId: "non-existent-project-id",
        selectedModelCatalogIds: ["model-abc"],
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);
    const getUserSpy = mockUserAuthClientSetup.spies.auth.getUserSpy;

    const mockAdminDbClientSetup = createMockSupabaseClient("test-admin-id", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    const idFilter = state.filters.find(f => f.column === 'id' && f.value === payload.projectId);
                    const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === mockUserId);
                    if (idFilter && userIdFilter && state.operation === 'select') {
                        return { data: null, error: { name: "PGRST116", message: "No rows found", code: "PGRST116" }, count: 0, status: 406, statusText: "Not Found" }; 
                    }
                    return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    // Create fresh spies for logger methods
    const loggerInfoFn = spy();
    const loggerWarnFn = spy();
    const loggerErrorFn = spy();
    const loggerDebugFn = spy();
    const mockLogger = { 
        info: loggerInfoFn, 
        warn: loggerWarnFn, 
        error: loggerErrorFn, 
        debug: loggerDebugFn 
    } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.message, "Project not found or access denied.");
        assertEquals(result.error?.status, 404);

        assertEquals(mockInternalCreateSupabaseClientSpy.calls.length, 1);
        assertEquals(getUserSpy.calls.length, 1);
        
        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy, "Select spy for dialectic_projects should exist");
        assertEquals(projectSelectSpy.calls.length, 1);

        const singleSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.single;
        assertExists(singleSpy, "Single spy for dialectic_projects should exist");
        assertEquals(singleSpy.calls.length, 1);

        assertEquals(loggerInfoFn.calls.length, 3);
        assertEquals(loggerErrorFn.calls.length, 1);
        const firstErrorCall = loggerErrorFn.calls[0];
        assertExists(firstErrorCall);
        assertExists(firstErrorCall.args);
        if (firstErrorCall.args.length > 0) {
            assert(typeof firstErrorCall.args[0] === 'string' && firstErrorCall.args[0].includes("[startSession] Error fetching project or project not found/access denied:"));
            assertObjectMatch(firstErrorCall.args[1] as Record<string,unknown>, {
                projectId: payload.projectId,
                userId: mockUserId,
                error: { code: "PGRST116" }
            });
        }
    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Project Access Denied (user does not own project)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-A-id";
    const mockProjectId = "project-owned-by-B";
    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);
    const getUserSpy = mockUserAuthClientSetup.spies.auth.getUserSpy;

    const mockAdminDbClientSetup = createMockSupabaseClient("test-admin-id-access-denied", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    // Simulate project exists but not for this user_id, or doesn't exist at all.
                    // The query in startSession uses .eq('id', payload.projectId).eq('user_id', userId)
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // No project found for this user
                    }
                    // Fallback, though specific filter should match above
                    return { data: null, error: new Error("Unexpected project query in mock"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.message, "Project not found or access denied.");
        assertEquals(result.error?.status, 404);

        assertEquals(mockInternalCreateSupabaseClientSpy.calls.length, 1);
        assertEquals(getUserSpy.calls.length, 1);

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.calls.length, 1);
        
        const singleSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.single;
        assertExists(singleSpy);
        assertEquals(singleSpy.calls.length, 1);

        assert(loggerErrorFn.calls.length >= 1, "Expected at least one error log for project access denied");
        const firstErrorCall = loggerErrorFn.calls[0];
        assertExists(firstErrorCall?.args);
        if (firstErrorCall.args.length > 0) {
            assert(typeof firstErrorCall.args[0] === 'string' && firstErrorCall.args[0].includes("[startSession] Error fetching project or project not found/access denied:"));
            assertObjectMatch(firstErrorCall.args[1] as Record<string,unknown>, {
                projectId: payload.projectId,
                userId: mockUserId,
                error: null // error from db was null in this case
            });
        }

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Thesis Prompt Not Found (by specific name)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-thesis-prompt-test";
    const mockProjectId = "project-thesis-prompt-test";
    const mockMissingThesisName = "specific_missing_thesis_name";
    const mockProjectDomain = "general_testing";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        thesisPromptTemplateName: mockMissingThesisName,
        // No antithesis, simplifying test focus
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-thesis-prompt-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Test prompt", selected_domain_tag: mockProjectDomain }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            system_prompts: { // Thesis prompt fetch will fail
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'name' && f.value === mockMissingThesisName) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // Not found
                    }
                    // Mock antithesis to succeed if it were called, to isolate thesis failure
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === 'antithesis')) {
                        return { data: [{ id: "mock-antithesis-id", prompt_text: "Antithesis" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assert(result.error?.message?.includes(`No suitable thesis prompt found for name '${mockMissingThesisName}'`));
        assert(result.error?.message?.includes(`or default for context '${mockProjectDomain}'`));

        const thesisPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(thesisPromptSelectSpy, "Thesis prompt select spy should exist");
        assertEquals(thesisPromptSelectSpy.calls.length, 1); // Only thesis prompt should be queried before error
        
        assertEquals(loggerErrorFn.calls.length, 1);
        const firstErrorCall = loggerErrorFn.calls[0];
        assertExists(firstErrorCall?.args);
        if (firstErrorCall.args.length > 0) {
            assert(typeof firstErrorCall.args[0] === 'string' && firstErrorCall.args[0].includes("[startSession] Prompt fetching error:"));
        }

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Thesis Prompt Not Found (default for context)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-default-thesis-test";
    const mockProjectId = "project-default-thesis-test";
    const mockProjectDomain = "missing_default_thesis_context";

    const payload: StartSessionPayload = { // No thesisPromptTemplateName, so it will look for default
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-default-thesis-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Test prompt", selected_domain_tag: mockProjectDomain }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            system_prompts: {
                select: async (state) => {
                    // Thesis prompt fetch by default context will fail
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === 'thesis') &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomain) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // Not found
                    }
                     // Mock antithesis to succeed if it were called, to isolate thesis failure
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === 'antithesis')) {
                        return { data: [{ id: "mock-antithesis-id", prompt_text: "Antithesis" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default thesis"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assert(result.error?.message?.includes(`No suitable thesis prompt found for name 'default'`));
        assert(result.error?.message?.includes(`or default for context '${mockProjectDomain}'`));

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Antithesis Prompt Not Found (by specific name)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-antithesis-prompt-test";
    const mockProjectId = "project-antithesis-prompt-test";
    const mockThesisPromptId = "thesis-prompt-id-anti-test";
    const mockThesisPromptText = "This is the thesis prompt for antithesis test.";
    const mockMissingAntithesisName = "specific_missing_antithesis_name";
    const mockProjectDomain = "general_testing_anti";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        thesisPromptTemplateName: "default_thesis_for_anti_test", // Assume this one exists
        antithesisPromptTemplateName: mockMissingAntithesisName,
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-antithesis-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Test prompt", selected_domain_tag: mockProjectDomain }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            system_prompts: {
                select: async (state) => {
                    // Thesis prompt fetch will succeed
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.thesisPromptTemplateName)) {
                        return { data: [{ id: mockThesisPromptId, prompt_text: mockThesisPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    // Antithesis prompt fetch by name will fail
                    if (state.filters.some(f => f.column === 'name' && f.value === mockMissingAntithesisName) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // Not found
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for antithesis by name"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assert(result.error?.message?.includes(`No suitable antithesis prompt found for name '${mockMissingAntithesisName}'`));
        assert(result.error?.message?.includes(`or default for context '${mockProjectDomain}'`));
        
        const promptSelectSpy = mockAdminDbClientSetup.spies.getHistoricQueryBuilderSpies("system_prompts", "select");
        assertExists(promptSelectSpy);
        assertEquals(promptSelectSpy.callCount, 2, "Expected two calls to system_prompts select (thesis then antithesis)");


    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Antithesis Prompt Not Found (default for context)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-default-antithesis-test";
    const mockProjectId = "project-default-antithesis-test";
    const mockThesisPromptId = "thesis-p-id-def-anti";
    const mockThesisPromptText = "Thesis text for default antithesis test.";
    const mockProjectDomain = "missing_default_antithesis_context";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        thesisPromptTemplateName: "default_thesis_for_def_anti_test", // Assume this exists
        // No antithesisPromptTemplateName, so it will look for default
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-default-antithesis-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Test prompt", selected_domain_tag: mockProjectDomain }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            system_prompts: {
                select: async (state) => {
                    // Thesis prompt fetch will succeed
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.thesisPromptTemplateName)) {
                        return { data: [{ id: mockThesisPromptId, prompt_text: mockThesisPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    // Default antithesis prompt fetch will fail
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === 'antithesis') &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomain) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // Not found
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default antithesis"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assert(result.error?.message?.includes(`No suitable antithesis prompt found for name 'default'`));
        assert(result.error?.message?.includes(`or default for context '${mockProjectDomain}'`));
        
        const promptSelectSpy = mockAdminDbClientSetup.spies.getHistoricQueryBuilderSpies("system_prompts", "select");
        assertExists(promptSelectSpy);
        assertEquals(promptSelectSpy.callCount, 2, "Expected two calls to system_prompts select (thesis then antithesis)");

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - DB Error: Session Insert Fails", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-session-insert-fail";
    const mockProjectId = "project-session-insert-fail";
    const mockThesisPromptId = "thesis-id-session-fail";
    const mockAntithesisPromptId = "antithesis-id-session-fail";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        sessionDescription: "Test session insert fail",
        thesisPromptTemplateName: "default_thesis",
        antithesisPromptTemplateName: "default_antithesis",
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const dbError = { name: "DBError", message: 'Simulated DB insert error', code: 'XXYYZ', details: "DB constraint violation perhaps" };
    const mockAdminDbClientSetup = createMockSupabaseClient("admin-session-insert-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Prompt", selected_domain_tag: "general" }], error: null, count: 1, status: 200, statusText: "OK" })
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.thesisPromptTemplateName)) {
                        return { data: [{ id: mockThesisPromptId, prompt_text: "Thesis text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.antithesisPromptTemplateName)) {
                        return { data: [{ id: mockAntithesisPromptId, prompt_text: "Antithesis text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt query error"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: {
                insert: async () => ({ data: null, error: dbError, count: 0, status: 500, statusText: "Internal Server Error" })
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;
    const mockRandomUUIDFn = spy(() => "new-chat-id-for-session-fail");

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
        randomUUID: mockRandomUUIDFn,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.message, "Failed to create session.");
        assertEquals(result.error?.details, dbError.message);
        assertEquals(result.error?.code, undefined); // code is not directly passed to the final error object in this case

        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertExists(sessionInsertSpy);
        assertEquals(sessionInsertSpy.calls.length, 1);
        
        assertEquals(loggerErrorFn.calls.length, 1);
        const errCall = loggerErrorFn.calls[0].args[1] as Record<string,unknown>;
        assertObjectMatch(errCall, { projectId: mockProjectId, error: { message: dbError.message } });


    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - DB Error: Session Models Insert Fails (check session cleanup)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-smi-fail";
    const mockProjectId = "project-smi-fail";
    const mockThesisPromptId = "thesis-id-smi-fail";
    const mockAntithesisPromptId = "antithesis-id-smi-fail";
    const mockNewSessionId = "new-session-id-for-smi-fail";
    const mockNewChatId = "new-chat-id-for-smi-fail";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-good", "model-bad"],
        sessionDescription: "Test session models insert fail",
        thesisPromptTemplateName: "default_thesis",
        antithesisPromptTemplateName: "default_antithesis",
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const sessionModelsDbError = { name: "DBError", message: 'Simulated DB session_models insert error', code: 'SMI001' };
    const mockAdminDbClientSetup = createMockSupabaseClient("admin-smi-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Prompt", selected_domain_tag: "general" }], error: null, count: 1, status: 200, statusText: "OK" })
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.thesisPromptTemplateName)) {
                        return { data: [{ id: mockThesisPromptId, prompt_text: "Thesis text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.antithesisPromptTemplateName)) {
                        return { data: [{ id: mockAntithesisPromptId, prompt_text: "Antithesis text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt query error"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: {
                insert: async () => ({ data: [{ id: mockNewSessionId }], error: null, count: 1, status: 201, statusText: "Created" }),
                delete: async (state) => { // This is for the spy
                    if (state.filters.some(f => f.column === 'id' && f.value === mockNewSessionId)) {
                        return { data: [{id: mockNewSessionId}], error: null, count: 1, status: 200, statusText: "OK"};
                    }
                    return {data: null, error: new Error("Delete mock not hit correctly"), count: 0, status: 500, statusText: "Error"};
                }
            },
            dialectic_session_models: {
                insert: async () => ({ data: null, error: sessionModelsDbError, count: 0, status: 500, statusText: "Internal Server Error" })
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    
    const loggerErrorFn = spy();
    const loggerWarnFn = spy();
    const mockLogger = { info: spy(), warn: loggerWarnFn, error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;
    const mockRandomUUIDFn = spy(() => mockNewChatId);

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
        randomUUID: mockRandomUUIDFn,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.message, "Failed to associate models with session.");
        assertEquals(result.error?.details, sessionModelsDbError.message);

        const sessionModelsInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_session_models")?.insert;
        assertExists(sessionModelsInsertSpy);
        assertEquals(sessionModelsInsertSpy.calls.length, 1);

        const sessionDeleteSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.delete;
        assertExists(sessionDeleteSpy, "Session delete spy should exist");
        assertEquals(sessionDeleteSpy.calls.length, 1, "Session delete should be called once for cleanup");
        
        assertEquals(loggerErrorFn.calls.length, 1);
        const errCallArgs = loggerErrorFn.calls[0].args[1] as Record<string,unknown>;
        assertObjectMatch(errCallArgs, { sessionId: mockNewSessionId, error: { message: sessionModelsDbError.message } });

        assertEquals(loggerWarnFn.calls.length, 1);
        const warnCallArgs = loggerWarnFn.calls[0].args;
        assert(warnCallArgs[0].includes(`Attempting to delete orphaned session ${mockNewSessionId}`));


    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - DB Error: Session Update with Seed Prompt Fails", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-sup-fail";
    const mockProjectId = "project-sup-fail";
    const mockThesisPromptId = "thesis-id-sup-fail";
    const mockThesisPromptText = "This is the thesis prompt text for SUP fail.";
    const mockAntithesisPromptId = "antithesis-id-sup-fail";
    const mockNewSessionId = "new-session-id-for-sup-fail";
    const mockNewChatId = "new-chat-id-for-sup-fail";
    const mockSelectedModelIds = ["model-sup-1"];

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: "Test session update with seed prompt fail",
        thesisPromptTemplateName: "default_thesis_sup",
        antithesisPromptTemplateName: "default_antithesis_sup",
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const sessionUpdateDbError = { name: "DBError", message: 'Simulated DB update error for seed prompt', code: 'SUP001' };
    const mockAdminDbClientSetup = createMockSupabaseClient("admin-sup-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Initial prompt for SUP fail", selected_domain_tag: "general" }], error: null, count: 1, status: 200, statusText: "OK" })
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.thesisPromptTemplateName)) {
                        return { data: [{ id: mockThesisPromptId, prompt_text: mockThesisPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.antithesisPromptTemplateName)) {
                        return { data: [{ id: mockAntithesisPromptId, prompt_text: "Antithesis text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt query error in SUP fail"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: {
                insert: async () => ({ data: [{ id: mockNewSessionId }], error: null, count: 1, status: 201, statusText: "Created" }),
                update: async () => ({ data: null, error: sessionUpdateDbError, count: 0, status: 500, statusText: "Error" }) // This will fail
            },
            dialectic_session_models: {
                insert: async (state) => ({ data: state.insertData as object[], error: null, count: (state.insertData as any[]).length, status: 201, statusText: "Created" })
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;
    const mockRandomUUIDFn = spy(() => mockNewChatId);

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLogger,
        randomUUID: mockRandomUUIDFn,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.message, "Failed to set initial prompt for session.");
        assertEquals(result.error?.details, sessionUpdateDbError.message);

        const sessionUpdateSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.update;
        assertExists(sessionUpdateSpy);
        assertEquals(sessionUpdateSpy.calls.length, 1);
        
        assertEquals(loggerErrorFn.calls.length, 1);
        const errCallArgs = loggerErrorFn.calls[0].args[1] as Record<string,unknown>;
        assertObjectMatch(errCallArgs, { sessionId: mockNewSessionId, error: { message: sessionUpdateDbError.message } });

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

/*
Deno.test("startSession - Uses Originating Chat ID when provided", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-happy-path";
    const mockProjectId = "project-happy-path";
    const mockOriginatingChatId = "existing-chat-uuid-123";
    const mockThesisPromptId = "thesis-prompt-uuid";
    const mockThesisPromptText = "This is the thesis prompt text.";
    const mockAntithesisPromptId = "antithesis-prompt-uuid";
    const mockNewSessionId = "new-session-uuid";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc", "model-xyz"],
        sessionDescription: "A test session with originating chat ID",
        originatingChatId: mockOriginatingChatId, 
        thesisPromptTemplateName: "default_thesis", 
        antithesisPromptTemplateName: "default_antithesis",
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClient = (_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient;

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return { 
                            data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Initial prompt text", selected_domain_tag: "general" }], 
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.thesisPromptTemplateName)) {
                        return { data: [{ id: mockThesisPromptId, prompt_text: mockThesisPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.antithesisPromptTemplateName)) {
                        return { data: [{ id: mockAntithesisPromptId, prompt_text: "Antithesis text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt not found in mock"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => { 
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayload &&
                        state.tableName === 'dialectic_sessions' &&
                        state.operation === 'insert' &&
                        state.selectColumns?.includes('id') && 
                        insertPayload.associated_chat_id === mockOriginatingChatId &&
                        insertPayload.session_description === payload.sessionDescription 
                    ) {
                        return { 
                            data: [{ id: mockNewSessionId }], 
                            error: null, 
                            count: 1, 
                            status: 201, 
                            statusText: "Created" 
                        };
                    }
                    return { data: null, error: new Error("Session insert failed in mock (condition not met or unexpected state)"), count: 0, status: 500, statusText: "Error" };
                },
                update: async (state) => { 
                    if (state.filters.some(f => f.column === 'id' && f.value === mockNewSessionId)) {
                        return { data: [{ id: mockNewSessionId }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                     return { data: null, error: new Error("Session update failed in mock"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_session_models: {
                insert: async (state) => ({ data: state.insertData as object[], error: null, count: (state.insertData as any[]).length, status: 201, statusText: "Created" })
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    let mockRandomUUIDFnWasCalled = false;
    const mockRandomUUIDFnPlain = () => {
        mockRandomUUIDFnWasCalled = true;
        // console.log('[TEST DEBUG] mockRandomUUIDFnPlain CALLED');
        return "mock-uuid-if-unexpectedly-called-plain"; 
    };

    const mockInfoSpy = spy();
    (mockInfoSpy as any)._isCustomMockInfoSpy = true; // Add a unique marker for the info spy
    const mockWarnSpy = spy();
    const mockErrorSpy = spy();
    const mockDebugSpy = spy();

    // Log the marker for the specific spy we are interested in
    console.log('[TEST DEBUG] mockInfoSpy._isCustomMockInfoSpy marker in test setup:', (mockInfoSpy as any)._isCustomMockInfoSpy);

    const mockLoggerForDeps = {
        info: mockInfoSpy,
        warn: mockWarnSpy,
        error: mockErrorSpy,
        debug: mockDebugSpy,
        // Explicitly add configure if the Logger type expects it, even if not used by startSession
        // (based on Logger class, it's a public method but not strictly part of a minimal 'logging' interface)
        // configure: () => {}, 
    } as any as sharedLogger.Logger; // Cast to satisfy the interface

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClient, 
        logger: mockLoggerForDeps, 
        randomUUID: mockRandomUUIDFnPlain,
    };
    
    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined);
        assertEquals(result.data?.sessionId, mockNewSessionId);
        assertEquals(result.data?.initialStatus, "pending_thesis");
        assertEquals(result.data?.associatedChatId, mockOriginatingChatId); 

        assertEquals(mockRandomUUIDFnWasCalled, false, "mockRandomUUIDFn (flag check) should not have been called when originatingChatId is provided");

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy); assertEquals(projectSelectSpy.calls.length, 1);
        const promptSelectSpy = mockAdminDbClientSetup.spies.getHistoricQueryBuilderSpies("system_prompts", "select");
        assertExists(promptSelectSpy); assertEquals(promptSelectSpy.callCount, 2); 
        const sessionModelsInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_session_models")?.insert;
        assertExists(sessionModelsInsertSpy); assertEquals(sessionModelsInsertSpy.calls.length, 1);
        const sessionUpdateSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.update;
        assertExists(sessionUpdateSpy); assertEquals(sessionUpdateSpy.calls.length, 1);

        assert(mockInfoSpy.calls.length >= 5, `Expected at least 5 info logs, but got ${mockInfoSpy.calls.length}`);
        
        assert(mockErrorSpy.calls.length === 0, "Logger.error should not have been called");
    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});
*/

Deno.test("startSession - Generates New Chat ID if not provided", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-happy-path-no-originating-id";
    const mockProjectId = "project-happy-path-no-originating-id";
    const mockGeneratedUUID = "newly-generated-uuid-123";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-def", "model-uvw"],
        sessionDescription: "A test session generating new chat ID",
        // originatingChatId is NOT provided
        thesisPromptTemplateName: "default_thesis", 
        antithesisPromptTemplateName: "default_antithesis",
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClient = (_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient;

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-for-no-originating", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return { 
                            data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Initial prompt for no originating", selected_domain_tag: "general" }], 
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock (no-originating test)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { // Simplified: Assume prompts are found
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.thesisPromptTemplateName)) {
                        return { data: [{ id: "thesis-uuid-no-orig", prompt_text: "Thesis text no-orig" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    if (state.filters.some(f => f.column === 'name' && f.value === payload.antithesisPromptTemplateName)) {
                        return { data: [{ id: "antithesis-uuid-no-orig", prompt_text: "Antithesis text no-orig" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt not found in mock (no-originating test)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: { // Simplified: Assume insert/update works
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayload && insertPayload.associated_chat_id === mockGeneratedUUID) {
                         return { data: [{ id: "new-session-no-orig-uuid" }], error: null, count: 1, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session insert failed in mock (no-originating test), wrong associated_chat_id"), count: 0, status: 500, statusText: "Error" };
                },
                update: async () => ({ data: [{ id: "new-session-no-orig-uuid" }], error: null, count: 1, status: 200, statusText: "OK" })
            },
            dialectic_session_models: { // Simplified: Assume insert works
                insert: async (state) => ({ data: state.insertData as object[], error: null, count: (state.insertData as any[]).length, status: 201, statusText: "Created" })
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    const mockRandomUUIDFnWhichThrows = spy(() => {
        console.log('[TEST DEBUG] mockRandomUUIDFnWhichThrows CALLED');
        throw new Error("INTENTIONAL TEST ERROR: randomUUID was called!");
    });

    const mockLoggerForDeps = { info: spy(), warn: spy(), error: spy(), debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClient, 
        logger: mockLoggerForDeps, 
        randomUUID: mockRandomUUIDFnWhichThrows, // Use the throwing spy
    };
    
    await assertRejects(
        async () => {
            await startSession(mockReq, adminDbClient, payload, deps);
        },
        Error,
        "INTENTIONAL TEST ERROR: randomUUID was called!"
    );

    assertEquals(mockRandomUUIDFnWhichThrows.calls.length, 1, "randomUUID (throwing spy) should have been called exactly once");
});

Deno.test("[TEMP DEBUG] Boolean flag isolation test - flag should remain false", () => {
    let flag = false;
    const originatingId = "some-id";

    if (originatingId) {
        // Do nothing to the flag
    } else {
        flag = true; // This block should not run
    }
    console.log("[TEMP DEBUG] Flag value:", flag);
    assertEquals(flag, false, "Flag should be false if originatingId is present");
});

Deno.test("[TEMP DEBUG] Boolean flag isolation test - flag should become true", () => {
    let flag = false;
    const originatingId = null; // or undefined

    if (originatingId) {
        // Do nothing to the flag
    } else {
        flag = true; // This block SHOULD run
    }
    console.log("[TEMP DEBUG] Flag value:", flag);
    assertEquals(flag, true, "Flag should be true if originatingId is absent");
});

