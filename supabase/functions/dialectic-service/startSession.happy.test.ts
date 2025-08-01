// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload, StartSessionSuccessResponse, DialecticProjectResource } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { createMockPromptAssembler } from "../_shared/prompt-assembler.mock.ts";
import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";

Deno.test("startSession - Happy Path (with explicit sessionDescription)", async () => {
    const mockUser: User = {
        id: "user-happy-path-id",
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
    };
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
        selectedModelIds: ["model-1"],
        sessionDescription: mockExplicitSessionDescription
    };

    // --- Start of Mocking Setup ---
    const mockAssembler = createMockPromptAssembler();
    
    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: 'file-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'seed_prompt.md',
        storage_bucket: 'dialectic-internal',
        storage_path: 'projects/project-happy-path-id/sessions/session-happy-path-id/iterations/1/hypothesis-stage/seed_prompt.md',
        mime_type: 'text/markdown',
        size_bytes: 123,
        user_id: mockUser.id,
        project_id: mockProjectId,
        session_id: mockNewSessionId,
        resource_description: 'Seed prompt',
    }, null);

    // --- End of Mocking Setup ---


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
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: mockProcessTemplateId, name: 'Happy Template', starting_stage_id: mockInitialStageId }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: {
                select: async () => ({
                    data: [{ id: mockInitialStageId, slug: mockInitialStageSlug, display_name: mockInitialStageName, default_system_prompt_id: mockSystemPromptId }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            system_prompts: {
                select: async () => ({
                    data: [{id: mockSystemPromptId, prompt_text: mockSystemPromptText}],
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
                        current_stage_id: mockInitialStageId, selected_model_ids: payload.selectedModelIds,
                    }], error: null, status: 201, statusText: 'ok'
                })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ 
                        id: 'model-1', 
                        provider_max_input_tokens: 8000, 
                        config: {
                            tokenization_strategy: {
                                type: 'tiktoken',
                                tiktoken_encoding_name: 'cl100k_base'
                            }
                        } 
                    }],
                    error: null, status: 200, statusText: 'ok'
                })
            }
        },
        mockUser: mockUser,
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockLogger = { info: spy(), warn: spy(), error: spy(), debug: spy() };

    const deps: Partial<StartSessionDeps> = {
        logger: mockLogger,
        fileManager: mockFileManager,
        promptAssembler: mockAssembler,
        randomUUID: () => mockNewChatId
    };

    const result = await startSession(mockUser, adminDbClient, payload, deps); 

    assertExists(result.data, `Session start failed: ${result.error?.message}`);
    assertEquals(result.error, undefined, "Error should be undefined on happy path");

    const expectedResponse: Partial<StartSessionSuccessResponse> = {
        id: mockNewSessionId,
        project_id: mockProjectId,
        session_description: mockExplicitSessionDescription,
        current_stage_id: mockInitialStageId,
    };
    assertObjectMatch(result.data, expectedResponse);
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "The file manager should have been called once.");

    // Assert that assembler.assemble was called correctly
    assertEquals(mockAssembler.assemble.calls.length, 1, "assembler.assemble should have been called once.");
    const assembleArgs = mockAssembler.assemble.calls[0].args;
    assertEquals(assembleArgs.length, 7, "assembler.assemble should be called with 7 arguments.");
    assertEquals(assembleArgs[3], "Let's be happy.", "The fourth argument to assemble should be the correct initial user prompt.");
    assertEquals(assembleArgs[4], 1, "Fifth argument (iterationNumber) should be 1 for startSession.");
});


