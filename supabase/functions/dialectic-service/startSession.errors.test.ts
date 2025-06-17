// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import * as sharedLogger from "../_shared/logger.ts";
import { createMockSupabaseClient, getMockUser } from "../_shared/supabase.mock.ts";
import * as promptAssembler from "../_shared/prompt-assembler.ts";
import * as resourceUploader from "./uploadProjectResourceFile.ts";

const MOCK_USER = getMockUser("user-id");

Deno.test("startSession - Error: Project not found", async () => {
    const payload: StartSessionPayload = { projectId: "non-existent-project-id", selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: null, error: { message: "Not found", code: "PGRST116" } as any, status: 404, statusText: 'not found' })
            }
        }
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Project not found or access denied.");
    assertEquals(result.error?.status, 404);
});

Deno.test("startSession - Error: Project is missing a process_template_id", async () => {
    const mockProjectId = "project-no-template-id";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
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
        }
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Project is not configured with a process template.");
    assertEquals(result.error?.status, 400);
});

Deno.test("startSession - Error: No entry point stage found for the process template", async () => {
    const mockProjectId = "project-no-entry-point";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
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
            dialectic_stage_transitions: {
                select: async () => ({ data: null, error: { message: "Not found" } as any, status: 500, statusText: 'error' })
            }
        }
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to determine initial process stage.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Initial stage has no associated system prompt", async () => {
    const mockProjectId = "project-no-prompt";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-no-prompt", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' } }], error: null, status: 200, statusText: 'ok' })
            },
            dialectic_stage_transitions: {
                select: async () => ({
                    data: [{
                        dialectic_stages: { id: "stage-1", display_name: "hypothesis", system_prompts: [] }
                    }],
                    error: null,
                    status: 200,
                    statusText: 'ok'
                })
            }
        }
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Configuration error: Initial stage 'hypothesis' is missing a default prompt.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Database error on session insertion", async () => {
    const mockProjectId = "project-insert-fail";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' } }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_stage_transitions: { select: async () => ({ data: [{ dialectic_stages: { id: "stage-1", display_name: "hypothesis", system_prompts: [{ id: "p-1", prompt_text: "t" }] } }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', slug: 'hypothesis' }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' }) },
            dialectic_sessions: { insert: async () => ({ data: null, error: { message: "DB insert error" } as any, status: 500, statusText: 'error' }) }
        }
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to create the session.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Fails to upload seed prompt and cleans up session", async () => {
    const mockProjectId = "project-upload-fail";
    const mockNewSessionId = "session-to-be-deleted";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    
    const assembleStub = stub(promptAssembler.PromptAssembler.prototype, "assemble", () => {
        return Promise.resolve("Assembled prompt content");
    });

    let wasUploaderCalled = false;
    const mockUploadAndRegisterResource = () => {
        wasUploaderCalled = true;
        return Promise.resolve({ 
            error: { message: "Upload failed", status: 500, details: "test details" } 
        });
    };

    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' }, selected_domain_id: 'd-1' }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_stage_transitions: { select: async () => ({ data: [{ dialectic_stages: { id: "stage-1", display_name: "hypothesis", system_prompts: [{ id: "p-1", prompt_text: "t" }] } }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', slug: 'hypothesis' }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' }) },
            dialectic_sessions: {
                insert: async () => ({ data: [{ id: mockNewSessionId, project_id: 'p', current_stage_id: 's', iteration_count: 1 }], error: null, status: 201, statusText: 'created' }),
                delete: async () => ({ data: null, error: null, status: 204, statusText: 'no content' }) // Mock the cleanup delete
            }
        },
        storageConfig: {
            "prompt-seeds": {
                upload: async () => ({ data: null, error: { message: 'Storage RAGE' } as any }),
                download: async () => ({ data: new Blob(['prompt']), error: null })
            }
        }
    });
    
    try {
        const result = await startSession(
            MOCK_USER, 
            mockAdminDbClientSetup.client as any, 
            payload, 
            { 
                logger: { info: spy(), error: spy() } as any,
                uploadAndRegisterResource: mockUploadAndRegisterResource as any
            }
        );
        
        assertExists(result.error);
        assertEquals(result.error?.message, "Failed to create initial seed prompt.");
        assertEquals(result.error?.status, 500);

        const deleteSpy = mockAdminDbClientSetup.spies.getHistoricQueryBuilderSpies('dialectic_sessions', 'delete');
        assert(deleteSpy, "The .delete() method should have been spied on.");
        assertEquals(deleteSpy.callCount, 1, "The .delete() method should have been called once for cleanup.");
        assertEquals(wasUploaderCalled, true, "The mock uploader should have been called.");
    } finally {
        assembleStub.restore();
    }
});
