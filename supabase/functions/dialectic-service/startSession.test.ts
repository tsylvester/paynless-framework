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
    // TODO: Implement Happy Path test for startSession
    // - Mock successful user auth
    // - Mock successful project fetch
    // - Mock successful thesis prompt fetch (default or by name)
    // - Mock successful antithesis prompt fetch (default or by name)
    // - Mock successful session insert
    // - Mock successful session_models insert
    // - Mock successful session update with seed prompt
    // - Mock randomUUID if originatingChatId is not provided, or test with originatingChatId
    // - Assert successful response, correct status, sessionId, associatedChatId
    // - Assert all mock calls (db, createSupabaseClient, randomUUID, logger)
    assertEquals(1, 1); // Placeholder
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
    // TODO: Implement test for project access denied
    // - Mock successful user auth (user A)
    // - Mock dbClient.from('dialectic_projects')...eq('user_id', userA.id)...single() to return { data: null, error: null } (as if project belongs to user B)
    // - Assert error response (status 404, as project is "not found" for this user)
    assertEquals(1, 1); // Placeholder
});

Deno.test("startSession - Thesis Prompt Not Found (by specific name)", async () => {
    // TODO: Implement test for thesis prompt not found by specific name
    // - Mock successful user auth & project fetch
    // - Mock dbClient.from('system_prompts')...eq('name', 'specific_missing_thesis_name')...maybeSingle() to return { data: null, error: null }
    // - Provide 'specific_missing_thesis_name' in payload
    // - Assert error response (status 400, specific error message about prompt not found)
    assertEquals(1, 1); // Placeholder
});

Deno.test("startSession - Thesis Prompt Not Found (default for context)", async () => {
    // TODO: Implement test for default thesis prompt not found
    // - Mock successful user auth & project fetch
    // - Do NOT provide thesisPromptTemplateName in payload
    // - Mock dbClient.from('system_prompts')...eq('stage_association', 'thesis').eq('is_stage_default', true).eq('context', ...)...maybeSingle() to return { data: null, error: null }
    // - Assert error response (status 400, specific error message)
    assertEquals(1, 1); // Placeholder
});

Deno.test("startSession - Antithesis Prompt Not Found (by specific name)", async () => {
    // TODO: Implement test for antithesis prompt not found by specific name
    // - Mock successful user auth, project fetch, and thesis prompt fetch
    // - Mock dbClient.from('system_prompts')...eq('name', 'specific_missing_antithesis_name')...maybeSingle() to return { data: null, error: null }
    // - Provide 'specific_missing_antithesis_name' in payload
    // - Assert error response (status 400, specific error message)
    assertEquals(1, 1); // Placeholder
});

Deno.test("startSession - Antithesis Prompt Not Found (default for context)", async () => {
    // TODO: Implement test for default antithesis prompt not found
    // - Mock successful user auth, project fetch, and thesis prompt fetch
    // - Do NOT provide antithesisPromptTemplateName in payload
    // - Mock dbClient.from('system_prompts')...eq('stage_association', 'antithesis')...eq('is_stage_default', true).eq('context', ...)...maybeSingle() to return { data: null, error: null }
    // - Assert error response (status 400, specific error message)
    assertEquals(1, 1); // Placeholder
});

Deno.test("startSession - DB Error: Session Insert Fails", async () => {
    // TODO: Implement test for session insert failure
    // - Mock successful user auth, project fetch, and prompt fetches
    // - Mock dbClient.from('dialectic_sessions').insert(...).single() to return { data: null, error: { message: 'DB insert error', code: 'XXYYZ' } }
    // - Assert error response (status 500)
    assertEquals(1, 1); // Placeholder
});

Deno.test("startSession - DB Error: Session Models Insert Fails (check session cleanup)", async () => {
    // TODO: Implement test for session_models insert failure
    // - Mock successful user auth, project fetch, prompt fetches, and session insert
    // - Mock dbClient.from('dialectic_session_models').insert(...) to return { error: { message: 'DB session_models insert error' } }
    // - Spy on dbClient.from('dialectic_sessions').delete() to ensure cleanup is attempted
    // - Assert error response (status 500)
    assertEquals(1, 1); // Placeholder
});

Deno.test("startSession - DB Error: Session Update with Seed Prompt Fails", async () => {
    // TODO: Implement test for session update (with seed prompt) failure
    // - Mock successful user auth, project fetch, prompt fetches, session insert, and session_models insert
    // - Mock dbClient.from('dialectic_sessions').update(...).single() to return { data: null, error: { message: 'DB update error' } }
    // - Assert error response (status 500)
    // - Note: This error might be hard to trigger cleanly if the session is already considered "started". Consider if the current function logic allows for this distinct error state post-creation.
    assertEquals(1, 1); // Placeholder
});

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
                insert: async (state) => { 
                    const insertData = state.insertData as any[];
                    if (insertData && insertData.length === payload.selectedModelCatalogIds.length && insertData.every(d => d.session_id === mockNewSessionId)) {
                        return { data: insertData, error: null, count: insertData.length, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session models insert failed in mock"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    const mockRandomUUIDFn = spy(() => "mock-uuid-should-not-be-called");

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
        randomUUID: mockRandomUUIDFn,
    };
    
    try {
        const result = await startSession(mockReq, adminDbClient, payload, deps);

        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined);
        assertEquals(result.data?.sessionId, mockNewSessionId);
        assertEquals(result.data?.initialStatus, "pending_thesis");
        assertEquals(result.data?.associatedChatId, mockOriginatingChatId); 

        assertEquals(mockRandomUUIDFn.calls.length, 0, "randomUUID should not be called when originatingChatId is provided");

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy); assertEquals(projectSelectSpy.calls.length, 1);
        const promptSelectSpy = mockAdminDbClientSetup.spies.getHistoricQueryBuilderSpies("system_prompts", "select");
        assertExists(promptSelectSpy); assertEquals(promptSelectSpy.callCount, 2); 
        const sessionModelsInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_session_models")?.insert;
        assertExists(sessionModelsInsertSpy); assertEquals(sessionModelsInsertSpy.calls.length, 1);
        const sessionUpdateSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.update;
        assertExists(sessionUpdateSpy); assertEquals(sessionUpdateSpy.calls.length, 1);

        // Focused logger assertion
        console.log(`[TEST DEBUG] mockInfoSpy.calls.length: ${mockInfoSpy.calls.length}`);
        assert(mockInfoSpy.calls.length >= 5, `Expected at least 5 info logs, but got ${mockInfoSpy.calls.length}`);
        
        assert(mockErrorSpy.calls.length === 0, "Logger.error should not have been called");
    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Generates New Chat ID if not provided", async () => {
    // TODO: Implement test to verify new chatId is generated
    // - Similar to Happy Path, but do NOT provide originatingChatId
    // - Mock randomUUID to return a specific mock UUID
    // - Assert randomUUID is called once
    // - Assert the response's associatedChatId matches the mock UUID
    // - Assert the dialectic_sessions insert call uses the mock UUID
    assertEquals(1, 1); // Placeholder
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
