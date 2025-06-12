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


Deno.test("startSession - Happy Path (with explicit sessionDescription in payload)", async () => {
    const mockUser: User = {
        id: "user-explicit-desc-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUser.id;
    const mockProjectId = "project-explicit-desc-id";
    const mockExplicitSessionDescription = "This is an explicit session description from the payload.";
    const mockSelectedModelIds = ["model-catalog-id-expl-1"];
    const mockProjectName = "Explicit Desc Project"; // For default if explicit wasn't used
    const mockInitialUserPrompt = "Initial prompt for explicit desc test";
    const mockProjectDomainTag = "testing";
    const mockNewChatId = "new-chat-id-explicit-desc";
    const mockNewSessionId = "new-session-id-explicit-desc";
    const mockSystemPromptId = "system-prompt-explicit-desc-id";
    const mockSystemPromptText = "System prompt for explicit desc.";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        sessionDescription: mockExplicitSessionDescription, // Explicitly provided
        stageAssociation: DialecticStage.THESIS,
        promptTemplateId: mockSystemPromptId, // Use direct prompt for simplicity here
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-explicit-desc", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{
                                id: mockProjectId,
                                user_id: mockUserId,
                                project_name: mockProjectName,
                                initial_user_prompt: mockInitialUserPrompt,
                                selected_domain_tag: mockProjectDomainTag,
                                selected_domain_overlay_id: null // No project-level overlay
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (explicit desc)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { // Assuming direct promptTemplateId usage
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptId) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        return { data: [{ id: mockSystemPromptId, prompt_text: mockSystemPromptText }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("System prompt not found (explicit desc)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    // Key assertion: session_description must match the one from payload
                    if (insertPayload &&
                        insertPayload.project_id === mockProjectId &&
                        insertPayload.session_description === mockExplicitSessionDescription && // Check this
                        insertPayload.stage === DialecticStage.THESIS.toUpperCase() &&
                        insertPayload.status === "pending_thesis"
                    ) {
                        return {
                            data: [{
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: mockExplicitSessionDescription,
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
                    return { data: null, error: new Error(`Session insert failed (explicit desc, condition mismatch). Got desc: ${insertPayload?.session_description}`), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const loggerInfoFn = spy(); const loggerWarnFn = spy(); const loggerErrorFn = spy(); const loggerDebugFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn, } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger, randomUUID: mockRandomUUIDFn };

    try {
        const result = await startSession(mockUser, adminDbClient, payload, deps);
        assertExists(result.data, `Session start failed (explicit desc): ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on explicit desc happy path");
        assertEquals(result.data.session_description, mockExplicitSessionDescription, "Session description in response does not match explicit payload description.");
        // Other relevant assertions can be added if needed
    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

Deno.test("startSession - Happy Path (payload.selectedDomainOverlayId takes precedence)", async () => {
    const mockUser: User = {
        id: "user-payload-overlay-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockUserId = mockUser.id;
    const mockProjectId = "project-payload-overlay-id";
    const mockProjectName = "Payload Overlay Project";
    const mockInitialUserPrompt = "Initial prompt for payload overlay test";
    const mockProjectDomainTag = "iot";
    
    // Project has its own overlay, but payload will provide a different one
    const mockProjectOverlayId = "project-specific-overlay-id"; 
    const mockPayloadOverlayId = "payload-provided-overlay-id"; // This one should be used

    const mockSystemPromptIdFromPayloadOverlay = "system-prompt-from-payload-overlay";
    const mockSystemPromptTextFromPayloadOverlay = "This prompt comes from the PAYLOAD's overlay.";
    
    const mockNewChatId = "new-chat-id-payload-overlay";
    const mockNewSessionId = "new-session-id-payload-overlay";
    const mockSelectedModelIds = ["model-catalog-id-plov-1"];

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: mockSelectedModelIds,
        stageAssociation: DialecticStage.SYNTHESIS,
        selectedDomainOverlayId: mockPayloadOverlayId, // Explicitly providing overlay ID in payload
    };

    let domainOverlaySelectCalledWithCorrectId = false;
    let systemPromptSelectCalledWithCorrectId = false;

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-payload-overlay", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUserId)) {
                        return {
                            data: [{
                                id: mockProjectId,
                                user_id: mockUserId,
                                project_name: mockProjectName,
                                initial_user_prompt: mockInitialUserPrompt,
                                selected_domain_tag: mockProjectDomainTag,
                                selected_domain_overlay_id: mockProjectOverlayId // Project has a different overlay ID
                            }],
                            error: null, count: 1, status: 200, statusText: "OK"
                        };
                    }
                    return { data: null, error: new Error("Project not found (payload overlay)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            domain_specific_prompt_overlays: { // This should be queried with mockPayloadOverlayId
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockPayloadOverlayId)) {
                        domainOverlaySelectCalledWithCorrectId = true;
                        return { data: [{ id: mockPayloadOverlayId, system_prompt_id: mockSystemPromptIdFromPayloadOverlay }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectOverlayId)) {
                         return { data: null, error: new Error("domain_specific_prompt_overlays was called with project's overlay ID, not payload's"), count: 0, status: 400, statusText: "Bad Request" };
                    }
                    return { data: null, error: new Error(`Domain overlay not found. Queried with: ${state.filters.find(f=>f.column === 'id')?.value}`), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            system_prompts: { // This should be queried with mockSystemPromptIdFromPayloadOverlay
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSystemPromptIdFromPayloadOverlay) &&
                        state.filters.some(f => f.column === 'is_active' && f.value === true)) {
                        systemPromptSelectCalledWithCorrectId = true;
                        return { data: [{ id: mockSystemPromptIdFromPayloadOverlay, prompt_text: mockSystemPromptTextFromPayloadOverlay }], error: null, count: 1, status: 200, statusText: "OK" };
                    }
                    return { data: null, error: new Error("System prompt not found (payload overlay)"), count: 0, status: 404, statusText: "Not Found" };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown> | undefined;
                    const expectedFriendlySessionDescription = `${mockProjectName} - ${payload.stageAssociation.toLowerCase()} (${mockProjectDomainTag})`;
                    if (insertPayload &&
                        insertPayload.project_id === mockProjectId &&
                        insertPayload.session_description === expectedFriendlySessionDescription && // Check this
                        insertPayload.stage === DialecticStage.SYNTHESIS.toUpperCase() &&
                        insertPayload.status === "pending_synthesis"
                    ) {
                        return {
                            data: [{
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: expectedFriendlySessionDescription, // Use this
                                status: "pending_synthesis",
                                associated_chat_id: mockNewChatId,
                                iteration_count: 1,
                                created_at: "2024-01-01T00:00:00.000Z",
                                updated_at: "2024-01-01T00:00:00.000Z",
                                selected_model_catalog_ids: mockSelectedModelIds,
                                stage: DialecticStage.SYNTHESIS.toUpperCase(),
                                user_input_reference_url: null,
                                active_synthesis_prompt_template_id: mockSystemPromptIdFromPayloadOverlay, 
                            }],
                            error: null, count: 1, status: 201, statusText: "Created"
                        };
                    }
                    return { data: null, error: new Error(`Session insert failed (payload overlay, condition mismatch). Expected desc: ${expectedFriendlySessionDescription}, got: ${insertPayload?.session_description}`), count: 0, status: 500, statusText: "Error" };
                },
            },
        }
    });
    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const loggerInfoFn = spy(); const loggerWarnFn = spy(); const loggerErrorFn = spy(); const loggerDebugFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: loggerWarnFn, error: loggerErrorFn, debug: loggerDebugFn, } as any as sharedLogger.Logger;
    const deps: Partial<StartSessionDeps> = { logger: mockLogger, randomUUID: mockRandomUUIDFn };

    try {
        const result = await startSession(mockUser, adminDbClient, payload, deps);
        assertExists(result.data, `Session start failed (payload overlay): ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on payload overlay happy path");
        assert(domainOverlaySelectCalledWithCorrectId, "domain_specific_prompt_overlays.select was not called with the overlay ID from the payload.");
        assert(systemPromptSelectCalledWithCorrectId, "system_prompts.select was not called with the system_prompt_id derived from the payload's overlay.");
        
        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            id: mockNewSessionId,
            associated_chat_id: mockNewChatId,
            status: "pending_synthesis",
            current_stage_seed_prompt: `Rendered System Prompt for ${payload.stageAssociation}:\n${mockSystemPromptTextFromPayloadOverlay}\n\nInitial User Prompt (from project):\n${mockInitialUserPrompt}`,
            active_synthesis_prompt_template_id: mockSystemPromptIdFromPayloadOverlay
        };
        assertObjectMatch(result.data as any, expectedResponse as any);

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
    }
});

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
                    if (insertPayload &&
                        insertPayload.project_id === mockProjectId &&
                        insertPayload.associated_chat_id === mockNewChatId &&
                        insertPayload.session_description === payload.sessionDescription &&
                        insertPayload.stage === DialecticStage.THESIS.toUpperCase() &&
                        insertPayload.status === "pending_thesis" &&
                        Array.isArray(insertPayload.selected_model_catalog_ids) &&
                        JSON.stringify(insertPayload.selected_model_catalog_ids) === JSON.stringify(mockSelectedModelIds)
                    ) {
                        return { 
                            data: [{ 
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: payload.sessionDescription,
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
                    return { data: null, error: new Error(`Session insert failed in mock (happy path condition mismatch). Expected desc: ${payload.sessionDescription}, got: ${insertPayload?.session_description}`), count: 0, status: 500, statusText: "Error" };
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
                    // const expectedFriendlySessionDescription = `${mockProjectNameDirect || 'Unnamed Project'} - ${payload.stageAssociation.toLowerCase()} (${mockProjectDomainTagDirect || 'General'})`;
                    if (insertPayloadData &&
                        insertPayloadData.project_id === mockProjectId &&
                        insertPayloadData.associated_chat_id === mockNewChatId &&
                        insertPayloadData.session_description === payload.sessionDescription && // Check against payload's description
                        insertPayloadData.stage === DialecticStage.ANTITHESIS.toUpperCase() &&
                        insertPayloadData.status === "pending_antithesis" &&
                        Array.isArray(insertPayloadData.selected_model_catalog_ids) &&
                        JSON.stringify(insertPayloadData.selected_model_catalog_ids) === JSON.stringify(mockSelectedModelIds)
                    ) {
                        return { 
                            data: [{ 
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: payload.sessionDescription, // Use payload's description in mock response
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
                    return { data: null, error: new Error(`Session insert failed (happy path direct, condition mismatch). Expected desc: ${payload.sessionDescription}, got: ${insertPayloadData?.session_description}`), count: 0, status: 500, statusText: "Error" };
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

