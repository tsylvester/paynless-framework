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

Deno.test("startSession - Error: Project not found", async () => {
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
            assertObjectMatch(firstErrorCall.args[1] as Record<string, unknown>, {
                projectId: payload.projectId,
                userId: mockUserId,
                error: { code: "PGRST116" }
            });
        }
    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Error: System prompt not found (with direct promptTemplateId)", async () => {
    const mockUser: User = {
        id: "user-sys-prompt-not-found-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUser.id;
    const mockProjectId = "project-sys-prompt-not-found-id";
    const mockNonExistentPromptId = "non-existent-prompt-id";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-xyz"],
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockNonExistentPromptId, // This prompt ID will not be found
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-sys-prompt-not-found", {
        genericMockResults: {
            dialectic_projects: { // Project is found
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{
                                id: mockProjectId,
                                user_id: mockUserId,
                                project_name: "Sys Prompt Test Project",
                                initial_user_prompt: "Test initial prompt",
                                selected_domain_tag: "general",
                                selected_domain_overlay_id: null
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { // System prompt is NOT found
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockNonExistentPromptId)) {
                        return { data: [], error: null, count: 0, status: 200, statusText: "OK" }; // Empty data
                    }
                    // Catch-all for other prompt IDs if needed for other tests, though not strictly necessary here
                    return { data: [{id: "other-prompt", prompt_text: "some other text"}], error: null, count: 1, status: 200, statusText: "OK"};
                }
            },
            dialectic_sessions: { // Should not be called
                insert: async () => {
                    return { data: null, error: new Error("Session insert should not be called when system prompt is not found"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerInfoFn = spy(); const loggerWarnFn = spy(); const loggerErrorFn = spy(); const loggerDebugFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn, } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger };

    try {
        const result = await startSession(mockUser, adminDbClient, payload, deps);

        assertExists(result.error, "Error should exist when system prompt is not found.");
        assertEquals(result.error?.status, 400, "Status should be 400 for not found system prompt.");
        assert(result.error?.message.includes(`System prompt with ID '${mockNonExistentPromptId}' not found or is inactive.`), "Error message mismatch.");
        
        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy, "Select spy for system_prompts should exist");
        assertEquals(systemPromptSelectSpy.calls.length, 1, "System prompt select should be called once");

        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertEquals(sessionInsertSpy, undefined, "Session insert should not have been called.");


        assert(loggerErrorFn.calls.length >= 1, "Expected at least one error log");
        const firstErrorCall = loggerErrorFn.calls.find(call => call.args[0].includes("[startSession] Error fetching system prompt by ID"));
        assertExists(firstErrorCall, "Specific error log for system prompt not found is missing.");
        if (firstErrorCall) {
            assertObjectMatch(firstErrorCall.args[1] as Record<string,unknown>, {
                projectId: mockProjectId,
                userId: mockUserId,
                stage: payload.stageAssociation,
                promptTemplateIdAttempted: mockNonExistentPromptId,
            });
        }

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Error: Domain overlay not found (from payload.selectedDomainOverlayId)", async () => {
    const mockUser: User = {
        id: "user-overlay-payload-not-found-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUser.id;
    const mockProjectId = "project-overlay-payload-not-found-id";
    const mockNonExistentOverlayId = "non-existent-overlay-id-from-payload";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        stageAssociation: DialecticStage.THESIS,
        selectedDomainOverlayId: mockNonExistentOverlayId, // This overlay ID will not be found
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-overlay-payload-not-found", {
        genericMockResults: {
            dialectic_projects: { // Project is found
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{
                                id: mockProjectId,
                                user_id: mockUserId,
                                project_name: "Overlay Payload NF Test Project",
                                initial_user_prompt: "Test initial prompt",
                                selected_domain_tag: "general",
                                selected_domain_overlay_id: "some-other-project-overlay-id" // Project might have one, but payload one is used
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            domain_specific_prompt_overlays: { // Domain overlay is NOT found
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockNonExistentOverlayId)) {
                        return { data: [], error: null, count: 0, status: 200, statusText: "OK" }; // Empty data
                    }
                     // Catch-all for other overlay IDs
                    return { data: [{id: "other-overlay", system_prompt_id: "any-prompt-id"}], error: null, count: 1, status: 200, statusText: "OK"};
                }
            },
            system_prompts: { // Should not be called if overlay fails to provide a system_prompt_id
                select: async () => {
                    return { data: null, error: new Error("System prompt select should not be called if domain overlay is not found"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: { // Should not be called
                insert: async () => {
                    return { data: null, error: new Error("Session insert should not be called when domain overlay is not found"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerInfoFn = spy(); const loggerWarnFn = spy(); const loggerErrorFn = spy(); const loggerDebugFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn, } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger };

    try {
        const result = await startSession(mockUser, adminDbClient, payload, deps);

        assertExists(result.error, "Error should exist when domain overlay (from payload) is not found.");
        assertEquals(result.error?.status, 400, "Status should be 400 for not found domain overlay.");
        assert(result.error?.message.includes(`Domain-specific prompt overlay with ID '${mockNonExistentOverlayId}' not found.`), "Error message mismatch.");

        const domainOverlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
        assertExists(domainOverlaySelectSpy, "Select spy for domain_specific_prompt_overlays should exist");
        assertEquals(domainOverlaySelectSpy.calls.length, 1, "Domain overlay select should be called once");

        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertEquals(systemPromptSelectSpy, undefined, "System prompt select should not have been called if overlay is missing.");

        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertEquals(sessionInsertSpy, undefined, "Session insert should not have been called.");

        assert(loggerErrorFn.calls.length >= 1, "Expected at least one error log");
        const firstErrorCall = loggerErrorFn.calls.find(call => call.args[0].includes("[startSession] Error fetching domain specific prompt overlay by ID"));
        assertExists(firstErrorCall, "Specific error log for domain overlay not found is missing.");
        if (firstErrorCall) {
            assertObjectMatch(firstErrorCall.args[1] as Record<string,unknown>, {
                projectId: mockProjectId,
                userId: mockUserId,
                stage: payload.stageAssociation,
                domainOverlayIdAttempted: mockNonExistentOverlayId,
            });
        }

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Error: Domain overlay not found (from project.selected_domain_overlay_id)", async () => {
    const mockUser: User = {
        id: "user-overlay-project-not-found-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUser.id;
    const mockProjectId = "project-overlay-project-not-found-id";
    const mockNonExistentOverlayIdFromProject = "non-existent-overlay-id-from-project";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-def"],
        stageAssociation: DialecticStage.THESIS,
        // No selectedDomainOverlayId or promptTemplateId in payload, so it should use project's
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-overlay-project-not-found", {
        genericMockResults: {
            dialectic_projects: { // Project is found, and it HAS a selected_domain_overlay_id
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{
                                id: mockProjectId,
                                user_id: mockUserId,
                                project_name: "Overlay Project NF Test Project",
                                initial_user_prompt: "Test initial prompt for project overlay NF",
                                selected_domain_tag: "general",
                                selected_domain_overlay_id: mockNonExistentOverlayIdFromProject // This ID will be used
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            domain_specific_prompt_overlays: { // Domain overlay is NOT found using project's ID
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockNonExistentOverlayIdFromProject)) {
                        return { data: [], error: null, count: 0, status: 200, statusText: "OK" }; // Empty data
                    }
                    return { data: [{id: "other-overlay", system_prompt_id: "any-prompt-id"}], error: null, count: 1, status: 200, statusText: "OK"};
                }
            },
            system_prompts: { // Should not be called
                select: async () => {
                    return { data: null, error: new Error("System prompt select should not be called if domain overlay (from project) is not found"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: { // Should not be called
                insert: async () => {
                    return { data: null, error: new Error("Session insert should not be called when domain overlay (from project) is not found"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerInfoFn = spy(); const loggerWarnFn = spy(); const loggerErrorFn = spy(); const loggerDebugFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn, } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger };

    try {
        const result = await startSession(mockUser, adminDbClient, payload, deps);

        assertExists(result.error, "Error should exist when domain overlay (from project) is not found.");
        assertEquals(result.error?.status, 400, "Status should be 400 for not found domain overlay.");
        assert(result.error?.message.includes(`Domain-specific prompt overlay with ID '${mockNonExistentOverlayIdFromProject}' (from project settings) not found.`), "Error message mismatch.");

        const domainOverlaySelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("domain_specific_prompt_overlays")?.select;
        assertExists(domainOverlaySelectSpy, "Select spy for domain_specific_prompt_overlays should exist");
        assertEquals(domainOverlaySelectSpy.calls.length, 1, "Domain overlay select should be called once with project's overlay ID");

        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertEquals(systemPromptSelectSpy, undefined, "System prompt select should not have been called.");

        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertEquals(sessionInsertSpy, undefined, "Session insert should not have been called.");
        
        assert(loggerErrorFn.calls.length >= 1, "Expected at least one error log");
        const firstErrorCall = loggerErrorFn.calls.find(call => call.args[0].includes("[startSession] Error fetching domain specific prompt overlay by ID (from project)"));
        assertExists(firstErrorCall, "Specific error log for domain overlay (from project) not found is missing.");
        if (firstErrorCall) {
            assertObjectMatch(firstErrorCall.args[1] as Record<string,unknown>, {
                projectId: mockProjectId,
                userId: mockUserId,
                stage: payload.stageAssociation,
                domainOverlayIdAttempted: mockNonExistentOverlayIdFromProject,
            });
        }

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Error: System prompt (from overlay) not found or inactive", async () => {
    const mockUserOverlaySysPromptNF: User = {
        id: "user-overlay-sys-prompt-nf-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserOverlaySysPromptNF.id;
    const mockProjectId = "project-overlay-sys-prompt-nf-id";
    const mockOverlayId = "overlay-id-for-missing-sys-prompt";
    const mockMissingSystemPromptIdFromOverlay = "sys-prompt-id-from-overlay-not-found";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-ghi"],
        stageAssociation: DialecticStage.THESIS,
        selectedDomainOverlayId: mockOverlayId, // Use overlay from payload to ensure this path
    };

    const mockProjectDataWithOverlay = {
        id: mockProjectId,
        user_id: mockUserId,
        project_name: "Overlay SysPrompt NF Test Project",
        initial_user_prompt: "Initial prompt",
        selected_domain_tag: "general",
        selected_domain_overlay_id: "some-other-overlay-id" // Project also has one, but payload takes precedence
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-overlay-sys-prompt-nf", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [mockProjectDataWithOverlay], error: null, count: 1, status: 200, statusText: "OK" })
            },
            domain_specific_prompt_overlays: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockOverlayId)) {
                        // This overlay correctly points to the system prompt ID that will be mocked as inactive/not found when active=true is queried
                        return { data: [{ id: mockOverlayId, system_prompt_id: mockMissingSystemPromptIdFromOverlay }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Overlay (for sys prompt NF) mock fallback error"), count: 0, status: 500, statusText: "Error" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    const idFilter = state.filters.find(f => f.column === 'id' && f.value === mockMissingSystemPromptIdFromOverlay);
                    const activeFilter = state.filters.find(f => f.column === 'is_active' && f.value === true);
                    
                    if (idFilter && activeFilter) {
                        // Simulate that the prompt exists but is_active=false, so the query for is_active=true finds nothing
                        return { data: null, error: { name: "PostgrestError", message: "Simulated PGRST116 System Prompt from Overlay Not Found because inactive", code: "PGRST116" } as any, count: 0, status: 406, statusText: "OK" };
                    } else if (idFilter) {
                        // If queried without is_active: true (not expected by main code path, but for completeness of mock)
                        return { data: [{ id: mockMissingSystemPromptIdFromOverlay, prompt_text: "Inactive prompt text", is_active: false /* Actual inactive state */ }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("System prompt (from overlay) mock fallback error"), count: 0, status: 500, statusText: "Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger };

    try {
        const result = await startSession(mockUserOverlaySysPromptNF, adminDbClient, payload, deps);

        assertExists(result.error, "Expected an error object when system prompt (via overlay) is not found.");
        assertEquals(result.data, undefined, "Expected no data.");
        const expectedErrorMessage = `System prompt with ID '${mockMissingSystemPromptIdFromOverlay}' (referenced by domain overlay '${mockOverlayId}') not found or is inactive.`;
        assertEquals(result.error?.message, expectedErrorMessage);
        assertEquals(result.error?.status, 400); // This assertion should now pass

        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy, "Select spy for system_prompts should exist");
        assertEquals(systemPromptSelectSpy.calls.length, 1, "System prompt select should be called once");

        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertEquals(sessionInsertSpy, undefined, "Session insert should not have been called.");

        assert(loggerErrorFn.calls.length >= 1, "Expected at least one error log");
        const firstErrorCall = loggerErrorFn.calls.find(call => call.args[0].includes("[startSession] Error fetching system prompt by ID (via overlay)"));
        assertExists(firstErrorCall, "Specific error log for system prompt (from overlay) not found is missing.");
        if (firstErrorCall) {
            assertObjectMatch(firstErrorCall.args[1] as Record<string,unknown>, {
                projectId: mockProjectId,
                userId: mockUserId,
                stage: payload.stageAssociation,
                domainOverlayIdUsed: mockOverlayId,
                systemPromptIdAttempted: mockMissingSystemPromptIdFromOverlay,
            });
        }

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Error: Database error during session insertion", async () => {
    const mockUser: User = {
        id: "user-db-insert-error-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUser.id;
    const mockProjectId = "project-db-insert-error-id";
    const mockSystemPromptId = "system-prompt-for-db-error-id";
    const mockSystemPromptText = "System prompt text for DB error test.";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-jkl"],
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockSystemPromptId, // Use direct prompt for simplicity
    };

    const mockDbError = { message: "Simulated database insert error", code: "DB500", details: "Connection lost" };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-db-insert-error", {
        genericMockResults: {
            dialectic_projects: { // Project is found
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{
                                id: mockProjectId,
                                user_id: mockUserId,
                                project_name: "DB Insert Error Test Project",
                                initial_user_prompt: "Initial prompt for DB error",
                                selected_domain_tag: "general",
                                selected_domain_overlay_id: null
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found mock"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { // System prompt IS found
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptId) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { 
                            data: [{ id: mockSystemPromptId, prompt_text: mockSystemPromptText, is_active: true }], 
                            error: null, count: 1, status: 200, statusText: "OK" 
                        };
                    }
                    return { data: null, error: new Error("System prompt not found mock"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: { // Session insertion fails
                insert: async () => {
                    return { data: null, error: mockDbError as any, count: 0, status: 500, statusText: "Internal Server Error" };
                }
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => "some-chat-id");
    const loggerInfoFn = spy(); const loggerWarnFn = spy(); const loggerErrorFn = spy(); const loggerDebugFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn, } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger, randomUUID: mockRandomUUIDFn };

    try {
        const result = await startSession(mockUser, adminDbClient, payload, deps);

        assertExists(result.error, "Error should exist when session insertion fails.");
        assertEquals(result.error?.status, 500, "Status should be 500 for DB insertion error.");
        assert(result.error?.message.includes("Failed to insert dialectic session into database."), "Error message mismatch.");

        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertExists(sessionInsertSpy, "Insert spy for dialectic_sessions should exist");
        assertEquals(sessionInsertSpy.calls.length, 1, "Session insert should be called once");
        
        assert(loggerErrorFn.calls.length >= 1, "Expected at least one error log");
        const firstErrorCall = loggerErrorFn.calls.find(call => call.args[0].includes("[startSession] Database error during session insertion"));
        assertExists(firstErrorCall, "Specific error log for DB session insertion failure is missing.");
        if (firstErrorCall) {
            assertObjectMatch(firstErrorCall.args[1] as Record<string,unknown>, {
                projectId: mockProjectId,
                userId: mockUserId,
                stage: payload.stageAssociation,
                dbError: mockDbError,
            });
        }

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Error: Invalid stageAssociation in payload", async () => {
    const mockUserInvalidStage: User = {
        id: "user-invalid-stage-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserInvalidStage.id;
    const mockProjectId = "project-invalid-stage-id";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-mno"],
        stageAssociation: "INVALID_STAGE" as any, // Deliberately invalid stage
    };
    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-invalid-stage", {});
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger };

    try {
        const result = await startSession(mockUserInvalidStage, adminDbClient, payload, deps);

        assertExists(result.error, "Expected an error object for invalid stageAssociation.");
        assertEquals(result.data, undefined, "Expected no data.");
        const expectedValidStages = Object.values(DialecticStage).join(", ");
        assertEquals(result.error?.message, `Invalid stageAssociation provided: INVALID_STAGE. Allowed stages are: ${expectedValidStages}.`);
        assertEquals(result.error?.status, 400);

        const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
        assertEquals(projectSelectSpy, undefined, "Project select should NOT have been called for invalid stage.");
        const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
        assertEquals(sessionInsertSpy, undefined, "Session insert should NOT have been called for invalid stage.");

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Error during session insertion", async () => {
    const mockUserSessionInsertError: User = {
        id: "user-session-insert-error-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUserSessionInsertError.id;
    const mockProjectId = "project-session-insert-fail";
    const mockSystemPromptId = "sys-prompt-id-session-fail";
    const mockNewChatId = "new-chat-id-for-session-fail";
    const dbErrorMessage = "Simulated DB insert error"; // Centralize the message

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockSystemPromptId,
        sessionDescription: "Test session insert fail",
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("admin-session-insert-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ /* ... project data ... */
                    data: [{
                        id: mockProjectId,
                        user_id: mockUserId,
                        project_name: "DB Session Insert Fail Project",
                        initial_user_prompt: "Prompt for session insert fail test",
                        selected_domain_tag: "general",
                        selected_domain_overlay_id: null
                    }], error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            system_prompts: {
                select: async () => ({ /* ... system prompt data ... */
                    data: [{ id: mockSystemPromptId, prompt_text: "System prompt text for session fail", is_active: true }], error: null, count: 1, status: 200, statusText: "OK"
                })
            },
            dialectic_sessions: {
                insert: async () => ({ // Mock the insert to fail
                    data: null,
                    error: { name: "DBError", message: dbErrorMessage, code: "XXYYZ", details: "DB constraint violation perhaps" } as any,
                    count: 0,
                    status: 500,
                    statusText: "Internal Server Error"
                })
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;

    const deps: Partial<StartSessionDeps> = {
        logger: mockLogger,
        randomUUID: mockRandomUUIDFn,
    };

    const result = await startSession(mockUserSessionInsertError, adminDbClient, payload, deps);

    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to insert dialectic session into database.");
    assertEquals(result.error?.status, 500);
    assertEquals(result.error?.details, dbErrorMessage);
    
    assertEquals(loggerErrorFn.calls.length, 1);
    const firstErrorCallArgs = loggerErrorFn.calls[0].args;
    assertEquals(firstErrorCallArgs[0], "[startSession] Database error during session insertion");
    assertObjectMatch(firstErrorCallArgs[1] as Record<string,unknown>, { 
        projectId: mockProjectId,
        dbError: {
            name: "DBError", 
            message: dbErrorMessage, 
            code: "XXYYZ", 
            details: "DB constraint violation perhaps" 
        }
    });

    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertExists(projectSelectSpy);
    assertEquals(projectSelectSpy.calls.length, 1);

    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertExists(systemPromptSelectSpy);
    assertEquals(systemPromptSelectSpy.calls.length, 1);
    
    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertExists(sessionInsertSpy);
    assertEquals(sessionInsertSpy.calls.length, 1);
});
