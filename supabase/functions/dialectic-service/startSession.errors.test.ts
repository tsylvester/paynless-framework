// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { createMockPromptAssembler } from "../_shared/prompt-assembler.mock.ts";
import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";

const MOCK_FILE_MANAGER = new MockFileManagerService();

const MOCK_USER: User = {
    id: "user-id",
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

Deno.test("startSession - Error: Project not found", async () => {
    const payload: StartSessionPayload = { projectId: "non-existent-project-id", selectedModelIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: null, error: { message: "Not found", code: "PGRST116", name: "Not found" }, status: 404, statusText: 'not found' })
            }
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payload, { logger: { info: spy(), error: spy(), debug: spy(), warn: spy() }, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.message, "Project not found or access denied.");
    assertEquals(result.error?.status, 404);
});

Deno.test("startSession - Error: Project is missing a process_template_id", async () => {
    const mockProjectId = "project-no-template-id";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: null, project_name: 'test', initial_user_prompt: 'test' }],
                    error: null,
                    status: 200,
                    statusText: 'ok'
                })
            }
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payload, { logger: { info: spy(), error: spy(), debug: spy(), warn: spy() }, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.message, "Project is not configured with a process template.");
    assertEquals(result.error?.status, 400);
});

Deno.test("startSession - Error: Process template is missing a starting_stage_id", async () => {
    const mockProjectId = "project-no-entry-point";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-no-entry", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' } }],
                    error: null,
                    status: 200,
                    statusText: 'ok'
                })
            },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-no-entry", name: "Test Template", starting_stage_id: null }],
                    error: null,
                    status: 200,
                    statusText: 'ok'
                })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ 
                        id: 'model-abc', 
                        api_identifier: 'openai-gpt-4o', 
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
            },
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payload, { logger: { info: spy(), error: spy(), debug: spy(), warn: spy() }, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.message, "Process template does not have a starting stage defined.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Initial stage has no associated system prompt", async () => {
    const mockProjectId = "project-no-prompt";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' } }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: 'stage-1' }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', display_name: "Hypothesis", slug: 'hypothesis', default_system_prompt_id: null }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' }) },
            dialectic_sessions: {
                insert: async () => ({ data: null, error: { name: 'PostgrestError', message: "Simulated DB error"} }),
                delete: async () => ({ data: null, error: null, status: 204, statusText: 'no content' })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ 
                        id: 'model-abc', 
                        api_identifier: 'openai-gpt-4o', 
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
        mockUser: MOCK_USER,
    });
    const mockLogger = new MockLogger();
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payload, { logger: mockLogger, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.message, "Configuration error: Initial stage 'Hypothesis' is missing a default prompt.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Database error on session insertion", async () => {
    const mockProjectId = "project-insert-fail";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' } }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: 'stage-1' }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', display_name: "Hypothesis", slug: 'hypothesis', default_system_prompt_id: 'p-1', system_prompts: [{ id: "p-1", prompt_text: "t" }] }], error: null, status: 200, statusText: 'ok' }) },
            system_prompts: { select: async () => ({ data: [{id: 'p-1', prompt_text: 'test prompt'}], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' }) },
            dialectic_sessions: {
                insert: async () => ({ data: null, error: { name: 'PostgrestError', message: "Simulated DB error"} }),
                delete: async () => ({ data: null, error: null, status: 204, statusText: 'no content' })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ 
                        id: 'model-abc', 
                        api_identifier: 'openai-gpt-4o', 
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
        mockUser: MOCK_USER,
    });
    const mockLogger = new MockLogger();
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payload, { logger: mockLogger, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to create new session.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Fails to upload user prompt and cleans up session", async () => {
    const mockProjectId = "project-upload-fail";
    const mockNewSessionId = "session-to-be-deleted";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelIds: ["model-abc"] };
    
    const mockAssembler = createMockPromptAssembler();
    const spiedSessionDeleteFn = spy(async () => ({ data: null, error: null, status: 204, statusText: 'no content' }));

    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' }, selected_domain_id: 'd-1', process_template_id: "proc-template-ok" }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: 'stage-1' }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', slug: 'hypothesis', display_name: "Hypothesis Stage", default_system_prompt_id: 'p-1', system_prompts: [{ id: "p-1", prompt_text: "t" }] }], error: null, status: 200, statusText: 'ok' }) },
            system_prompts: { select: async () => ({ data: [{ id: 'p-1', prompt_text: 'test prompt' }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' }) },
            ai_providers: {
                select: async () => ({
                    data: [{ 
                        id: 'model-abc', 
                        api_identifier: 'openai-gpt-4o', 
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
            },
            dialectic_sessions: {
                insert: async () => ({ data: [{ id: mockNewSessionId, project_id: mockProjectId, current_stage_id: 'stage-1', iteration_count: 1, selected_model_ids: ['model-abc'] }], error: null, status: 201, statusText: 'created' }),
                delete: spiedSessionDeleteFn // Use the spied function here
            }
        },
        mockUser: MOCK_USER,
    });
    
    const mockLogger = new MockLogger();
    MOCK_FILE_MANAGER.setUploadAndRegisterFileResponse(null, { message: 'Upload failed for seed prompt' });

    const result = await startSession(
        MOCK_USER, 
        mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, 
        payload, 
        { 
            logger: mockLogger,
            fileManager: MOCK_FILE_MANAGER,
            promptAssembler: mockAssembler,
            randomUUID: () => mockNewSessionId // Ensure consistent session ID for predictability
        }
    );
    
    assertExists(result.error);
    assertEquals(result.error?.message, "Upload failed for seed prompt");
    assertEquals(result.error?.status, 500);

    assertEquals(spiedSessionDeleteFn.calls.length, 1, "Session delete should have been called once for cleanup.");
    assertEquals(MOCK_FILE_MANAGER.uploadAndRegisterFile.calls.length, 1, "The file manager's uploadAndRegisterFile should have been called once (for the failing seed_prompt).");

    // Assert that assembler.assemble was called correctly even in this error path leading to cleanup
    assertEquals(mockAssembler.assemble.calls.length, 1, "assembler.assemble should have been called once in error case.");
    const assembleArgs = mockAssembler.assemble.calls[0].args;
    assertEquals(assembleArgs.length, 5, "assembler.assemble should be called with 5 arguments in error case.");
    assert(typeof assembleArgs[3] === 'string', "Forth argument (projectInitialUserPrompt) should be a string in error case."); 
    assertEquals(assembleArgs[4], 1, "Fifth argument (iterationNumber) should be 1 for startSession in error case.");
});