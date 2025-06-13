// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { startSession, type StartSessionDeps } from "./startSession.ts";
import type { StartSessionPayload } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import * as sharedLogger from "../_shared/logger.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";

Deno.test("startSession - Error: Project not found", async () => {
    const mockUser: User = { id: "user-id", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
    const payload: StartSessionPayload = { projectId: "non-existent-project-id", selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient("test-project-not-found", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: null, error: { message: "Not found", code: "PGRST116" } as any, status: 404 })
            }
        }
    });
    const result = await startSession(mockUser, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Project not found or access denied.");
    assertEquals(result.error?.status, 404);
});

Deno.test("startSession - Error: Project is missing a process_template_id", async () => {
    const mockUser: User = { id: "user-id", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
    const mockProjectId = "project-no-template-id";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient("test-project-no-template", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUser.id, process_template_id: null, project_name: 'test', initial_user_prompt: 'test' }], // No process_template_id
                    error: null
                })
            }
        }
    });
    const result = await startSession(mockUser, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Project is not configured with a process template.");
    assertEquals(result.error?.status, 400);
});

Deno.test("startSession - Error: No entry point stage found for the process template", async () => {
    const mockUser: User = { id: "user-id", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
    const mockProjectId = "project-no-entry-point";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient("test-no-entry-point", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: mockUser.id, process_template_id: "proc-template-no-entry", project_name: 'test', initial_user_prompt: 'test' }],
                    error: null
                })
            },
            dialectic_stage_transitions: {
                select: async () => ({ data: null, error: { message: "Not found" } as any }) // No entry point found
            }
        }
    });
    const result = await startSession(mockUser, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to determine initial process stage.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Initial stage has no associated system prompt", async () => {
    const mockUser: User = { id: "user-id", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
    const mockProjectId = "project-no-prompt";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient("test-no-prompt", {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({ data: [{ id: mockProjectId, user_id: mockUser.id, process_template_id: "proc-template-no-prompt", project_name: 'test', initial_user_prompt: 'test' }], error: null })
            },
            dialectic_stage_transitions: {
                select: async () => ({
                    data: [{
                        dialectic_stages: { id: "stage-1", stage_name: "hypothesis", system_prompts: [] } // No prompts
                    }],
                    error: null
                })
            }
        }
    });
    const result = await startSession(mockUser, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Configuration error: Initial stage 'hypothesis' is missing a default prompt.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Database error on session insertion", async () => {
    const mockUser: User = { id: "user-id", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
    const mockProjectId = "project-insert-fail";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient("test-insert-fail", {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: mockUser.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test' }], error: null }) },
            dialectic_stage_transitions: { select: async () => ({ data: [{ dialectic_stages: { id: "stage-1", stage_name: "hypothesis", system_prompts: [{ id: "p-1", prompt_text: "t" }] } }], error: null }) },
            dialectic_sessions: { insert: async () => ({ data: null, error: { message: "DB insert error" } as any }) }
        }
    });
    const result = await startSession(mockUser, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to create the session.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Fails to upload seed prompt and cleans up session", async () => {
    const mockUser: User = { id: "user-id", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
    const mockProjectId = "project-upload-fail";
    const mockNewSessionId = "session-to-be-deleted";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModelCatalogIds: ["model-abc"] };
    const mockAdminDbClientSetup = createMockSupabaseClient("test-upload-fail", {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: mockUser.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test' }], error: null }) },
            dialectic_stage_transitions: { select: async () => ({ data: [{ dialectic_stages: { id: "stage-1", stage_name: "hypothesis", system_prompts: [{ id: "p-1", prompt_text: "t" }] } }], error: null }) },
            dialectic_sessions: {
                insert: async () => ({ data: [{ id: mockNewSessionId, project_id: 'p', current_stage_id: 's' }], error: null }),
                delete: async () => ({ data: null, error: null }) // Mock the cleanup delete
            }
        },
        storageMock: {
            uploadResult: async () => ({ data: null, error: new Error("Storage RAGE") })
        }
    });
    const envGetStub = stub(Deno.env, "get", (key: string) => {
        if (key === 'CONTENT_STORAGE_BUCKET') return "dialectic-contributions";
        return undefined;
    });
    
    try {
        const result = await startSession(mockUser, mockAdminDbClientSetup.client as any, payload, { logger: { info: spy(), error: spy() } as any });
        
        assertExists(result.error);
        assertEquals(result.error?.message, "Failed to prepare session: could not save initial prompt.");
        assertEquals(result.error?.status, 500);

        const qbSpies = mockAdminDbClientSetup.spies.getLatestQueryBuilderSpies('dialectic_sessions');
        assertExists(qbSpies, "Query builder spies for 'dialectic_sessions' should exist.");
        assertExists(qbSpies.delete, "The .delete() method should have been spied on.");
        assertExists(qbSpies.eq, "The .eq() method should have been spied on.");

        assertEquals(qbSpies.delete.calls.length, 1, "The .delete() method should have been called once for cleanup.");
        assertEquals(qbSpies.eq.calls.length, 1, "The .eq() method should have been called once to identify the session to delete.");
        assertEquals(qbSpies.eq.calls[0].args, ['id', mockNewSessionId], "The cleanup should target the newly created session ID.");

    } finally {
        envGetStub.restore();
    }
});
