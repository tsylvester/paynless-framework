// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import * as sharedLogger from "../_shared/logger.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import * as promptAssembler from "../_shared/prompt-assembler.ts";
import { FileManagerService } from '../_shared/services/file_manager.ts';

const MOCK_USER: User = {
    id: "user-id",
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};
const MOCK_FILE_MANAGER = {
    uploadAndRegisterFile: () => Promise.resolve({ record: null, error: null }),
} as unknown as FileManagerService;
stub(MOCK_FILE_MANAGER, "uploadAndRegisterFile");

Deno.test("startSession - Error: Project not found", async () => {
    const payload: StartSessionPayload = { projectId: "non-existent-project-id", selectedModelIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: null, error: { message: "Not found", code: "PGRST116" } as any, status: 404, statusText: 'not found' })
            }
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any, fileManager: MOCK_FILE_MANAGER });
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
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any, fileManager: MOCK_FILE_MANAGER });
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
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any, fileManager: MOCK_FILE_MANAGER });
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
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', display_name: "Hypothesis", slug: 'hypothesis', system_prompts: [{ id: "p-1", prompt_text: "t" }] }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' }) },
            dialectic_sessions: {
                insert: async () => ({ data: null, error: { name: 'PostgrestError', message: "Simulated DB error"} as any }),
                delete: async () => ({ data: null, error: null, status: 204, statusText: 'no content' })
            }
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any, fileManager: MOCK_FILE_MANAGER });
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
                insert: async () => ({ data: null, error: { name: 'PostgrestError', message: "Simulated DB error"} as any }),
                delete: async () => ({ data: null, error: null, status: 204, statusText: 'no content' })
            }
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to create new session.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Fails to upload user prompt and cleans up session", async () => {
    const mockProjectId = "project-upload-fail";
    const mockNewSessionId = "session-to-be-deleted";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelIds: ["model-abc"] };
    
    const assembleSpy = spy(() => Promise.resolve("Assembled prompt content for error case"));
    const assemblerStub = stub(promptAssembler.PromptAssembler.prototype, "assemble", assembleSpy);

    const mockFileManager = {
        uploadAndRegisterFile: () => Promise.resolve({ record: null, error: null }),
    } as unknown as FileManagerService;

    const fmStub = stub(mockFileManager, "uploadAndRegisterFile", returnsNext([
        // First call (user_prompt) fails
        Promise.resolve({ 
            record: null,
            error: { name: 'UploadError', message: "Upload failed for user prompt", status: 500, details: "test details" } 
        }),
        // Subsequent calls (system_settings, seed_prompt) would also be mocked if reached, but the first failure stops it.
        Promise.resolve({ record: {id: 'res-settings'} as any, error: null }), 
        Promise.resolve({ record: {id: 'res-seed'} as any, error: null })   
    ]));

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
            dialectic_sessions: {
                insert: async () => ({ data: [{ id: mockNewSessionId, project_id: mockProjectId, current_stage_id: 'stage-1', iteration_count: 1, selected_model_ids: ['model-abc'] }], error: null, status: 201, statusText: 'created' }),
                delete: spiedSessionDeleteFn // Use the spied function here
            }
        },
        mockUser: MOCK_USER,
        // No storageConfig needed here as FileManagerService is fully stubbed for this test path
    });
    
    const mockLogger = { info: spy(), error: spy(), warn: spy() } as any;

    try {
        const result = await startSession(
            MOCK_USER, 
            mockAdminDbClientSetup.client as any, 
            payload, 
            { 
                logger: mockLogger,
                fileManager: mockFileManager,
                randomUUID: () => mockNewSessionId // Ensure consistent session ID for predictability
            }
        );
        
        assertExists(result.error);
        assertEquals(result.error?.message, "Upload failed for user prompt");
        assertEquals(result.error?.status, 500);

        assertEquals(spiedSessionDeleteFn.calls.length, 1, "Session delete should have been called once for cleanup.");
        assertEquals(fmStub.calls.length, 1, "The file manager's uploadAndRegisterFile should have been called once (for the failing user_prompt).");

        // Assert that assembler.assemble was called correctly even in this error path leading to cleanup
        assertEquals(assembleSpy.calls.length, 1, "assembler.assemble should have been called once in error case.");
        const assembleArgs = assembleSpy.calls[0].args as any[]; // Cast to any[]
        assertEquals(assembleArgs.length, 5, "assembler.assemble should be called with 5 arguments in error case.");
        // args[0] is projectContext
        // args[1] is sessionContextForAssembler
        // args[2] is stageContext
        assert(typeof assembleArgs[3] === 'string', "Forth argument (projectInitialUserPrompt) should be a string in error case."); 
        assertEquals(assembleArgs[4], 1, "Fifth argument (iterationNumber) should be 1 for startSession in error case.");

    } finally {
        assemblerStub.restore();
        fmStub.restore(); // Restore the fileManager stub as well
    }
});
