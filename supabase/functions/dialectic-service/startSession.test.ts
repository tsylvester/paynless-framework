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
    const mockUser: User = {
        id: "user-happy-path-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUser.id;
    const mockProjectId = "project-happy-path-id";
    const mockProjectName = "Happy Project Name"; // Defined for session description
    const mockDomainOverlayId = "overlay-happy-id";
    const mockSystemPromptId = "system-prompt-happy-id";
    const mockSystemPromptText = "This is the happy path system prompt from overlay.";
    const mockNewChatId = "newly-generated-chat-id-happy";
    const mockNewSessionId = "new-session-id-happy";
    const mockSelectedModelIds = ["model-catalog-id-1", "model-catalog-id-2"];
    const mockInitialUserPrompt = "Initial prompt for happy path";
    const mockProjectDomainTag = "general";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: "A happy path test session using domain overlay", // Original payload desc, not used for DB check
        stageAssociation: DialecticStage.THESIS,
    };

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
                                project_name: mockProjectName, // Use defined project name
                                initial_user_prompt: mockInitialUserPrompt, 
                                selected_domain_tag: mockProjectDomainTag,
                                selected_domain_overlay_id: mockDomainOverlayId
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock (happy path)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            domain_specific_prompt_overlays: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockDomainOverlayId)) {
                        return { data: [{ id: mockDomainOverlayId, system_prompt_id: mockSystemPromptId }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Domain overlay not found"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
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
                    const expectedFriendlySessionDescription = `${mockProjectName || 'Unnamed Project'} - ${payload.stageAssociation.toLowerCase()} (${mockProjectDomainTag || 'General'})`;
                    if (insertPayload &&
                        insertPayload.project_id === mockProjectId &&
                        insertPayload.associated_chat_id === mockNewChatId &&
                        insertPayload.session_description === expectedFriendlySessionDescription &&
                        insertPayload.stage === DialecticStage.THESIS.toUpperCase() &&
                        insertPayload.status === "pending_thesis" &&
                        Array.isArray(insertPayload.selected_model_catalog_ids) &&
                        JSON.stringify(insertPayload.selected_model_catalog_ids) === JSON.stringify(mockSelectedModelIds)
                    ) {
                        return { 
                            data: [{ 
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: expectedFriendlySessionDescription,
                                status: "pending_thesis",
                                associated_chat_id: mockNewChatId,
                                iteration_count: 1,
                                created_at: "2024-01-01T00:00:00.000Z",
                                updated_at: "2024-01-01T00:00:00.000Z",
                                selected_model_catalog_ids: mockSelectedModelIds,
                                stage: DialecticStage.THESIS.toUpperCase(),
                                user_input_reference_url: null,
                            }], 
                            error: null, count: 1, status: 201, statusText: "Created" 
                        };
                    }
                    return { data: null, error: new Error(`Session insert failed in mock (happy path condition mismatch). Expected desc: ${expectedFriendlySessionDescription}, got: ${insertPayload?.session_description}`), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const loggerInfoFn = spy(); const loggerWarnFn = spy(); const loggerErrorFn = spy(); const loggerDebugFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn, } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger, randomUUID: mockRandomUUIDFn, };

    try {
        const result = await startSession(mockUser, adminDbClient, payload, deps);
        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on happy path");
        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            id: mockNewSessionId,
            associated_chat_id: mockNewChatId,
            status: "pending_thesis",
            current_stage_seed_prompt: `Rendered System Prompt for ${payload.stageAssociation}:\n${mockSystemPromptText}\n\nInitial User Prompt (from project):\n${mockInitialUserPrompt}`,
            active_thesis_prompt_template_id: mockSystemPromptId
        };
        assertObjectMatch(result.data as any, expectedResponse as any);
        // ... other assertions ...
    } finally { mockAdminDbClientSetup.clearAllStubs?.(); }
});

