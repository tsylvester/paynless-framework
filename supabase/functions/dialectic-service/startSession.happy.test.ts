// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload, StartSessionSuccessResponse, DialecticProjectResource } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient, getMockUser } from "../_shared/supabase.mock.ts";
import * as promptAssembler from "../_shared/prompt-assembler.ts";
import * as resourceUploader from "./uploadProjectResourceFile.ts";

Deno.test("startSession - Happy Path (with explicit sessionDescription)", async () => {
    const mockUser = getMockUser("user-happy-path-id");
    const mockProjectId = "project-happy-path-id";
    const mockProcessTemplateId = "proc-template-happy-path";
    const mockInitialStageId = "stage-initial-happy-path";
    const mockInitialStageName = "Hypothesis Stage";
    const mockInitialStageSlug = "hypothesis-stage";
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

    const assemblerStub = stub(promptAssembler.PromptAssembler.prototype, "assemble", () => {
        return Promise.resolve("Assembled prompt content");
    });

    const mockResource: DialecticProjectResource = {
        id: "res-123",
        project_id: mockProjectId,
        user_id: mockUser.id,
        file_name: 'seed_prompt.md',
        storage_bucket: 'prompt-seeds',
        storage_path: 'some/path',
        mime_type: 'text/markdown',
        size_bytes: 123,
        resource_description: "Initial prompt for the session",
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    let wasUploaderCalled = false;
    const mockUploadAndRegisterResource = () => {
        wasUploaderCalled = true;
        return Promise.resolve({ data: mockResource, error: undefined });
    };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUser.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{
                        id: mockProjectId,
                        user_id: mockUser.id,
                        project_name: "Happy Project",
                        initial_user_prompt: "Let's be happy.",
                        process_template_id: mockProcessTemplateId,
                        dialectic_domains: { name: 'General' },
                        selected_domain_id: 'd-1'
                    }], error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stage_transitions: {
                select: async () => ({
                    data: [{
                        dialectic_stages: {
                            id: mockInitialStageId,
                            display_name: mockInitialStageName,
                            system_prompts: [{ id: mockSystemPromptId, prompt_text: mockSystemPromptText }]
                        }
                    }], error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: {
                select: async () => ({
                    data: [{ id: mockInitialStageId, slug: mockInitialStageSlug, display_name: mockInitialStageName }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            domain_specific_prompt_overlays: {
                select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' })
            },
            dialectic_sessions: {
                insert: async () => ({
                    data: [{
                        id: mockNewSessionId, project_id: mockProjectId, session_description: mockExplicitSessionDescription,
                        status: `pending_${mockInitialStageName}`, iteration_count: 1, associated_chat_id: mockNewChatId,
                        current_stage_id: mockInitialStageId, selected_model_catalog_ids: payload.selectedModelCatalogIds,
                    }], error: null, status: 201, statusText: 'ok'
                })
            },
        },
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const mockLogger = { info: spy(), warn: spy(), error: spy(), debug: spy() } as any;

    try {
        const result = await startSession(mockUser, adminDbClient, payload, { 
            logger: mockLogger, 
            randomUUID: mockRandomUUIDFn,
            uploadAndRegisterResource: mockUploadAndRegisterResource as any
        });

        assertExists(result.data, `Session start failed: ${result.error?.message}`);
        assertEquals(result.error, undefined, "Error should be undefined on happy path");

        const expectedResponse: Partial<StartSessionSuccessResponse> = {
            id: mockNewSessionId,
            project_id: mockProjectId,
            session_description: mockExplicitSessionDescription,
            current_stage_id: mockInitialStageId,
        };
        assertObjectMatch(result.data, expectedResponse as any);
        assertEquals(wasUploaderCalled, true, "The mock uploader should have been called.");

    } finally {
        assemblerStub.restore();
    }
});


Deno.test("startSession - Happy Path (without explicit sessionDescription, defaults are used)", async () => {
    const mockUser = getMockUser("user-default-desc-id");
    const mockProjectId = "project-default-desc-id";
    const mockProjectName = "Default Description Project";
    const mockProcessTemplateId = "proc-template-default-desc";
    const mockInitialStageId = "stage-initial-default-desc";
    const mockInitialStageName = "Hypothesis";
    const mockInitialStageSlug = "hypothesis-slug";
    const mockSystemPromptId = "system-prompt-default-desc";
    const mockNewSessionId = "session-default-desc-id";
    const mockNewChatId = "chat-default-desc-id";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelCatalogIds: ["model-1"],
    };

    const assemblerStub = stub(promptAssembler.PromptAssembler.prototype, "assemble", () => {
        return Promise.resolve("Assembled prompt content");
    });

    const mockResource: DialecticProjectResource = {
        id: "res-123",
        project_id: mockProjectId,
        user_id: mockUser.id,
        file_name: 'seed_prompt.md',
        storage_bucket: 'prompt-seeds',
        storage_path: 'some/path',
        mime_type: 'text/markdown',
        size_bytes: 123,
        resource_description: "Initial prompt for the session",
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    let wasUploaderCalled = false;
    const mockUploadAndRegisterResource = () => {
        wasUploaderCalled = true;
        return Promise.resolve({ data: mockResource, error: undefined });
    };

    const mockAdminDbClientSetup = createMockSupabaseClient(mockUser.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{
                        id: mockProjectId, user_id: mockUser.id, project_name: mockProjectName,
                        initial_user_prompt: "Default prompt", process_template_id: mockProcessTemplateId,
                        dialectic_domains: { name: 'General' }, selected_domain_id: 'd-1'
                    }], error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stage_transitions: {
                select: async () => ({
                    data: [{
                        dialectic_stages: {
                            id: mockInitialStageId, display_name: mockInitialStageName,
                            system_prompts: [{ id: mockSystemPromptId, prompt_text: "Default prompt text." }]
                        }
                    }], error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: {
                select: async () => ({
                    data: [{ id: mockInitialStageId, slug: mockInitialStageSlug, display_name: mockInitialStageName }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            domain_specific_prompt_overlays: {
                select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' })
            },
            dialectic_sessions: {
                insert: async () => ({
                     data: [{
                        id: mockNewSessionId, project_id: mockProjectId,
                        session_description: `${mockProjectName} - New Session`,
                        status: `pending_${mockInitialStageName}`, iteration_count: 1, associated_chat_id: mockNewChatId,
                        current_stage_id: mockInitialStageId, selected_model_catalog_ids: payload.selectedModelCatalogIds
                    }], error: null, status: 201, statusText: 'ok'
                })
            },
        },
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockRandomUUIDFn = spy(() => mockNewChatId);
    const mockLogger = { info: spy(), warn: spy(), error: spy(), debug: spy() } as any;
    
    try {
        const result = await startSession(mockUser, adminDbClient, payload, { 
            logger: mockLogger, 
            randomUUID: mockRandomUUIDFn,
            uploadAndRegisterResource: mockUploadAndRegisterResource as any
        });

        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertEquals(result.data.session_description, `${mockProjectName} - New Session`);
        assertEquals(wasUploaderCalled, true, "The mock uploader should have been called.");
    } finally {
        assemblerStub.restore();
    }
});