Deno.test("startSession - Happy Path (without explicit sessionDescription, defaults are used)", async () => {
    const mockUser: User = {
        id: "user-default-desc-id",
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
    };
    const mockProjectId = "project-default-desc-id";
    const mockProjectName = "Default Description Project";
    const mockProcessTemplateId = "proc-template-default-desc";
    const mockInitialStageId = "stage-initial-default-desc";
    const mockInitialStageName = "Hypothesis";
    const mockInitialStageSlug = "hypothesis-slug";
    const mockSystemPromptId = "system-prompt-default-desc";
    const mockNewSessionId = "session-default-desc-id";
    const mockNewChatId = "chat-default-desc-id";
    const expectedDefaultDescription = `Session for ${mockProjectName} - ${mockInitialStageName}`;

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelIds: ["model-1"],
    };

    const mockAssembler = createMockPromptAssembler();

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: 'file-id-default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'seed_prompt.md',
        storage_bucket: 'dialectic-internal',
        storage_path: 'projects/project-default-desc-id/sessions/session-default-desc-id/iterations/1/hypothesis-slug/seed_prompt.md',
        mime_type: 'text/markdown',
        size_bytes: 123,
        user_id: mockUser.id,
        project_id: mockProjectId,
        session_id: mockNewSessionId,
        resource_description: 'Seed prompt',
    }, null);

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
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: mockProcessTemplateId, name: 'Default Template', starting_stage_id: mockInitialStageId }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: {
                select: async () => ({
                    data: [{ id: mockInitialStageId, slug: mockInitialStageSlug, display_name: mockInitialStageName, default_system_prompt_id: mockSystemPromptId }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            system_prompts: {
                select: async () => ({
                    data: [{id: mockSystemPromptId, prompt_text: "Default prompt text."}],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            domain_specific_prompt_overlays: {
                select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' })
            },
            dialectic_sessions: {
                insert: async () => ({
                    data: [{
                        id: mockNewSessionId, 
                        project_id: mockProjectId, 
                        session_description: expectedDefaultDescription,
                        status: `pending_${mockInitialStageName}`, 
                        iteration_count: 1, 
                        associated_chat_id: mockNewChatId,
                        current_stage_id: mockInitialStageId, 
                        selected_model_ids: payload.selectedModelIds,
                    }], error: null, status: 201, statusText: 'ok'
                })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ 
                        id: 'model-1', 
                        provider_max_input_tokens: 8000, 
                        config: {
                            tokenization_strategy: {
                                type: 'tiktoken',
                                tiktoken_encoding_name: 'cl100k_base'
                            }
                        } 
                    }],
                    error: null, status: 200, statusText: 'ok'
                })
            }
        },
        mockUser: mockUser,
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockLogger = { info: spy(), warn: spy(), error: spy(), debug: spy() };

    const deps: Partial<StartSessionDeps> = {
        logger: mockLogger,
        fileManager: mockFileManager,
        promptAssembler: mockAssembler,
        randomUUID: () => mockNewChatId
    };
    
    const result = await startSession(mockUser, adminDbClient, payload, deps);

    assertExists(result.data, `Session start failed: ${result.error?.message}`);
    assertEquals(result.error, undefined, "Error should be undefined on happy path");

    const expectedResponse: Partial<StartSessionSuccessResponse> = {
        id: mockNewSessionId,
        project_id: mockProjectId,
        session_description: expectedDefaultDescription,
        current_stage_id: mockInitialStageId,
    };
    assertObjectMatch(result.data, expectedResponse);
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "The file manager should have been called once for the default case.");

    // Assert that assembler.assemble was called correctly for the default case
    assertEquals(mockAssembler.assemble.calls.length, 1, "assembler.assemble should have been called once for default case.");
    const assembleArgsDefault = mockAssembler.assemble.calls[0].args;
    assertEquals(assembleArgsDefault.length, 7, "assembler.assemble should be called with 7 arguments for default case.");
    assertEquals(assembleArgsDefault[3], "Default prompt", "The fourth argument should be the correct default prompt string.");
    assertEquals(assembleArgsDefault[4], 1, "Fifth argument (iterationNumber) should be 1 for startSession default case.");
});

