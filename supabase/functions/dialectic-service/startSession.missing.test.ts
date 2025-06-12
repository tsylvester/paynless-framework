// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext, mockSession } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload, StartSessionSuccessResponse } from "./dialectic.interface.ts";
import { DialecticStage } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import * as sharedLogger from "../_shared/logger.ts";
import { createMockSupabaseClient, type IMockSupabaseClient, type MockSupabaseClientSetup, type IMockSupabaseAuth } from "../_shared/supabase.mock.ts";

Deno.test("startSession - Project Not Found for User", async () => {
    const mockUserProjectNotFound: User = {
        id: "user-project-not-found-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserProjectNotFound.id;

    const payload: StartSessionPayload = {
        projectId: "non-existent-project-id",
        selectedModelCatalogIds: ["model-abc"],
        stageAssociation: DialecticStage.THESIS,
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("test-admin-id", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    const idFilter = state.filters.find(f => f.column === 'id' && f.value === payload.projectId);
                    const userIdFilter = state.filters.find(f => f.column === 'user_id' && f.value === mockUserId);
                    if (idFilter && userIdFilter && state.operation === 'select') {
                        return { data: null, error: { name: "PGRST116", message: "No rows found", code: "PGRST116" } as any, count: 0, status: 406, statusText: "Not Found" }; 
                    }
                    return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;

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
        logger: mockLogger,
    };

    try {
        const result = await startSession(mockUserProjectNotFound, adminDbClient, payload, deps);

        assertExists(result.error);
        assertEquals(result.error?.message, "Project not found or access denied.");
        assertEquals(result.error?.status, 404);

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy, "Select spy for dialectic_projects should exist");
        assertEquals(projectSelectSpy.calls.length, 1, "Project select should be called once");

        const singleSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.single;
        assertExists(singleSpy, "Single spy for dialectic_projects should exist");
        assertEquals(singleSpy.calls.length, 1);

        assert(loggerInfoFn.calls.length >= 2, "Expected at least 2 info logs"); 
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
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Domain Overlay Not Found (when selected_domain_overlay_id is provided)", async () => {
    const mockUserOverlayNotFound: User = {
        id: "user-overlay-not-found-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserOverlayNotFound.id;
    const mockProjectId = "project-prompt-overlay-fail";
    const mockDomainOverlayId = "overlay-non-existent-id";
    const mockMissingSystemPromptIdFromOverlay = "missing-system-prompt-id-from-overlay"; 

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-xyz"],
        stageAssociation: DialecticStage.ANTITHESIS,
    };

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
                        return { data: null, error: { name: "PostgrestError", message: "Simulated PGRST116 No Rows Found", code: "PGRST116" } as any, count: 0, status: 406, statusText: "Not Found" };
                    }
                    return { data: null, error: new Error("Overlay not found mock error - fallback"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { 
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockMissingSystemPromptIdFromOverlay) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { data: null, error: { name: "PostgrestError", message: "Query returned no rows", code: "PGRST116" } as any, count: 0, status: 406, statusText: "Not Acceptable" }; 
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
        logger: mockLogger,
        randomUUID: spy(),
    };

    const result = await startSession(mockUserOverlayNotFound, adminDbClient, payload, deps);

    assertExists(result.error, "Expected an error object when domain overlay is not found.");
    assertEquals(result.data, undefined, "Expected no data when domain overlay is not found.");
    assertEquals(result.error?.message, `Domain-specific prompt overlay with ID '${mockDomainOverlayId}' (from project settings) not found.`, `Unexpected error message: ${result.error?.message}`);
    assertEquals(result.error?.status, 400);

    // Assert mock calls for this failure path
    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertExists(projectSelectSpy, "Project select spy should exist");
    assertEquals(projectSelectSpy.calls.length, 1, "Project select should be called once");

    const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
    assertExists(overlaySelectSpy, "Domain overlay select spy should exist");
    assertEquals(overlaySelectSpy.calls.length, 1, "Domain overlay select should be called once");
    
    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertEquals(systemPromptSelectSpy, undefined, "System prompt select should NOT have been called.");

    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertEquals(sessionInsertSpy, undefined, "Session insert should NOT have been called.");

    assertEquals(loggerErrorFn.calls.length, 1, "Expected one error log.");
    const firstErrorLogArgs = loggerErrorFn.calls[0].args;
    assert(firstErrorLogArgs[0].includes("[startSession] Error fetching domain specific prompt overlay by ID"));
});

Deno.test("startSession - System Prompt Not Found (via overlay)", async () => {
    const mockUserSystemPromptMissingViaOverlay: User = {
        id: "user-sysprompt-missing-overlay-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserSystemPromptMissingViaOverlay.id;
    const mockProjectId = "project-prompt-overlay-fail";
    const mockDomainOverlayId = "overlay-linking-to-missing-prompt";
    const mockMissingSystemPromptIdFromOverlay = "missing-system-prompt-id-from-overlay"; 

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-xyz"],
        stageAssociation: DialecticStage.ANTITHESIS,
    };

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
                        return { data: null, error: { name: "PostgrestError", message: "Query returned no rows", code: "PGRST116" } as any, count: 0, status: 406, statusText: "Not Acceptable" }; 
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
        logger: mockLogger,
        randomUUID: spy(),
    };

    const result = await startSession(mockUserSystemPromptMissingViaOverlay, adminDbClient, payload, deps);

    assertExists(result.error, "Expected an error object when system prompt (via overlay) is not found.");
    assertEquals(result.data, undefined, "Expected no data.");
    const expectedErrorMessage = `System prompt with ID '${mockMissingSystemPromptIdFromOverlay}' (referenced by domain overlay '${mockDomainOverlayId}') not found or is inactive.`;
    assertEquals(result.error?.message, expectedErrorMessage);
    assertEquals(result.error?.status, 400);

    // Assert mock calls
    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertEquals(projectSelectSpy?.calls.length, 1);
    const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
    assertEquals(overlaySelectSpy?.calls.length, 1);
    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertEquals(systemPromptSelectSpy?.calls.length, 1);
    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertEquals(sessionInsertSpy, undefined);
    assertEquals(loggerErrorFn.calls.length, 1);
});

Deno.test("startSession - System Prompt Not Found (via payload.promptTemplateId)", async () => {
    const mockUserSystemPromptMissingDirect: User = {
        id: "user-sysprompt-missing-direct-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserSystemPromptMissingDirect.id;
    const mockProjectId = "project-prompt-direct-fail";
    const mockMissingPromptId = "specific_missing_prompt_id";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockMissingPromptId,
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-prompt-direct-fail", {
        genericMockResults: {
            dialectic_projects: { 
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
            system_prompts: { 
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockMissingPromptId) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { data: null, error: { name: "PostgrestError", message: "Query returned no rows", code: "PGRST116" } as any, count: 0, status: 406, statusText: "Not Acceptable" }; 
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
        logger: mockLogger,
        randomUUID: spy(),
    };

    const result = await startSession(mockUserSystemPromptMissingDirect, adminDbClient, payload, deps);
    
    assertExists(result.error, "Expected an error object when system prompt (via direct ID) is not found.");
    assertEquals(result.data, undefined, "Expected no data.");
    const expectedErrorMessage = `System prompt with ID '${mockMissingPromptId}' not found or is inactive.`;
    assertEquals(result.error?.message, expectedErrorMessage);
    assertEquals(result.error?.status, 400);

    // Assert mock calls
    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertEquals(projectSelectSpy?.calls.length, 1);
    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertEquals(systemPromptSelectSpy?.calls.length, 1);
    const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
    assertEquals(overlaySelectSpy, undefined);
    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertEquals(sessionInsertSpy, undefined);
    assertEquals(loggerErrorFn.calls.length, 1);
});

Deno.test("startSession - System Prompt Not Found (via project default)", async () => {
    const mockUserSystemPromptMissingDefault: User = {
        id: "user-sysprompt-missing-default-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserSystemPromptMissingDefault.id;
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
    };

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
                                selected_domain_overlay_id: null
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (happy path default)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === payload.stageAssociation) &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomainTagDefault) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; 
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default fallback fail"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFnDefault = spy();
    const loggerErrorFnDefault = spy(); // Create a dedicated error spy
    const mockLoggerDefault = { info: loggerInfoFnDefault, warn: spy(), error: loggerErrorFnDefault, debug: spy() } as any as sharedLogger.Logger; // Use the dedicated error spy

    const depsDefault: Partial<StartSessionDeps> = {
        logger: mockLoggerDefault,
        randomUUID: mockRandomUUIDFnDefault,
    };

    const result = await startSession(mockUserSystemPromptMissingDefault, adminDbClient, payload, depsDefault);

    assertExists(result.error, "Expected an error object when default system prompt is not found.");
    assertEquals(result.data, undefined, "Expected no data.");
    const expectedErrMessage = `No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'.`; // Added trailing period back
    // Use assertEquals for precise message matching
    assertEquals(result.error?.message, expectedErrMessage);
    assertEquals(result.error?.status, 400);
    
    // Assert mock calls
    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertEquals(projectSelectSpy?.calls.length, 1);
    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertEquals(systemPromptSelectSpy?.calls.length, 1);
    const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
    assertEquals(overlaySelectSpy, undefined); // No overlay involved
    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertEquals(sessionInsertSpy, undefined); // Session not inserted
    assertEquals(loggerErrorFnDefault.calls.length, 1); // Assert on the dedicated error spy
});

Deno.test("startSession - Handles missing initial_user_prompt and selected_domain_tag in project", async () => {
    const mockUserMissingProjectDetails: User = {
        id: "user-missing-proj-details-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserMissingProjectDetails.id;
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
    };

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
                                initial_user_prompt: null, 
                                selected_domain_tag: null,
                                selected_domain_overlay_id: null
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (happy path default)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === payload.stageAssociation) &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === 'general') &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; 
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for null project tags"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFnDefault = spy();
    const mockLoggerDefault = { info: loggerInfoFnDefault, warn: spy(), error: spy(), debug: spy() } as any as sharedLogger.Logger;

    const depsDefault: Partial<StartSessionDeps> = {
        logger: mockLoggerDefault,
        randomUUID: mockRandomUUIDFnDefault,
    };

    try {
        const result = await startSession(mockUserMissingProjectDetails, adminDbClient, payload, depsDefault);
        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        const expectedDetail = `No suitable default prompt found for stage '${payload.stageAssociation}' and context 'general'.`;
        assertEquals(result.error?.message, expectedDetail);
        
        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy);
        assertEquals(systemPromptSelectSpy.calls.length, 1);

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Handles missing selected_domain_overlay_id in project (uses default system prompt)", async () => {
    const mockUserNoOverlayInProject: User = {
        id: "user-no-overlay-in-project-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserNoOverlayInProject.id;
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
    };

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
                                selected_domain_overlay_id: null
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (happy path default)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { // Mock to ensure no default prompt is found for this specific context
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'stage_association' && typeof f.value === 'string' && f.value.toUpperCase() === payload.stageAssociation.toUpperCase()) && // Robust stage comparison
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomainTagDefault) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // No prompt found
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default fallback fail (no overlay)"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFnDefault = spy();
    const loggerErrorFnForNoOverlayTest = spy(); // Defined spy for this test
    const mockLoggerDefault = { info: loggerInfoFnDefault, warn: spy(), error: loggerErrorFnForNoOverlayTest, debug: spy() } as any as sharedLogger.Logger;

    const depsDefault: Partial<StartSessionDeps> = {
        logger: mockLoggerDefault,
        randomUUID: mockRandomUUIDFnDefault,
    };

    try {
        const result = await startSession(mockUserNoOverlayInProject, adminDbClient, payload, depsDefault);
        assertExists(result.error, "result.error should be defined when no default prompt is found.");
        assertEquals(result.data, undefined, "result.data should be undefined when an error occurs.");
        const expectedErrMessage = `No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'.`;
        assertEquals(result.error?.message, expectedErrMessage);
        assertEquals(result.error?.status, 400);

        // Logger assertions
        assertEquals(loggerInfoFnDefault.calls.length, 5, "Expected 5 info logs for this path.");
        assert(loggerInfoFnDefault.calls.length > 0 && loggerInfoFnDefault.calls[0].args && typeof loggerInfoFnDefault.calls[0].args[0] === 'string' && loggerInfoFnDefault.calls[0].args[0].startsWith("[startSession] Function started."), `Info Log 0 (function started) mismatch, not a string, or undefined. Actual: ${loggerInfoFnDefault.calls[0]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 1 && loggerInfoFnDefault.calls[1].args && typeof loggerInfoFnDefault.calls[1].args[0] === 'string' && loggerInfoFnDefault.calls[1].args[0] === `[startSession] Called with payload: ${JSON.stringify(payload)} for user ${mockUserNoOverlayInProject.id}`, `Info Log 1 (payload) mismatch, not a string, or undefined. Actual: ${loggerInfoFnDefault.calls[1]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 2 && loggerInfoFnDefault.calls[2].args && loggerInfoFnDefault.calls[2].args.length > 0 && String(loggerInfoFnDefault.calls[2].args[0]).includes("No originatingChatId provided, generating a new one"), `Info Log 2 (new chat ID generated) mismatch/undefined. Actual: ${loggerInfoFnDefault.calls[2]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 3 && loggerInfoFnDefault.calls[3].args && loggerInfoFnDefault.calls[3].args.length > 0 && String(loggerInfoFnDefault.calls[3].args[0]).includes(`Project ${mockProjectId} details fetched`), `Info Log 3 (project details) mismatch/undefined. Actual: ${loggerInfoFnDefault.calls[3]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 4 && loggerInfoFnDefault.calls[4].args && typeof loggerInfoFnDefault.calls[4].args[0] === 'string' && loggerInfoFnDefault.calls[4].args[0].includes(`[startSession] No specific prompt ID or overlay ID provided. Fetching default prompt for stage: ${payload.stageAssociation}, context: ${mockProjectDomainTagDefault}`), `Info Log 4 (fetching default) mismatch, not a string, or undefined. Actual: ${loggerInfoFnDefault.calls[4]?.args?.[0]}`);

        assertEquals(loggerErrorFnForNoOverlayTest.calls.length, 1, "Error log expected when no prompt can be found"); 
        const loggedErrorArgsNoOverlay = loggerErrorFnForNoOverlayTest.calls[0].args;
        assertEquals(loggedErrorArgsNoOverlay[0], "[startSession] Error fetching default system prompt", "Generic log message prefix mismatch");
        assertObjectMatch(loggedErrorArgsNoOverlay[1] as Record<string, unknown>, {
            projectId: mockProjectId,
            userId: mockUserNoOverlayInProject.id,
            stage: payload.stageAssociation,
            contextAttempted: mockProjectDomainTagDefault,
            dbError: null
        });
        
        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.calls.length, 1);
        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy);
        assertEquals(systemPromptSelectSpy.calls.length, 1);
        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertEquals(sessionInsertSpy, undefined, "Session should not be inserted if prompt fetching fails");

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Handles missing default_system_prompt_id in project (when no overlay or payload ID)", async () => {
    const mockUserNoDefaultPrompt: User = {
        id: "user-no-default-prompt-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserNoDefaultPrompt.id;
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
    };

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
                                selected_domain_overlay_id: null
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (happy path default)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === payload.stageAssociation) &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomainTagDefault) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; 
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default fallback fail"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFnDefault = spy();
    const loggerErrorFnForNoDefaultPromptTest = spy(); // Create a dedicated error spy for this test
    const mockLoggerDefault = { info: loggerInfoFnDefault, warn: spy(), error: loggerErrorFnForNoDefaultPromptTest, debug: spy() } as any as sharedLogger.Logger; // Use it

    const depsDefault: Partial<StartSessionDeps> = {
        logger: mockLoggerDefault,
        randomUUID: mockRandomUUIDFnDefault,
    };

    const result = await startSession(mockUserNoDefaultPrompt, adminDbClient, payload, depsDefault);
    
    assertExists(result.error, "Expected an error object when no default system prompt ID is found and no overlay/payload ID provided.");
    assertEquals(result.data, undefined, "Expected no data.");
    const expectedErrMessage = `No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'.`;
    assertEquals(result.error?.message, expectedErrMessage);
    assertEquals(result.error?.status, 400);

    // Assert mock calls
    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertEquals(projectSelectSpy?.calls.length, 1);
    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertEquals(systemPromptSelectSpy?.calls.length, 1);
    const overlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
    assertEquals(overlaySelectSpy, undefined); // No overlay involved
    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertEquals(sessionInsertSpy, undefined); // Session not inserted
    assertEquals(loggerErrorFnForNoDefaultPromptTest.calls.length, 1); // Assert on the dedicated error spy
});

