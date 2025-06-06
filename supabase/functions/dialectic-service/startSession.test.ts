import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext, mockSession } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload, StartSessionSuccessResponse } from "./dialectic.interface.ts";
import { DialecticStage } from "./dialectic.interface.ts";
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

Deno.test("startSession - Happy Path (using project's selected_domain_overlay_id for prompt)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-happy-path-id";
    const mockProjectId = "project-happy-path-id";
    const mockDomainOverlayId = "overlay-happy-id";
    const mockSystemPromptId = "system-prompt-happy-id"; // Linked from overlay
    const mockSystemPromptText = "This is the happy path system prompt from overlay.";
    const mockNewChatId = "newly-generated-chat-id-happy";
    const mockNewSessionId = "new-session-id-happy";
    const mockSelectedModelIds = ["model-catalog-id-1", "model-catalog-id-2"];
    const mockInitialUserPrompt = "Initial prompt for happy path";
    const mockProjectDomainTag = "general";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: "A happy path test session using domain overlay",
        stageAssociation: DialecticStage.THESIS, // Use enum
        // originatingChatId is omitted to trigger new chat ID generation
        // promptTemplateId is omitted to use project's selected_domain_overlay_id
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
                            data: [{ 
                                id: mockProjectId, 
                                user_id: mockUserId, 
                                initial_user_prompt: mockInitialUserPrompt, 
                                selected_domain_tag: mockProjectDomainTag,
                                selected_domain_overlay_id: mockDomainOverlayId // Ensure this is returned
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock (happy path)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            domain_specific_prompt_overlays: { // New mock for this table
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockDomainOverlayId)) {
                        return { data: [{ id: mockDomainOverlayId, system_prompt_id: mockSystemPromptId }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Domain overlay not found"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    // Prompt fetch via overlay
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptId) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { data: [{ id: mockSystemPromptId, prompt_text: mockSystemPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("System prompt not found in mock (happy path via overlay)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayload &&
                        insertPayload.project_id === mockProjectId &&
                        insertPayload.associated_chat_id === mockNewChatId &&
                        insertPayload.session_description === payload.sessionDescription &&
                        insertPayload.stage === DialecticStage.THESIS.toUpperCase() && // Check new stage field
                        insertPayload.status === "pending_thesis" && // Status still derived from stage
                        Array.isArray(insertPayload.selected_model_catalog_ids) && // Check new array field
                        JSON.stringify(insertPayload.selected_model_catalog_ids) === JSON.stringify(mockSelectedModelIds)
                        // Removed active_thesis_prompt_template_id, active_antithesis_prompt_template_id
                    ) {
                        return { data: [{ id: mockNewSessionId }], error: null, count: 1, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session insert failed in mock (happy path condition mismatch)"), count: 0, status: 500, statusText: "Error" };
                },
                // Removed update mock for current_stage_seed_prompt as it's no longer updated in the session
            },
            // Removed dialectic_session_models mock as the table is gone
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
            initialStatus: "pending_thesis", // This remains based on stage
        };
        assertObjectMatch(result.data as any, expectedResponse as any);

        // Assert mock calls
        assertEquals(mockRandomUUIDFn.calls.length, 1, "randomUUID should be called once");
        assertEquals(mockInternalCreateSupabaseClientSpy.calls.length, 1, "createSupabaseClient (internal) should be called once");
        assertEquals(getUserSpy.calls.length, 1, "auth.getUser should be called once");

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy, "Project select spy should exist");
        assertEquals(projectSelectSpy.calls.length, 1, "Project select should be called once");

        const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
        assertExists(overlaySelectSpy, "Domain overlay select spy should exist");
        assertEquals(overlaySelectSpy.calls.length, 1, "Domain overlay select should be called once");
        
        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy, "System prompt select spy should exist");
        assertEquals(systemPromptSelectSpy.calls.length, 1, "System prompt select should be called once");
        
        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertExists(sessionInsertSpy, "Session insert spy should exist");
        assertEquals(sessionInsertSpy.calls.length, 1, "Session insert should be called once");

        const sessionUpdateSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.update;
        assertEquals(sessionUpdateSpy?.calls.length ?? 0, 0, "Session update should not have been called as seed prompt is not updated on session directly.");
        
        const sessionModelsInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_session_models")?.insert;
        assertEquals(sessionModelsInsertSpy, undefined, "Session models insert spy should NOT exist");
        
        assert(loggerInfoFn.calls.length >= 5, "Expected at least 5 info logs for happy path operations"); 
        assertEquals(loggerWarnFn.calls.length, 0, "No warnings expected on happy path");
        assertEquals(loggerErrorFn.calls.length, 0, "No errors expected on happy path");

    } finally {
        // 8. Cleanup
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Happy Path (using payload.promptTemplateId for prompt)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-happy-direct-prompt-id";
    const mockProjectId = "project-happy-direct-prompt-id";
    const mockDirectPromptId = "direct-system-prompt-happy-id";
    const mockDirectPromptText = "This is the happy path system prompt via direct ID.";
    const mockNewChatId = "newly-generated-chat-id-happy-direct";
    const mockNewSessionId = "new-session-id-happy-direct";
    const mockSelectedModelIds = ["model-catalog-id-3", "model-catalog-id-4"];
    const mockInitialUserPromptDirect = "Initial prompt for happy path direct prompt";
    const mockProjectDomainTagDirect = "finance";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: "A happy path test session using direct promptTemplateId",
        stageAssociation: DialecticStage.ANTITHESIS,
        promptTemplateId: mockDirectPromptId, // Provide direct prompt ID
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);
    const getUserSpy = mockUserAuthClientSetup.spies.auth.getUserSpy;

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-happy-direct", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => { // Project selected_domain_overlay_id can be null or anything, won't be used
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{ 
                                id: mockProjectId, 
                                user_id: mockUserId, 
                                initial_user_prompt: mockInitialUserPromptDirect, 
                                selected_domain_tag: mockProjectDomainTagDirect,
                                selected_domain_overlay_id: null 
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock (happy path direct)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            // No domain_specific_prompt_overlays should be called
            system_prompts: {
                select: async (state) => {
                    // Prompt fetch via direct ID
                    if (state.filters.some(f => f.column === 'id' && f.value === mockDirectPromptId) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { data: [{ id: mockDirectPromptId, prompt_text: mockDirectPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("System prompt not found in mock (happy path direct ID)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayloadData = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayloadData &&
                        insertPayloadData.project_id === mockProjectId &&
                        insertPayloadData.associated_chat_id === mockNewChatId &&
                        insertPayloadData.session_description === payload.sessionDescription &&
                        insertPayloadData.stage === DialecticStage.ANTITHESIS.toUpperCase() &&
                        insertPayloadData.status === "pending_antithesis" &&
                        Array.isArray(insertPayloadData.selected_model_catalog_ids) &&
                        JSON.stringify(insertPayloadData.selected_model_catalog_ids) === JSON.stringify(mockSelectedModelIds)
                    ) {
                        return { data: [{ id: mockNewSessionId }], error: null, count: 1, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session insert failed (happy path direct, condition mismatch)"), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDirect = spy(() => mockNewChatId);
    const loggerInfoFnDirect = spy();
    const mockLoggerDirect = { info: loggerInfoFnDirect, warn: spy(), error: spy(), debug: spy() } as any as sharedLogger.Logger;

    const depsDirect: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLoggerDirect,
        randomUUID: mockRandomUUIDFnDirect,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, depsDirect);
        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined);
        const expectedResponseDirect: Partial<StartSessionSuccessResponse> = {
            sessionId: mockNewSessionId,
            associatedChatId: mockNewChatId,
            initialStatus: "pending_antithesis",
        };
        assertObjectMatch(result.data as any, expectedResponseDirect as any);
        assertEquals(mockInternalCreateSupabaseClientSpy.calls.length, 1);
        assertEquals(getUserSpy.calls.length, 1);
        const projectSelectSpyDirect = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpyDirect);
        assertEquals(projectSelectSpyDirect.calls.length, 1);
        const overlaySelectSpyDirect = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
        assertEquals(overlaySelectSpyDirect, undefined, "Domain overlay select should NOT be called when promptTemplateId is provided");
        const systemPromptSelectSpyDirect = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpyDirect);
        assertEquals(systemPromptSelectSpyDirect.calls.length, 1);
        const sessionInsertSpyDirect = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertExists(sessionInsertSpyDirect);
        assertEquals(sessionInsertSpyDirect.calls.length, 1);
        assert(loggerInfoFnDirect.calls.length >= 5);
    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Happy Path (default prompt fallback)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-happy-default-prompt-id";
    const mockProjectId = "project-happy-default-prompt-id";
    const mockDefaultPromptId = "default-system-prompt-happy-id";
    const mockDefaultPromptText = "This is the happy path default system prompt.";
    const mockNewChatId = "newly-generated-chat-id-happy-default";
    const mockNewSessionId = "new-session-id-happy-default";
    const mockSelectedModelIds = ["model-catalog-id-5", "model-catalog-id-6"];
    const mockInitialUserPromptDefault = "Initial prompt for happy path default prompt";
    const mockProjectDomainTagDefault = "education";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: "A happy path test session using default prompt",
        stageAssociation: DialecticStage.SYNTHESIS,
        // promptTemplateId is NOT provided
        // project.selected_domain_overlay_id will also be null/undefined in the mock
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-happy-default", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => { 
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{ 
                                id: mockProjectId, 
                                user_id: mockUserId, 
                                initial_user_prompt: mockInitialUserPromptDefault, 
                                selected_domain_tag: mockProjectDomainTagDefault,
                                selected_domain_overlay_id: null // No overlay
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (happy path default)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            // No domain_specific_prompt_overlays should be called or it should return no specific system_prompt_id
            system_prompts: {
                select: async (state) => {
                    // Default prompt fetch
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === payload.stageAssociation) &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomainTagDefault) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true) 
                        ) {
                        return { data: [{ id: mockDefaultPromptId, prompt_text: mockDefaultPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default fallback fail"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayloadData = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayloadData &&
                        insertPayloadData.project_id === mockProjectId &&
                        insertPayloadData.stage === DialecticStage.SYNTHESIS.toUpperCase() &&
                        insertPayloadData.status === "pending_synthesis"
                    ) {
                        return { data: [{ id: mockNewSessionId }], error: null, count: 1, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session insert failed (happy path default, condition mismatch)"), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFnDefault = spy();
    const mockLoggerDefault = { info: loggerInfoFnDefault, warn: spy(), error: spy(), debug: spy() } as any as sharedLogger.Logger;

    const depsDefault: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClientSpy,
        logger: mockLoggerDefault,
        randomUUID: mockRandomUUIDFnDefault,
    };

    try {
        const result = await startSession(mockReq, adminDbClient, payload, depsDefault);

        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined);
        const expectedResponseDefault: Partial<StartSessionSuccessResponse> = {
            sessionId: mockNewSessionId,
            associatedChatId: mockNewChatId,
            initialStatus: "pending_synthesis",
        };
        assertObjectMatch(result.data as any, expectedResponseDefault as any);
        assertEquals(mockInternalCreateSupabaseClientSpy.calls.length, 1);

        // In this test case, project.selected_domain_overlay_id is mocked to be null.
        // Therefore, the domain_specific_prompt_overlays table should NOT be queried.
        const overlaySelectSpyDefault = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
        assertEquals(overlaySelectSpyDefault, undefined, "domain_specific_prompt_overlays select should not have been called when project.selected_domain_overlay_id is null");

        const systemPromptSelectSpyDefault = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpyDefault);
        assertEquals(systemPromptSelectSpyDefault.calls.length, 1); // Should try to fetch default
        const sessionInsertSpyDefault = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertExists(sessionInsertSpyDefault);
        assertEquals(sessionInsertSpyDefault.calls.length, 1);
        assert(loggerInfoFnDefault.calls.length >= 5);

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - User Not Authenticated", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const payload: StartSessionPayload = {
        projectId: "project-123",
        selectedModelCatalogIds: ["model-abc"],
        stageAssociation: DialecticStage.THESIS,
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
        stageAssociation: DialecticStage.THESIS,
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
        assertEquals(projectSelectSpy.calls.length, 1, "Project select should be called once");

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
        stageAssociation: DialecticStage.THESIS,
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
                    return { data: null, error: new Error("Unexpected project query in mock (happy path)"), count: 0, status: 404, statusText: "Not Found" };
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
        assertExists(projectSelectSpy, "Select spy for dialectic_projects should exist");
        assertEquals(projectSelectSpy.calls.length, 1);

        const singleSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.single;
        assertExists(singleSpy, "Single spy for dialectic_projects should exist");
        assertEquals(singleSpy.calls.length, 1);

        assert(loggerErrorFn.calls.length >= 1, "Expected at least one error log for project access denied");
        const firstErrorCall = loggerErrorFn.calls[0];
        assertExists(firstErrorCall?.args);
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

Deno.test("startSession - Prompt Not Found (by specific payload.promptTemplateId)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-prompt-direct-fail";
    const mockProjectId = "project-prompt-direct-fail";
    const mockMissingPromptId = "specific_missing_prompt_id";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockMissingPromptId, // This ID will not be found
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-prompt-direct-fail", {
        genericMockResults: {
            dialectic_projects: { // Project fetch succeeds
                select: async () => ({
                    data: [{ 
                        id: mockProjectId, 
                        user_id: mockUserId, 
                        initial_user_prompt: "Test prompt", 
                        selected_domain_tag: "general",
                        selected_domain_overlay_id: "some-overlay-id-should-not-be-used" 
                    }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            system_prompts: { // Prompt fetch by direct ID will fail by returning an error from .single()
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockMissingPromptId) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        // Simulate .single() failing when no row is found by returning an error object
                        return { data: null, error: { name: "PostgrestError", message: "Query returned no rows", code: "PGRST116" }, count: 0, status: 406, statusText: "Not Acceptable" }; 
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for direct ID fail"), count: 0, status: 500, statusText: "Error" };
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
        assertEquals(result.error?.message, `Prompt fetching failed: Error fetching prompt by direct ID ${mockMissingPromptId}: Query returned no rows`, `Error message mismatch: ${result.error?.message}`);

        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy, "System prompt select spy should exist");
        assertEquals(systemPromptSelectSpy.calls.length, 1); 
        
        const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
        assertEquals(overlaySelectSpy, undefined, "domain_specific_prompt_overlays select should not be called");

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

Deno.test("startSession - Prompt Not Found (via project.selected_domain_overlay_id)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-prompt-overlay-fail";
    const mockProjectId = "project-prompt-overlay-fail";
    const mockDomainOverlayId = "overlay-linking-to-missing-prompt";
    const mockMissingSystemPromptIdFromOverlay = "missing-system-prompt-id-from-overlay"; 

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-xyz"],
        stageAssociation: DialecticStage.ANTITHESIS,
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-prompt-overlay-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ 
                        id: mockProjectId, 
                        user_id: mockUserId, 
                        initial_user_prompt: "Test prompt", 
                        selected_domain_tag: "general",
                        selected_domain_overlay_id: mockDomainOverlayId 
                    }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            domain_specific_prompt_overlays: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockDomainOverlayId)) {
                        return { data: [{ id: mockDomainOverlayId, system_prompt_id: mockMissingSystemPromptIdFromOverlay }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Overlay not found mock error"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { 
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockMissingSystemPromptIdFromOverlay) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        // Simulate .single() failing when no row is found by returning an error object
                        return { data: null, error: { name: "PostgrestError", message: "Query returned no rows", code: "PGRST116" }, count: 0, status: 406, statusText: "Not Acceptable" }; 
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for overlay fail"), count: 0, status: 500, statusText: "Error" };
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
        assertEquals(result.error?.message, `Prompt fetching failed: Error fetching system prompt using ID from overlay (${mockMissingSystemPromptIdFromOverlay}): Query returned no rows`, `Error message mismatch: ${result.error.message}`);
        
        const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
        assertExists(overlaySelectSpy);
        assertEquals(overlaySelectSpy.calls.length, 1);

        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy);
        assertEquals(systemPromptSelectSpy.calls.length, 1); 

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Prompt Not Found (default for stage/context fallback)", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-default-prompt-fail";
    const mockProjectId = "project-default-prompt-fail";
    const mockProjectDomain = "missing_default_prompt_context"; // Context for which no default prompt exists

    const payload: StartSessionPayload = { 
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        stageAssociation: DialecticStage.SYNTHESIS, // Try to find default for SYNTHESIS
        // No promptTemplateId
        // selected_domain_overlay_id in project will be null
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-default-prompt-fail-context", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ 
                        id: mockProjectId, 
                        user_id: mockUserId, 
                        initial_user_prompt: "Test prompt", 
                        selected_domain_tag: mockProjectDomain,
                        selected_domain_overlay_id: null // No overlay
                    }],
                    error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            // domain_specific_prompt_overlays won't be queried or will return nothing useful
            system_prompts: {
                select: async (state) => {
                    // Default prompt fetch by stage & context will fail
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === payload.stageAssociation) &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomain) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // Not found
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default fallback fail"), count: 0, status: 500, statusText: "Error" };
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
        assert(result.error?.message?.includes(`Prompt fetching failed: No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomain}'`), `Error message: ${result.error.message}`);
        
        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy);
        assertEquals(systemPromptSelectSpy.calls.length, 1); // Should try to fetch default

    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - DB Error: Session Insert Fails", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-session-insert-fail";
    const mockProjectId = "project-session-insert-fail";
    const mockSystemPromptId = "sys-prompt-id-session-fail"; // Single system prompt

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        sessionDescription: "Test session insert fail",
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockSystemPromptId, // Use a direct ID that's assumed to exist for this test
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClientSpy = spy((_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient);

    const dbError = { name: "DBError", message: 'Simulated DB insert error', code: 'XXYYZ', details: "DB constraint violation perhaps" };
    const mockAdminDbClientSetup = createMockSupabaseClient("admin-session-insert-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Prompt", selected_domain_tag: "general", selected_domain_overlay_id: null }], error: null, count: 1, status: 200, statusText: "OK" })
            },
            system_prompts: { // Mock a successful system prompt fetch
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptId)) {
                        return { data: [{ id: mockSystemPromptId, prompt_text: "System prompt text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("System prompt query error for session insert fail test"), count: 0, status: 500, statusText: "Error" };
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

        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertExists(sessionInsertSpy);
        assertEquals(sessionInsertSpy.calls.length, 1);
        
        // Check that the insert payload matches the new structure
        const insertCallArgs = sessionInsertSpy.calls[0].args[0] as Record<string, unknown>;
        assertObjectMatch(insertCallArgs, {
            project_id: mockProjectId,
            session_description: payload.sessionDescription,
            stage: payload.stageAssociation.toUpperCase(),
            status: `pending_${payload.stageAssociation}`,
            selected_model_catalog_ids: payload.selectedModelCatalogIds,
            // No active_..._prompt_template_id fields
        });
        
        assertEquals(loggerErrorFn.calls.length, 1);
        const errCall = loggerErrorFn.calls[0].args[1] as Record<string,unknown>;
        assertObjectMatch(errCall, { projectId: mockProjectId, error: { message: dbError.message } });


    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Uses Originating Chat ID when provided", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-orig-chat";
    const mockProjectId = "project-orig-chat";
    const mockOriginatingChatId = "existing-chat-uuid-123";
    const mockSystemPromptId = "sys-prompt-orig-chat";
    const mockSystemPromptText = "This is the system prompt text for orig chat.";
    const mockNewSessionId = "new-session-uuid-orig-chat";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc", "model-xyz"],
        sessionDescription: "A test session with originating chat ID",
        originatingChatId: mockOriginatingChatId, 
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockSystemPromptId, // Provide a direct prompt ID
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClient = (_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient;

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-orig-chat", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return { 
                            data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Initial prompt text", selected_domain_tag: "general", selected_domain_overlay_id: null }], 
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock (orig chat)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptId)) {
                        return { data: [{ id: mockSystemPromptId, prompt_text: mockSystemPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt not found in mock (orig chat)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => { 
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayload &&
                        insertPayload.associated_chat_id === mockOriginatingChatId &&
                        insertPayload.session_description === payload.sessionDescription &&
                        insertPayload.stage === payload.stageAssociation.toUpperCase() &&
                        Array.isArray(insertPayload.selected_model_catalog_ids)
                    ) {
                        return { 
                            data: [{ id: mockNewSessionId }], 
                            error: null, 
                            count: 1, 
                            status: 201, 
                            statusText: "Created" 
                        };
                    }
                    return { data: null, error: new Error("Session insert failed in mock (orig chat, condition not met)"), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    let mockRandomUUIDFnWasCalled = false;
    const mockRandomUUIDFnPlain = () => {
        mockRandomUUIDFnWasCalled = true;
        return "mock-uuid-if-unexpectedly-called-plain"; 
    };
    
    const mockInfoSpy = spy();
    const mockErrorSpy = spy();
    const mockLoggerForDeps = { info: mockInfoSpy, warn: spy(), error: mockErrorSpy, debug: spy() } as any as sharedLogger.Logger;

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
        assertEquals(result.data?.initialStatus, `pending_${payload.stageAssociation}`);
        assertEquals(result.data?.associatedChatId, mockOriginatingChatId); 

        assertEquals(mockRandomUUIDFnWasCalled, false, "mockRandomUUIDFn (flag check) should not have been called when originatingChatId is provided");

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy); assertEquals(projectSelectSpy.calls.length, 1);
        
        const promptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(promptSelectSpy); assertEquals(promptSelectSpy.calls.length, 1); 
        
        // No session_models insert, no session update for seed prompt
        const sessionModelsInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_session_models")?.insert;
        assertEquals(sessionModelsInsertSpy, undefined);
        const sessionUpdateSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.update;
        assertEquals(sessionUpdateSpy?.calls.length ?? 0, 0, "Session update should not have been called.");


        assert(mockInfoSpy.calls.length >= 4, `Expected at least 4 info logs, but got ${mockInfoSpy.calls.length}`);
        assert(mockErrorSpy.calls.length === 0, "Logger.error should not have been called");
    } finally {
        mockUserAuthClientSetup.clearAllStubs?.();
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Generates New Chat ID if not provided", async () => {
    const mockReq = new Request("http://localhost", { method: "POST" });
    const mockUserId = "user-no-orig-id";
    const mockProjectId = "project-no-orig-id";
    const mockGeneratedUUID = "newly-generated-uuid-123";
    const mockSystemPromptId = "sys-prompt-no-orig";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-def", "model-uvw"],
        sessionDescription: "A test session generating new chat ID",
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockSystemPromptId, // Provide a direct prompt ID
        // originatingChatId is NOT provided
    };

    const mockUserAuthClientSetup = createMockSupabaseClient(mockUserId);
    const mockInternalCreateSupabaseClient = (_req: Request) => mockUserAuthClientSetup.client as unknown as SupabaseClient;

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-for-no-originating", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                        return { 
                            data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Initial prompt for no originating", selected_domain_tag: "general", selected_domain_overlay_id: null }], 
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (no-originating test)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { 
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptId)) {
                        return { data: [{ id: mockSystemPromptId, prompt_text: "System text no-orig" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt not found (no-originating test)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: { 
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    if (insertPayload && insertPayload.associated_chat_id === mockGeneratedUUID) {
                         return { data: [{ id: "new-session-no-orig-uuid" }], error: null, count: 1, status: 201, statusText: "Created" };
                    }
                    return { data: null, error: new Error("Session insert failed (no-originating test), wrong associated_chat_id"), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

    // This spy will be called because originatingChatId is not provided
    const mockRandomUUIDFn = spy(() => mockGeneratedUUID); 

    const mockLoggerForDeps = { info: spy(), warn: spy(), error: spy(), debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        createSupabaseClient: mockInternalCreateSupabaseClient, 
        logger: mockLoggerForDeps, 
        randomUUID: mockRandomUUIDFn, 
    };
    
    // The function should succeed, not reject, because randomUUID will be called and provide a UUID.
    const result = await startSession(mockReq, adminDbClient, payload, deps);
    assertExists(result.data, `Session start should succeed: ${result.error?.message}`);
    assertEquals(result.error, undefined);
    assertEquals(result.data?.associatedChatId, mockGeneratedUUID);
    assertEquals(mockRandomUUIDFn.calls.length, 1, "randomUUID spy should have been called exactly once");
});

// Removed TEMP DEBUG tests
/*
Deno.test("[TEMP DEBUG] Boolean flag isolation test - flag should remain false", () => {
// ...
});

Deno.test("[TEMP DEBUG] Boolean flag isolation test - flag should become true", () => {
// ...
});
*/