Deno.test("startSession - Happy Path (with initial prompt from file resource)", async () => {
    const mockUser: User = {
        id: "user-file-prompt-id",
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
    };
    const mockProjectId = "project-file-prompt-id";
    const mockResourceId = "resource-file-prompt-id";
    const mockInitialStageId = "stage-initial-file-prompt";
    const mockInitialStageName = "Analysis Stage";
    const mockInitialStageSlug = "analysis-stage";
    const mockSystemPromptId = "system-prompt-file-prompt";
    const mockNewSessionId = "session-file-prompt-id";
    const mockFileContent = "This is the initial prompt content from a file.";
    const encoder = new TextEncoder();
    const mockFileContentBuffer = encoder.encode(mockFileContent);
    
    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelIds: ["model-file"],
        sessionDescription: "Session from a file prompt"
    };

    const mockAssembler = createMockPromptAssembler();
    
    const mockInitialPromptResource: DialecticProjectResource = {
        id: mockResourceId,
        project_id: mockProjectId,
        user_id: mockUser.id,
        file_name: 'initial_prompt.txt',
        storage_bucket: 'dialectic-content',
        storage_path: `projects/${mockProjectId}/initial_user_prompt`,
        mime_type: 'text/plain',
        size_bytes: mockFileContent.length,
        resource_description: "Initial prompt from file",
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: 'file-id-resource',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'seed_prompt.md',
        storage_bucket: 'dialectic-internal',
        storage_path: `projects/${mockProjectId}/sessions/${mockNewSessionId}/iterations/1/${mockInitialStageSlug}/seed_prompt.md`,
        mime_type: 'text/markdown',
        size_bytes: 123,
        user_id: mockUser.id,
        project_id: mockProjectId,
        session_id: mockNewSessionId,
        resource_description: 'Seed prompt',
    }, null);
    
    const mockAdminDbClientSetup = createMockSupabaseClient(mockUser.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{
                        id: mockProjectId,
                        user_id: mockUser.id,
                        project_name: "File Prompt Project",
                        initial_user_prompt: null, // Explicitly null for this test case
                        initial_prompt_resource_id: mockResourceId,
                        process_template_id: "proc-template-file",
                        dialectic_domains: { name: 'Technical' },
                        selected_domain_id: 'd-2'
                    }], error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_project_resources: {
                select: async () => ({
                    data: [mockInitialPromptResource],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-file", name: 'File Template', starting_stage_id: mockInitialStageId }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: {
                select: async () => ({
                    data: [{ id: mockInitialStageId, slug: mockInitialStageSlug, display_name: mockInitialStageName, default_system_prompt_id: mockSystemPromptId }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            system_prompts: {
                select: async () => ({
                    data: [{id: mockSystemPromptId, prompt_text: "System prompt for file case."}],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            domain_specific_prompt_overlays: {
                select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' })
            },
            dialectic_sessions: {
                insert: async () => ({
                    data: [{ id: mockNewSessionId, project_id: mockProjectId, session_description: payload.sessionDescription }],
                    error: null, status: 201, statusText: 'ok'
                })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ 
                        id: 'model-file', 
                        provider_max_input_tokens: 8000, 
                        config: {
                            tokenization_strategy: {
                                type: 'tiktoken',
                                tiktoken_encoding_name: 'cl100k_base'
                            }
                        } 
                    }],
                    error: null, status: 200, statusText: 'ok'
                })
            }
        },
        storageMock: {
            downloadResult: async (bucketId, path) => {
                const expectedPath = `${mockInitialPromptResource.storage_path}/${mockInitialPromptResource.file_name}`;
                if (bucketId === mockInitialPromptResource.storage_bucket && path === expectedPath) {
                    return { data: new Blob([mockFileContentBuffer]), error: null };
                }
                return { data: null, error: new Error(`Mock download error: Path not found - ${path}`) };
            }
        },
        mockUser: mockUser,
    });

    const adminDbClient = mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>;
    const mockLogger = { info: spy(), warn: spy(), error: spy(), debug: spy() };

    const deps: Partial<StartSessionDeps> = {
        logger: mockLogger,
        fileManager: mockFileManager,
        promptAssembler: mockAssembler,
        randomUUID: () => mockNewSessionId
    };

    const result = await startSession(mockUser, adminDbClient, payload, deps);

    assertExists(result.data, `Session start with file prompt failed: ${result.error?.message}`);
    assertEquals(result.error, undefined, "Error should be undefined on file prompt happy path");

    assertEquals(mockAssembler.assemble.calls.length, 1, "assembler.assemble should have been called once.");
    const assembleArgs = mockAssembler.assemble.calls[0].args;
    
    // Check that the prompt content from the file was passed to the assembler
    assertEquals(assembleArgs[3], mockFileContent, "The fourth argument to assemble should be the content of the initial prompt file.");
    assertEquals(assembleArgs[4], 1, "The fifth argument (iterationNumber) should be 1.");
    assertEquals(assembleArgs.length, 7, "assembler.assemble should be called with 7 arguments for file case.");
});