Deno.test("startSession - Handles empty selectedModelCatalogIds gracefully (if business logic allows)", async () => {
    const mockUserEmptyModels: User = {
        id: "user-empty-models-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserEmptyModels.id;
    const mockProjectId = "project-happy-default-prompt-id";
    const mockDefaultPromptId = "default-system-prompt-happy-id";
    const mockDefaultPromptText = "This is the happy path default system prompt.";
    const mockNewChatId = "newly-generated-chat-id-happy-default";
    const mockNewSessionId = "new-session-id-happy-default";
    const mockSelectedModelIds: string[] = [];
    const mockInitialUserPromptDefault = "Initial prompt for empty models test";
    const mockProjectDomainTagDefault = "general_empty_models";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: "A happy path test session using default prompt",
        stageAssociation: DialecticStage.SYNTHESIS,
    };

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
                                selected_domain_overlay_id: null
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (happy path default)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'stage_association' && typeof f.value === 'string' && f.value.toUpperCase() === payload.stageAssociation.toUpperCase()) && // Robust stage comparison
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomainTagDefault) && // Uses "general_empty_models"
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; 
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default fallback fail (empty models)"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFnDefault = spy();
    const loggerErrorFnForEmptyModelsTest = spy(); // Defined spy for this test
    const mockLoggerDefault = { info: loggerInfoFnDefault, warn: spy(), error: loggerErrorFnForEmptyModelsTest, debug: spy() } as any as sharedLogger.Logger;

    const depsDefault: Partial<StartSessionDeps> = {
        logger: mockLoggerDefault,
        randomUUID: mockRandomUUIDFnDefault,
    };

    try {
        const result = await startSession(mockUserEmptyModels, adminDbClient, payload, depsDefault);
        assertExists(result.error, "result.error should be defined when no default prompt is found and selected models are empty.");
        assertEquals(result.data, undefined, "result.data should be undefined when an error occurs.");
        const expectedErrMessage = `No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'.`;
        assertEquals(result.error?.message, expectedErrMessage);
        assertEquals(result.error?.status, 400);

        // Logger assertions
        assertEquals(loggerInfoFnDefault.calls.length, 5, "Expected 5 info logs for this path.");
        assert(loggerInfoFnDefault.calls.length > 0 && loggerInfoFnDefault.calls[0].args && typeof loggerInfoFnDefault.calls[0].args[0] === 'string' && loggerInfoFnDefault.calls[0].args[0].startsWith("[startSession] Function started."), `Info Log 0 (function started) mismatch, not a string, or undefined. Actual: ${loggerInfoFnDefault.calls[0]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 1 && loggerInfoFnDefault.calls[1].args && typeof loggerInfoFnDefault.calls[1].args[0] === 'string' && loggerInfoFnDefault.calls[1].args[0] === `[startSession] Called with payload: ${JSON.stringify(payload)} for user ${mockUserEmptyModels.id}`, `Info Log 1 (payload) mismatch, not a string, or undefined. Actual: ${loggerInfoFnDefault.calls[1]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 2 && loggerInfoFnDefault.calls[2].args && loggerInfoFnDefault.calls[2].args.length > 0 && String(loggerInfoFnDefault.calls[2].args[0]).includes("No originatingChatId provided, generating a new one"), `Info Log 2 (new chat ID generated) mismatch/undefined. Actual: ${loggerInfoFnDefault.calls[2]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 3 && loggerInfoFnDefault.calls[3].args && loggerInfoFnDefault.calls[3].args.length > 0 && String(loggerInfoFnDefault.calls[3].args[0]).includes(`Project ${mockProjectId} details fetched`), `Info Log 3 (project details) mismatch/undefined. Actual: ${loggerInfoFnDefault.calls[3]?.args?.[0]}`);
        assert(loggerInfoFnDefault.calls.length > 4 && loggerInfoFnDefault.calls[4].args && typeof loggerInfoFnDefault.calls[4].args[0] === 'string' && loggerInfoFnDefault.calls[4].args[0].includes(`[startSession] No specific prompt ID or overlay ID provided. Fetching default prompt for stage: ${payload.stageAssociation}, context: ${mockProjectDomainTagDefault}`), `Info Log 4 (fetching default) mismatch, not a string, or undefined. Actual: ${loggerInfoFnDefault.calls[4]?.args?.[0]}`);

        assertEquals(loggerErrorFnForEmptyModelsTest.calls.length, 1, "Error log expected when no prompt can be found");
        const loggedErrorArgsEmptyModels = loggerErrorFnForEmptyModelsTest.calls[0].args;
        assertEquals(loggedErrorArgsEmptyModels[0], "[startSession] Error fetching default system prompt", "Generic log message prefix mismatch for empty models test");
        assertObjectMatch(loggedErrorArgsEmptyModels[1] as Record<string, unknown>, {
            projectId: mockProjectId,
            userId: mockUserEmptyModels.id,
            stage: payload.stageAssociation,
            contextAttempted: mockProjectDomainTagDefault,
            dbError: null
        });
        
        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.calls.length, 1);
        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy);
        assertEquals(systemPromptSelectSpy.calls.length, 1);
        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertEquals(sessionInsertSpy, undefined, "Session should not be inserted if prompt fetching fails");
    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Project exists but initial_user_prompt, selected_domain_tag, selected_domain_overlay_id, and default_system_prompt_id are all null", async () => {
    const mockUserAllNullProjectData: User = {
        id: "user-all-null-project-data-id",
        app_metadata: {}, // Added
        user_metadata: {}, // Added
        aud: "authenticated",
        role: "authenticated",
        email: "all.null.project@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockProjectId = "project-happy-default-prompt-id"; // Re-use a project ID that can be found
    const mockNewChatId = "newly-generated-chat-id-all-null";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        // No sessionDescription
        // No stageAssociation (will default to THESIS in main func, but let's be explicit for prompt search)
        stageAssociation: DialecticStage.SYNTHESIS, // For testing specific default prompt lookup
        selectedModelCatalogIds: ["model-g", "model-h"],
        // No promptTemplateId
    };

    const mockProjectAllNull: Partial<Database['public']['Tables']['dialectic_projects']['Row']> = {
        id: mockProjectId,
        user_id: mockUserAllNullProjectData.id,
        initial_user_prompt: undefined,
        selected_domain_tag: undefined, // Changed from null to undefined
        selected_domain_overlay_id: null,
        // default_system_prompt_id is not directly on project table
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-happy-default", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => { 
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserAllNullProjectData.id)) {
                        // Ensure data is an array for select mock, even if single, and correctly typed
                        return { data: [mockProjectAllNull as Database['public']['Tables']['dialectic_projects']['Row']], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    // Ensure mock error has 'name' property
                    return { data: null, error: { name: "PostgrestError", message: "Project not found as per mock (all null test)", code: "PGRST116", details:"", hint:"" }, count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    // Expecting a search for default: context 'general', stage 'SYNTHESIS'
                    if (state.filters.some(f => f.column === 'stage_association' && typeof f.value === 'string' && f.value.toUpperCase() === payload.stageAssociation!.toUpperCase()) &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === 'general') && 
                        state.filters.some(f => f.column === 'is_active' && f.value === true)
                    ) {
                        return { data: null, error: null, count: 0, status: 200, statusText: "OK" }; // Simulate no default prompt found
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for all null project data"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFn = spy();
    const loggerErrorFn = spy(); 
    const mockLoggerDefault = { info: loggerInfoFn, warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;

    const depsDefault: Partial<StartSessionDeps> = {
        logger: mockLoggerDefault,
        randomUUID: mockRandomUUIDFnDefault,
    };
    
    // Ensure assertRejects is removed and we check result.error
    const result = await startSession(mockUserAllNullProjectData, adminDbClient, payload, depsDefault);

    assertExists(result.error, "Expected an error when all project prompt data is null and no default found.");
    assertEquals(result.data, undefined, "Expected no data when an error occurs.");
    const expectedErrMessage = `No suitable default prompt found for stage '${payload.stageAssociation}' and context 'general'.`;
    assertEquals(result.error?.message, expectedErrMessage);
    assertEquals(result.error?.status, 400);

    // Logger assertions
    assertEquals(loggerInfoFn.calls.length, 5, "Expected 5 info logs for this path.");
    assert(loggerInfoFn.calls.length > 0 && loggerInfoFn.calls[0].args && typeof loggerInfoFn.calls[0].args[0] === 'string' && loggerInfoFn.calls[0].args[0].startsWith("[startSession] Function started."), `Info Log 0 (function started) mismatch, not a string, or undefined. Actual: ${loggerInfoFn.calls[0]?.args?.[0]}`);
    assert(loggerInfoFn.calls.length > 1 && loggerInfoFn.calls[1].args && typeof loggerInfoFn.calls[1].args[0] === 'string' && loggerInfoFn.calls[1].args[0] === `[startSession] Called with payload: ${JSON.stringify(payload)} for user ${mockUserAllNullProjectData.id}`, `Info Log 1 (payload) mismatch, not a string, or undefined. Actual: ${loggerInfoFn.calls[1]?.args?.[0]}`);
    assert(loggerInfoFn.calls.length > 2 && loggerInfoFn.calls[2].args && loggerInfoFn.calls[2].args.length > 0 && String(loggerInfoFn.calls[2].args[0]).includes("No originatingChatId provided, generating a new one"), `Info Log 2 (new chat ID generated) mismatch/undefined. Actual: ${loggerInfoFn.calls[2]?.args?.[0]}`);
    assert(loggerInfoFn.calls.length > 3 && loggerInfoFn.calls[3].args && loggerInfoFn.calls[3].args.length > 0 && String(loggerInfoFn.calls[3].args[0]).includes(`Project ${mockProjectId} details fetched`), `Info Log 3 (project details) mismatch/undefined. Actual: ${loggerInfoFn.calls[3]?.args?.[0]}`);
    assert(loggerInfoFn.calls.length > 4 && loggerInfoFn.calls[4].args && typeof loggerInfoFn.calls[4].args[0] === 'string' && loggerInfoFn.calls[4].args[0].includes(`[startSession] No specific prompt ID or overlay ID provided. Fetching default prompt for stage: ${payload.stageAssociation}, context: general`), `Info Log 4 (fetching default) mismatch, not a string, or undefined. Actual: ${loggerInfoFn.calls[4]?.args?.[0]}`);

    assertEquals(loggerErrorFn.calls.length, 1, "Error log expected when no prompt can be found"); 
    const loggedErrorArgsAllNull = loggerErrorFn.calls[0].args;
    assertEquals(loggedErrorArgsAllNull[0], "[startSession] Error fetching default system prompt", "Generic log message prefix mismatch for all null project data test");
    assertObjectMatch(loggedErrorArgsAllNull[1] as Record<string, unknown>, {
        projectId: mockProjectId,
        userId: mockUserAllNullProjectData.id,
        stage: payload.stageAssociation,
        contextAttempted: 'general',
        dbError: null
    });
    
    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertExists(projectSelectSpy);
    assertEquals(projectSelectSpy.calls.length, 1);
    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertExists(systemPromptSelectSpy);
    assertEquals(systemPromptSelectSpy.calls.length, 1);
    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertEquals(sessionInsertSpy, undefined, "Session should not be inserted if prompt fetching fails");
});