Deno.test("startSession - Happy Path (using payload.promptTemplateId for prompt)", async () => {
    const mockUserDirect: User = { id: "user-happy-direct-prompt-id", /*...*/ app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() };
    const mockUserId = mockUserDirect.id;
    const mockProjectId = "project-happy-direct-prompt-id";
    const mockProjectNameDirect = "Happy Direct Project Name"; // Defined for session description
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
        promptTemplateId: mockDirectPromptId,
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-happy-direct", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{ 
                                id: mockProjectId, 
                                user_id: mockUserId, 
                                project_name: mockProjectNameDirect, // Use defined project name
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
            system_prompts: {
                select: async (state) => {
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
                    const expectedFriendlySessionDescription = `${mockProjectNameDirect || 'Unnamed Project'} - ${payload.stageAssociation.toLowerCase()} (${mockProjectDomainTagDirect || 'General'})`;
                    if (insertPayloadData &&
                        insertPayloadData.project_id === mockProjectId &&
                        insertPayloadData.associated_chat_id === mockNewChatId &&
                        insertPayloadData.session_description === expectedFriendlySessionDescription &&
                        insertPayloadData.stage === DialecticStage.ANTITHESIS.toUpperCase() &&
                        insertPayloadData.status === "pending_antithesis" &&
                        Array.isArray(insertPayloadData.selected_model_catalog_ids) &&
                        JSON.stringify(insertPayloadData.selected_model_catalog_ids) === JSON.stringify(mockSelectedModelIds)
                    ) {
                        return { 
                            data: [{ 
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: expectedFriendlySessionDescription,
                                status: "pending_antithesis",
                                associated_chat_id: mockNewChatId,
                                iteration_count: 1,
                                created_at: "2024-01-01T00:00:00.000Z",
                                updated_at: "2024-01-01T00:00:00.000Z",
                                selected_model_catalog_ids: mockSelectedModelIds,
                                stage: DialecticStage.ANTITHESIS.toUpperCase(),
                                user_input_reference_url: null,
                            }], 
                            error: null, count: 1, status: 201, statusText: "Created" 
                        };
                    }
                    return { data: null, error: new Error(`Session insert failed (happy path direct, condition mismatch). Expected desc: ${expectedFriendlySessionDescription}, got: ${insertPayloadData?.session_description}`), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDirect = spy(() => mockNewChatId);
    const loggerInfoFnDirect = spy(); const loggerWarnFnDirect = spy(); const loggerErrorFnDirect = spy(); const loggerDebugFnDirect = spy();
    const mockLoggerDirect = { info: loggerInfoFnDirect, warn: loggerWarnFnDirect, error: loggerErrorFnDirect, debug: loggerDebugFnDirect } as any as sharedLogger.Logger;
    const depsDirect: Partial<StartSessionDeps> = { logger: mockLoggerDirect, randomUUID: mockRandomUUIDFnDirect };

    try {
        const result = await startSession(mockUserDirect, adminDbClient, payload, depsDirect);
        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on happy path direct prompt");
        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            id: mockNewSessionId,
            associated_chat_id: mockNewChatId,
            status: `pending_${payload.stageAssociation.toLowerCase()}`,
            current_stage_seed_prompt: `Rendered System Prompt for ${payload.stageAssociation}:\n${mockDirectPromptText}\n\nInitial User Prompt (from project):\n${mockInitialUserPromptDirect}`,
            active_antithesis_prompt_template_id: mockDirectPromptId
        };
        assertObjectMatch(result.data as any, expectedResponse as any);
        // ... other assertions ...
    } finally { mockAdminDbClientSetup.clearAllStubs?.(); }
});

Deno.test("startSession - Happy Path (using project's default system prompt - no overlay, no payload ID)", async () => {
    const mockUserDefault: User = { id: "user-happy-default-prompt-id", /*...*/ app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() };
    const mockUserId = mockUserDefault.id;
    const mockProjectId = "project-happy-default-prompt-id";
    const mockProjectNameDefault = "Happy Default Project Name"; // Defined for session description
    const mockDefaultSystemPromptId = "default-system-prompt-happy-id";
    const mockDefaultSystemPromptText = "This is the happy path default system prompt.";
    const mockNewChatId = "newly-generated-chat-id-happy-default";
    const mockNewSessionId = "new-session-id-happy-default";
    const mockSelectedModelIds = ["model-catalog-id-5", "model-catalog-id-6"];
    const mockInitialUserPromptDefault = "Initial prompt for happy path default prompt";
    const mockProjectDomainTagDefault = "education";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
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
                                project_name: mockProjectNameDefault, // Use defined project name
                                initial_user_prompt: mockInitialUserPromptDefault, 
                                selected_domain_tag: mockProjectDomainTagDefault,
                                selected_domain_overlay_id: null 
                            }], 
                            error: null, count: 1, status: 200, statusText: "OK" 
                        };
                    }
                    return { data: null, error: new Error("Project not found mock (default prompt)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'stage_association' && f.value === payload.stageAssociation) &&
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomainTagDefault) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true) 
                        ) {
                        return { data: [{ id: mockDefaultSystemPromptId, prompt_text: mockDefaultSystemPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("Prompt query not mocked correctly for default fallback fail"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayloadData = state.insertData as Record<string, unknown> | undefined;
                    const expectedFriendlySessionDescription = `${mockProjectNameDefault || 'Unnamed Project'} - ${payload.stageAssociation.toLowerCase()} (${mockProjectDomainTagDefault || 'General'})`;
                    if (insertPayloadData && insertPayloadData.project_id === mockProjectId) { 
                        return { 
                            data: [{ 
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: expectedFriendlySessionDescription,
                                status: `pending_${payload.stageAssociation.toLowerCase()}`,
                                associated_chat_id: mockNewChatId,
                                iteration_count: 1,
                                created_at: "2024-01-01T00:00:00.000Z",
                                updated_at: "2024-01-01T00:00:00.000Z",
                                selected_model_catalog_ids: insertPayloadData.selected_model_catalog_ids as string[],
                                stage: payload.stageAssociation.toUpperCase() as Database["public"]["Enums"]["dialectic_stage_enum"],
                                user_input_reference_url: null,
                            }], 
                            error: null, count: 1, status: 201, statusText: "Created" 
                        };
                    }
                    return { data: null, error: new Error("Session insert failed mock (default prompt)"), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnDefault = spy(() => mockNewChatId);
    const loggerInfoFnDefault = spy(); const loggerWarnFnDefault = spy(); const loggerErrorFnDefault = spy(); const loggerDebugFnDefault = spy();
    const mockLoggerDefault = { info: loggerInfoFnDefault, warn: loggerWarnFnDefault, error: loggerErrorFnDefault, debug: loggerDebugFnDefault } as any as sharedLogger.Logger;
    const depsDefault: Partial<StartSessionDeps> = { logger: mockLoggerDefault, randomUUID: mockRandomUUIDFnDefault };

    try {
        const result = await startSession(mockUserDefault, adminDbClient, payload, depsDefault);
        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on happy path default prompt");
        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            id: mockNewSessionId,
            associated_chat_id: mockNewChatId,
            status: `pending_${payload.stageAssociation.toLowerCase()}`,
            current_stage_seed_prompt: `Rendered System Prompt for ${payload.stageAssociation}:\n${mockDefaultSystemPromptText}\n\nInitial User Prompt (from project):\n${mockInitialUserPromptDefault}`,
            active_synthesis_prompt_template_id: mockDefaultSystemPromptId 
        };
        assertObjectMatch(result.data as any, expectedResponse as any);
        // ... other assertions ...
    } finally { mockAdminDbClientSetup.clearAllStubs?.(); }
});

Deno.test("startSession - Happy Path (Minimal Payload - no description, stage, promptTemplateId)", async () => {
    const mockUserMinimal: User = { id: "user-happy-minimal-id", /*...*/ app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() };
    const mockUserId = mockUserMinimal.id;
    const mockProjectId = "project-happy-minimal-id";
    const mockProjectNameMinimal = "Happy Minimal Project Name";
    const mockGeneratedUUID = "minimal-payload-uuid";
    const mockNewSessionId = "new-session-no-orig-uuid";
    const mockInitialUserPrompt = "Initial prompt for no originating";
    const mockSelectedModelIds = ["model-abc", "model-def"];
    const mockProjectDomainTagMinimal = "general";
    const mockDefaultMinimalPromptId = "default-minimal-prompt-id";
    const mockDefaultMinimalPromptText = "Default system text for minimal payload";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        stageAssociation: DialecticStage.THESIS,
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-for-no-originating", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                     if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return { 
                            data: [{ 
                                id: mockProjectId, 
                                user_id: mockUserId, 
                                project_name: mockProjectNameMinimal,
                                initial_user_prompt: mockInitialUserPrompt, 
                                selected_domain_tag: mockProjectDomainTagMinimal, 
                                selected_domain_overlay_id: null 
                            }], 
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found in mock (minimal payload)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: {
                select: async (state) => {
                    if (
                        state.filters.some(f => f.column === 'is_active' && f.value === true) &&
                        state.filters.some(f => f.column === 'stage_association' && f.value === payload.stageAssociation) && // Direct comparison with DialecticStage enum value
                        state.filters.some(f => f.column === 'is_stage_default' && f.value === true) &&
                        state.filters.some(f => f.column === 'context' && f.value === mockProjectDomainTagMinimal)
                    ) {
                        return { 
                            data: [{ // Return as an array with one object for .maybeSingle()
                                id: mockDefaultMinimalPromptId, 
                                prompt_text: mockDefaultMinimalPromptText 
                            }], 
                            error: null, 
                            count: 1, 
                            status: 200, 
                            statusText: "OK" 
                        };
                    }
                    // Fallback for any other system_prompts select calls in this test, if not expected to match
                    return { data: null, error: new Error("System prompt not found by mock (conditions for default minimal not met)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: { 
                insert: async (state) => {
                    const insertPayloadData = state.insertData as Record<string, unknown> | undefined;
                    const expectedFriendlySessionDescription = `${mockProjectNameMinimal || 'Unnamed Project'} - ${payload.stageAssociation.toLowerCase()} (${mockProjectDomainTagMinimal || 'General'})`;
                     if (insertPayloadData && insertPayloadData.project_id === mockProjectId) { 
                        return { 
                            data: [{ 
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: expectedFriendlySessionDescription,
                                status: `pending_${payload.stageAssociation.toLowerCase()}`,
                                associated_chat_id: mockGeneratedUUID,
                                iteration_count: 1,
                                created_at: "2024-01-01T00:00:00.000Z",
                                updated_at: "2024-01-01T00:00:00.000Z",
                                selected_model_catalog_ids: insertPayloadData.selected_model_catalog_ids as string[],
                                stage: payload.stageAssociation.toUpperCase() as Database["public"]["Enums"]["dialectic_stage_enum"],
                                user_input_reference_url: null,
                            }], 
                            error: null, count: 1, status: 201, statusText: "Created" 
                        };
                    }
                     return { data: null, error: new Error(`Session insert failed mock (minimal payload). Expected desc: ${expectedFriendlySessionDescription}, got: ${insertPayloadData?.session_description}`), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFnMinimal = spy(() => mockGeneratedUUID);
    const loggerInfoFnMinimal = spy(); const loggerWarnFnMinimal = spy(); const loggerErrorFnMinimal = spy(); const loggerDebugFnMinimal = spy();
    const mockLoggerMinimal = { info: loggerInfoFnMinimal, warn: loggerWarnFnMinimal, error: loggerErrorFnMinimal, debug: loggerDebugFnMinimal } as any as sharedLogger.Logger;
    const depsMinimal: Partial<StartSessionDeps> = { logger: mockLoggerMinimal, randomUUID: mockRandomUUIDFnMinimal };

    try {
        const result = await startSession(mockUserMinimal, adminDbClient, payload, depsMinimal);
        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on minimal payload path");

        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            id: mockNewSessionId,
            project_id: mockProjectId,
            session_description: `${mockProjectNameMinimal || 'Unnamed Project'} - ${payload.stageAssociation.toLowerCase()} (${mockProjectDomainTagMinimal || 'General'})`,
            status: `pending_${payload.stageAssociation.toLowerCase()}`,
            associated_chat_id: mockGeneratedUUID,
            iteration_count: 1,
            current_stage_seed_prompt: `Rendered System Prompt for ${payload.stageAssociation}:\n${mockDefaultMinimalPromptText}\n\nInitial User Prompt (from project):\n${mockInitialUserPrompt}`,
            active_thesis_prompt_template_id: mockDefaultMinimalPromptId
        };
        assertObjectMatch(result.data as any, expectedResponse as any);
        // ... other assertions such as logger calls or spy calls can be added here ...
        assertEquals(mockRandomUUIDFnMinimal.calls.length, 1, "randomUUID should be called once for minimal payload if no originatingChatId.");
        const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
        assertExists(systemPromptSelectSpy, "System prompt select spy should exist for minimal payload.");
        assertEquals(systemPromptSelectSpy.calls.length, 1, "System prompt select should be called once for minimal payload default lookup.");

    } finally { 
        mockAdminDbClientSetup.clearAllStubs?.(); 
    }
});

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
    assert(result.error?.message?.includes(`Prompt fetching failed: Error fetching domain_specific_prompt_overlay: Simulated PGRST116 No Rows Found`), `Unexpected error message: ${result.error?.message}`);
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
    assert(firstErrorLogArgs[0].includes("[startSession] Prompt fetching error:"));
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
    const expectedErrorMessage = `Prompt fetching failed: Error fetching system prompt using ID from overlay (${mockMissingSystemPromptIdFromOverlay}): Query returned no rows`;
    assert(result.error?.message?.includes(expectedErrorMessage), `Error message mismatch. Expected to include: "${expectedErrorMessage}", Got: "${result.error?.message}"`);
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
    const expectedErrorMessage = `Prompt fetching failed: Error fetching prompt by direct ID ${mockMissingPromptId}: Query returned no rows`;
    assert(result.error?.message?.includes(expectedErrorMessage), `Error message mismatch. Expected to include: "${expectedErrorMessage}", Got: "${result.error?.message}"`);
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
    const expectedErrMessage = `Prompt fetching failed: No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'`;
    assert(result.error?.message?.includes(expectedErrMessage), `Error message mismatch. Expected: "${expectedErrMessage}", Got: "${result.error?.message}"`);
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

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-abc"],
        sessionDescription: "Test session insert fail",
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockSystemPromptId,
    };

    const dbError = { name: "DBError", message: 'Simulated DB insert error', code: 'XXYYZ', details: "DB constraint violation perhaps" };
    const mockAdminDbClientSetup = createMockSupabaseClient("admin-session-insert-fail", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [{ id: mockProjectId, user_id: mockUserId, initial_user_prompt: "Prompt", selected_domain_tag: "general", selected_domain_overlay_id: null }], error: null, count: 1, status: 200, statusText: "OK" })
            },
            system_prompts: { 
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptId)) {
                        return { data: [{ id: mockSystemPromptId, prompt_text: "System prompt text" }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("System prompt query error for session insert fail test"), count: 0, status: 500, statusText: "Error" };
                }
            },
            dialectic_sessions: {
                insert: async () => ({ data: null, error: dbError as any, count: 0, status: 500, statusText: "Internal Server Error" })
            }
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const loggerErrorFn = spy();
    const mockLogger = { info: spy(), warn: spy(), error: loggerErrorFn, debug: spy() } as any as sharedLogger.Logger;
    const mockRandomUUIDFn = spy(() => "new-chat-id-for-session-fail");

    const deps: Partial<StartSessionDeps> = {
        logger: mockLogger,
        randomUUID: mockRandomUUIDFn,
    };

    const result = await startSession(mockUserSessionInsertError, adminDbClient, payload, deps);

    assertExists(result.error, "Expected an error object when session insertion fails.");
    assertEquals(result.data, undefined, "Expected no data when session insertion fails.");
    assertEquals(result.error?.message, "Failed to create session.");
    assertEquals(result.error?.details, dbError.message);
    assertEquals(result.error?.status, 500);
    
    assertEquals(loggerErrorFn.calls.length, 1);
    const firstErrorCallArgs = loggerErrorFn.calls[0].args;
    assert(firstErrorCallArgs[0].includes("[startSession] Error inserting dialectic session:"));
    assertObjectMatch(firstErrorCallArgs[1] as Record<string,unknown>, { projectId: mockProjectId, error: dbError });

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
        assert(result.error?.message?.includes(`Prompt fetching failed: No suitable default prompt found for stage '${payload.stageAssociation}' and context 'general'`), `Error message: ${result.error?.message}`);
        
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
        const expectedErrMessage = `Prompt fetching failed: No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'`;
        assert(
            result.error?.message?.includes(expectedErrMessage),
            `Error message mismatch. Expected to include: "${expectedErrMessage}", Got: "${result.error?.message}"`
        );
        assertEquals(result.error?.status, 400);

        // Logger assertions
        assertEquals(loggerInfoFnDefault.calls.length, 5, "Expected 5 info logs for this path.");
        assert(loggerInfoFnDefault.calls[0].args[0].startsWith("startSession called with payload:"), "Info Log 1: startSession with payload");
        assert(loggerInfoFnDefault.calls[1].args[0].includes(`User ${mockUserId} authenticated`), "Info Log 2: user authenticated");
        assert(loggerInfoFnDefault.calls[2].args[0].includes("No originatingChatId provided, generating a new one"), "Info Log 3: new chat ID generated");
        assert(loggerInfoFnDefault.calls[3].args[0].includes(`Project ${mockProjectId} details fetched`), "Info Log 4: project details fetched");
        assert(loggerInfoFnDefault.calls[4].args[0].includes(`[startSession] No promptTemplateId or project.selected_domain_overlay_id. Fetching default prompt for stage: ${payload.stageAssociation}, context: ${mockProjectDomainTagDefault}`), "Info Log 5: fetching default prompt");

        assertEquals(loggerErrorFnForNoOverlayTest.calls.length, 1, "Error log expected when no prompt can be found"); 
        assert(loggerErrorFnForNoOverlayTest.calls[0].args[1].error.includes(`No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'`), "Logger error message mismatch");
        
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
    const expectedErrMessage = `Prompt fetching failed: No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'`;
    assert(result.error?.message?.includes(expectedErrMessage), `Error message mismatch. Expected: "${expectedErrMessage}", Got: "${result.error?.message}"`);
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
        const expectedErrMessage = `Prompt fetching failed: No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'`;
        assert(
            result.error?.message?.includes(expectedErrMessage),
            `Error message mismatch. Expected to include: "${expectedErrMessage}", Got: "${result.error?.message}"`
        );
        assertEquals(result.error?.status, 400);

        // Logger assertions
        assertEquals(loggerInfoFnDefault.calls.length, 5, "Expected 5 info logs for this path.");
        assert(loggerInfoFnDefault.calls[0].args[0].startsWith("startSession called with payload:"), "Info Log 1: startSession with payload");
        assert(loggerInfoFnDefault.calls[1].args[0].includes(`User ${mockUserId} authenticated`), "Info Log 2: user authenticated");
        assert(loggerInfoFnDefault.calls[2].args[0].includes("No originatingChatId provided, generating a new one"), "Info Log 3: new chat ID generated");
        assert(loggerInfoFnDefault.calls[3].args[0].includes(`Project ${mockProjectId} details fetched`), "Info Log 4: project details fetched");
        assert(loggerInfoFnDefault.calls[4].args[0].includes(`[startSession] No promptTemplateId or project.selected_domain_overlay_id. Fetching default prompt for stage: ${payload.stageAssociation}, context: ${mockProjectDomainTagDefault}`), "Info Log 5: fetching default prompt for empty models test");

        assertEquals(loggerErrorFnForEmptyModelsTest.calls.length, 1, "Error log expected when no prompt can be found");
        assert(loggerErrorFnForEmptyModelsTest.calls[0].args[1].error.includes(`No suitable default prompt found for stage '${payload.stageAssociation}' and context '${mockProjectDomainTagDefault}'`), "Logger error message mismatch for empty models test");
        
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
    const expectedErrMessage = `Prompt fetching failed: No suitable default prompt found for stage '${payload.stageAssociation}' and context 'general'`;
    assert(result.error?.message?.includes(expectedErrMessage), `Error message mismatch. Expected to include: "${expectedErrMessage}", Got: "${result.error?.message}"`);
    assertEquals(result.error?.status, 400);

    assertEquals(loggerInfoFn.calls.length, 5, "Expected 5 info logs for this path.");
    assert(loggerInfoFn.calls[0].args[0].startsWith("startSession called with payload:"), "Info Log 1: startSession with payload");
    assert(loggerInfoFn.calls[1].args[0].includes(`User ${mockUserAllNullProjectData.id} authenticated`), "Info Log 2: user authenticated");
    assert(loggerInfoFn.calls[2].args[0].includes("No originatingChatId provided, generating a new one"), "Info Log 3: new chat ID generated");
    assert(loggerInfoFn.calls[3].args[0].includes(`Project ${mockProjectId} details fetched`), "Info Log 4: project details fetched");
    assert(loggerInfoFn.calls[4].args[0].includes(`[startSession] No promptTemplateId or project.selected_domain_overlay_id. Fetching default prompt for stage: ${payload.stageAssociation}, context: general`), "Info Log 5: fetching default prompt with 'general' context");

    assertEquals(loggerErrorFn.calls.length, 1, "Error log expected when no prompt can be found"); 
    assert(loggerErrorFn.calls[0].args[1].error.includes(`No suitable default prompt found for stage '${payload.stageAssociation}' and context 'general'`), "Logger error message mismatch");
    
    const projectSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_projects")?.select;
    assertExists(projectSelectSpy);
    assertEquals(projectSelectSpy.calls.length, 1);
    const systemPromptSelectSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("system_prompts")?.select;
    assertExists(systemPromptSelectSpy);
    assertEquals(systemPromptSelectSpy.calls.length, 1);
    const sessionInsertSpy = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies("dialectic_sessions")?.insert;
    assertEquals(sessionInsertSpy, undefined, "Session should not be inserted if prompt fetching fails");
});


