// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload, StartSessionSuccessResponse } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import * as sharedLogger from "../_shared/logger.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";


Deno.test("startSession - Happy Path (with explicit sessionDescription)", async () => {
    const mockUser: User = {
        id: "user-happy-path-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockProjectId = "project-happy-path-id";
    const mockProcessTemplateId = "proc-template-happy-path";
    const mockInitialStageId = "stage-initial-happy-path";
    const mockInitialStageName = "hypothesis";
    const mockSystemPromptId = "system-prompt-happy-path";
    const mockSystemPromptText = "This is the initial system prompt for the happy path.";
    const mockNewSessionId = "session-happy-path-id";
    const mockNewChatId = "chat-happy-path-id";
    const mockExplicitSessionDescription = "A happy little session description.";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-1"],
        sessionDescription: mockExplicitSessionDescription
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-happy-path", {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId) &&
                        state.filters.some(f => f.column === 'user_id' && f.value === mockUser.id)) {
                        return {
                            data: [{
                                id: mockProjectId,
                                user_id: mockUser.id,
                                project_name: "Happy Project",
                                initial_user_prompt: "Let's be happy.",
                                process_template_id: mockProcessTemplateId,
                            }],
                            error: null,
                        };
                    }
                    return { data: null, error: new Error("Project not found") };
                }
            },
            dialectic_stage_transitions: {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'process_template_id' && f.value === mockProcessTemplateId) &&
                        state.filters.some(f => f.column === 'is_entry_point' && f.value === true)) {
                        return {
                            data: [{
                                dialectic_stages: {
                                    id: mockInitialStageId,
                                    stage_name: mockInitialStageName,
                                    system_prompts: [{ id: mockSystemPromptId, prompt_text: mockSystemPromptText }]
                                }
                            }],
                            error: null,
                        };
                    }
                    return { data: null, error: new Error("Initial stage not found") };
                }
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown>;
                    if (insertPayload.project_id === mockProjectId && insertPayload.current_stage_id === mockInitialStageId) {
                        return {
                            data: [{
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: mockExplicitSessionDescription,
                                status: `pending_${mockInitialStageName}`,
                                iteration_count: 1,
                                associated_chat_id: mockNewChatId,
                                current_stage_id: mockInitialStageId,
                                selected_model_catalog_ids: payload.selectedModelCatalogIds,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                                user_input_reference_url: null
                            }],
                            error: null,
                        };
                    }
                    return { data: null, error: new Error("Session insert failed") };
                }
            },
        },
        storageMock: {
             uploadResult: async () => ({ data: { path: 'mock/path' }, error: null }),
        }
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const loggerInfoFn = spy(); const loggerErrorFn = spy();
    const mockLogger = { info: loggerInfoFn, warn: spy(), error: loggerErrorFn, debug: spy() } as any;
    
    const envGetStub = stub(Deno.env, "get", returnsNext(["dialectic-contributions"]));

    try {
        const result = await startSession(mockUser, adminDbClient, payload, { logger: mockLogger, randomUUID: mockRandomUUIDFn });
        
        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on happy path");

        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            id: mockNewSessionId,
            project_id: mockProjectId,
            session_description: mockExplicitSessionDescription,
            status: `pending_${mockInitialStageName}`,
            current_stage_id: mockInitialStageId,
        };
        assertObjectMatch(result.data, expectedResponse as any);

        // Cannot effectively spy on imported uploadToStorage without more complex mocking.
        // We are trusting that if the function returns success, the upload was at least attempted.
        // The mock ensures it doesn't fail.
        const infoCalls = loggerInfoFn.calls;
        assert(infoCalls.some(c => (c.args[0] as string).includes("Successfully uploaded seed prompt")), "Expected log message for successful upload was not found.");

    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
        envGetStub.restore();
    }
});


Deno.test("startSession - Happy Path (without explicit sessionDescription, defaults are used)", async () => {
    const mockUser: User = {
        id: "user-default-desc-id",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
    };
    const mockProjectId = "project-default-desc-id";
    const mockProjectName = "Default Description Project";
    const mockProcessTemplateId = "proc-template-default-desc";
    const mockInitialStageId = "stage-initial-default-desc";
    const mockInitialStageName = "hypothesis";
    const mockSystemPromptId = "system-prompt-default-desc";
    const mockNewSessionId = "session-default-desc-id";
    const mockNewChatId = "chat-default-desc-id";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-1"],
    };

    const mockAdminDbClientSetup = createMockSupabaseClient("db-admin-default-desc", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{
                        id: mockProjectId,
                        user_id: mockUser.id,
                        project_name: mockProjectName,
                        initial_user_prompt: "Default prompt",
                        process_template_id: mockProcessTemplateId,
                    }],
                    error: null,
                })
            },
            dialectic_stage_transitions: {
                select: async () => ({
                    data: [{
                        dialectic_stages: {
                            id: mockInitialStageId,
                            stage_name: mockInitialStageName,
                            system_prompts: [{ id: mockSystemPromptId, prompt_text: "Default prompt text." }]
                        }
                    }],
                    error: null,
                })
            },
            dialectic_sessions: {
                insert: async (state) => {
                    const insertPayload = state.insertData as Record<string, unknown>;
                    const expectedDefaultDescription = `${mockProjectName} - New Session`;
                    if (insertPayload.session_description === expectedDefaultDescription) {
                        return {
                            data: [{
                                id: mockNewSessionId,
                                project_id: mockProjectId,
                                session_description: expectedDefaultDescription,
                                status: `pending_${mockInitialStageName}`,
                                iteration_count: 1,
                                associated_chat_id: mockNewChatId,
                                current_stage_id: mockInitialStageId,
                                selected_model_catalog_ids: payload.selectedModelCatalogIds
                            }],
                            error: null,
                        };
                    }
                    return { data: null, error: new Error("Session insert failed, description mismatch") };
                }
            },
        },
        storageMock: {
            uploadResult: async () => ({ data: { path: "some/path" }, error: null })
        }
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const mockLogger = { info: spy(), warn: spy(), error: spy(), debug: spy() } as any;
    const envGetStub = stub(Deno.env, "get", returnsNext(["dialectic-contributions"]));

    try {
        const result = await startSession(mockUser, adminDbClient, payload, { logger: mockLogger, randomUUID: mockRandomUUIDFn });
        
        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertEquals(result.data.session_description, `${mockProjectName} - New Session`);
    } finally {
        mockAdminDbClientSetup.clearAllStubs?.();
        envGetStub.restore();
    }
});

