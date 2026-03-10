// deno-lint-ignore-file no-explicit-any
import {
    assertEquals,
    assertExists,
    assert,
    assertRejects,
} from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { startSession } from "./startSession.ts";
import { testProviderMap } from "../_shared/ai_service/factory.ts";
import type { StartSessionPayload, StartSessionDeps, DialecticSessionInsert } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type MockQueryBuilderState, type PostgresError } from "../_shared/supabase.mock.ts";
import { MockPromptAssembler } from "../_shared/prompt-assembler/prompt-assembler.mock.ts";
import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { AssembledPrompt } from "../_shared/prompt-assembler/prompt-assembler.interface.ts";

const MOCK_FILE_MANAGER = new MockFileManagerService();

const IDEM_KEY_ERRORS_TEST = "idem-errors-test";

const MOCK_USER: User = {
    id: "user-id",
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

Deno.test("startSession - Error: Project not found", async () => {
    const payload: StartSessionPayload = { projectId: "non-existent-project-id", selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: IDEM_KEY_ERRORS_TEST };
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
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: IDEM_KEY_ERRORS_TEST };
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
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: IDEM_KEY_ERRORS_TEST };
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
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: IDEM_KEY_ERRORS_TEST };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' }, selected_domain_id: 'd-1' }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: 'stage-1' }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', display_name: "Hypothesis", slug: 'hypothesis', default_system_prompt_id: null }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [{ overlay_values: { role: 'senior product strategist', stage_instructions: 'baseline', style_guide_markdown: '# Guide', expected_output_artifacts_json: '{}' } }], error: null, status: 200, statusText: 'ok' }) },
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
                            input_token_cost_rate: 1,
                            output_token_cost_rate: 1,
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
    const result = await startSession(
        MOCK_USER,
        mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>,
        payload,
        { logger: mockLogger, fileManager: MOCK_FILE_MANAGER, providerMap: testProviderMap, embeddingApiKey: "test-key" }
    );
    assertExists(result.error);
    assertEquals(result.error?.message, "Configuration error: Initial stage 'Hypothesis' is missing a default prompt.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Database error on session insertion", async () => {
    const mockProjectId = "project-insert-fail";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: IDEM_KEY_ERRORS_TEST };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: 'test', initial_user_prompt: 'test', dialectic_domains: { name: 'test' }, selected_domain_id: 'd-1' }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: 'stage-1' }],
                    error: null, status: 200, statusText: 'ok'
                })
            },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', display_name: "Hypothesis", slug: 'hypothesis', default_system_prompt_id: 'p-1', system_prompts: [{ id: "p-1", prompt_text: "t" }] }], error: null, status: 200, statusText: 'ok' }) },
            system_prompts: { select: async () => ({ data: [{id: 'p-1', prompt_text: 'test prompt'}], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [{ overlay_values: { role: 'senior product strategist', stage_instructions: 'baseline', style_guide_markdown: '# Guide', expected_output_artifacts_json: '{}' } }], error: null, status: 200, statusText: 'ok' }) },
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
                            api_identifier: 'openai-gpt-4o',
                            input_token_cost_rate: 1,
                            output_token_cost_rate: 1,
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
    const mockAssembler = new MockPromptAssembler();
    const result = await startSession(
        MOCK_USER,
        mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>,
        payload,
        { logger: mockLogger, fileManager: MOCK_FILE_MANAGER, promptAssembler: mockAssembler, providerMap: testProviderMap, embeddingApiKey: 'test-key' }
    );
    assertExists(result.error);
    assertEquals(result.error?.message, "Failed to create new session.");
    assertEquals(result.error?.status, 500);
});

Deno.test("startSession - Error: Fails to assemble seed prompt and cleans up session", async () => {
    const mockProjectId = "project-assembly-fail";
    const mockNewSessionId = "session-to-be-deleted-on-assembly-failure";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: IDEM_KEY_ERRORS_TEST };
    
    const mockAssembler = new MockPromptAssembler();
    
    // For this test, we are going to throw an error when assemble is called
    mockAssembler.assembleSeedPrompt = spy(() => {
        throw new Error("Assembly failed!");
    });

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
            domain_specific_prompt_overlays: { select: async () => ({ data: [{ overlay_values: { role: 'senior product strategist', stage_instructions: 'baseline', style_guide_markdown: '# Guide', expected_output_artifacts_json: '{}' } }], error: null, status: 200, statusText: 'ok' }) },
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
    
    await assertRejects(
        async () => {
            await startSession(
                MOCK_USER, 
                mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, 
                payload, 
                { 
                    logger: mockLogger,
                    fileManager: MOCK_FILE_MANAGER,
                    promptAssembler: mockAssembler,
                    randomUUID: () => mockNewSessionId 
                }
            );
        },
        Error,
        "Assembly failed!"
    );
    
    assertEquals(spiedSessionDeleteFn.calls.length, 1, "Session delete should have been called once for cleanup.");
    
    assertEquals(mockAssembler.assembleSeedPrompt.calls.length, 1, "assembler.assembleSeedPrompt should have been called once in error case.");
    const assembleArgs = mockAssembler.assembleSeedPrompt.calls[0].args[0];
    assertExists(assembleArgs.dbClient, "The options object should have a dbClient in error case.");
    assertExists(assembleArgs.fileManager, "The options object should have a fileManager in error case.");
    assertExists(assembleArgs.project, "The options object should have a project in error case.");
    assertExists(assembleArgs.session, "The options object should have a session in error case.");
    assertExists(assembleArgs.stage, "The options object should have a stage in error case.");
    assertExists(assembleArgs.projectInitialUserPrompt, "The options object should have a projectInitialUserPrompt in error case.");
    assertExists(assembleArgs.iterationNumber, "The options object should have a iterationNumber in error case.");
});

Deno.test("startSession - Error: Missing overlays should fail fast", async () => {
    const mockProjectId = "project-overlays-missing";
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: IDEM_KEY_ERRORS_TEST };

    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: MOCK_USER.id, project_name: 'test', initial_user_prompt: 'test', selected_domain_id: 'd-1', dialectic_domains: { name: 'test' }, process_template_id: "proc-template-ok" }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_process_templates: { select: async () => ({ data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: 'stage-1' }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_stages: { select: async () => ({ data: [{ id: 'stage-1', display_name: "Hypothesis", slug: 'hypothesis', default_system_prompt_id: 'p-1' }], error: null, status: 200, statusText: 'ok' }) },
            system_prompts: { select: async () => ({ data: [{ id: 'p-1', prompt_text: 'test prompt' }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [], error: null, status: 200, statusText: 'ok' }) },
            // Session insert default OK; we expect function to fail earlier once we implement fail-fast
            dialectic_sessions: { insert: async () => ({ data: [{ id: 'session-new', project_id: mockProjectId, current_stage_id: 'stage-1', iteration_count: 1, selected_model_ids: ['model-abc'] }], error: null, status: 201, statusText: 'created' }) },
            ai_providers: { select: async () => ({ data: [{ id: 'model-abc', api_identifier: 'openai-gpt-4o', provider_max_input_tokens: 8000, config: { tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } } }], error: null, status: 200, statusText: 'ok' }) },
        },
        mockUser: MOCK_USER,
    });

    const mockLogger = new MockLogger();
    const assembler = new MockPromptAssembler();

    const result = await startSession(
        MOCK_USER,
        mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>,
        payload,
        { logger: mockLogger, fileManager: MOCK_FILE_MANAGER, promptAssembler: assembler }
    );

    // RED: Once 2.d is implemented, this should fail fast with overlays error code
    assertExists(result.error);
    assertEquals(result.error?.code, 'STAGE_CONFIG_MISSING_OVERLAYS');
});

Deno.test("startSession - Error: rejects request when idempotencyKey is missing from payload (400)", async () => {
    const payloadMissingKey: StartSessionPayload = { projectId: "project-any", selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: undefined } as unknown as StartSessionPayload;
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: null, error: { message: "Not found", code: "PGRST116", name: "Not found" }, status: 404, statusText: 'not found' }) }
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payloadMissingKey, { logger: { info: spy(), error: spy(), debug: spy(), warn: spy() }, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.status, 400);
    assert((result.error?.message?.toLowerCase().includes("idempotency")) ?? false, "Error message should mention idempotency");
});

Deno.test("startSession - Error: rejects request when idempotencyKey is empty string (400)", async () => {
    const payload: StartSessionPayload = { projectId: "project-any", selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: "" };
    const mockAdminDbClientSetup = createMockSupabaseClient(MOCK_USER.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: null, error: { message: "Not found", code: "PGRST116", name: "Not found" }, status: 404, statusText: 'not found' }) }
        },
        mockUser: MOCK_USER,
    });
    const result = await startSession(MOCK_USER, mockAdminDbClientSetup.client as unknown as SupabaseClient<Database>, payload, { logger: { info: spy(), error: spy(), debug: spy(), warn: spy() }, fileManager: MOCK_FILE_MANAGER });
    assertExists(result.error);
    assertEquals(result.error?.status, 400);
    assert((result.error?.message?.toLowerCase().includes("idempotency")) ?? false, "Error message should mention idempotency");
});

Deno.test("startSession - includes idempotency_key in the insert call to dialectic_sessions and normal success with unique key", async () => {
    const mockProjectId = "project-idem-insert";
    const mockIdempotencyKey = "idem-unique-key-insert-test";
    const mockNewSessionId = "session-idem-insert-id";
    const mockAssembledPrompt: AssembledPrompt = {
        promptContent: "Assembled seed prompt for idempotency test.",
        source_prompt_resource_id: "prompt-res-idem-test",
    };
    const sessionRow: Database["public"]["Tables"]["dialectic_sessions"]["Row"] = {
        id: mockNewSessionId,
        project_id: mockProjectId,
        current_stage_id: "stage-1",
        status: "pending_hypothesis",
        iteration_count: 1,
        selected_model_ids: ["model-abc"],
        session_description: "Session for idem test",
        associated_chat_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_input_reference_url: null,
        idempotency_key: mockIdempotencyKey,
    };
    const insertPayloadHolder: { payload: DialecticSessionInsert | null } = { payload: null };
    const mockConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: "test", initial_user_prompt: "test", dialectic_domains: { name: "test" }, selected_domain_id: "d-1" }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: "stage-1" }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            dialectic_stages: {
                select: async () => ({
                    data: [{ id: "stage-1", display_name: "Hypothesis", slug: "hypothesis", default_system_prompt_id: "p-1" }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            system_prompts: {
                select: async () => ({ data: [{ id: "p-1", prompt_text: "test prompt" }], error: null, status: 200, statusText: "ok" })
            },
            domain_specific_prompt_overlays: {
                select: async () => ({ data: [{ overlay_values: { role: "senior product strategist", stage_instructions: "baseline", style_guide_markdown: "# Guide", expected_output_artifacts_json: "{}" } }], error: null, status: 200, statusText: "ok" })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ id: "model-abc", api_identifier: "openai-gpt-4o", provider_max_input_tokens: 8000, config: { tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } } }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            dialectic_sessions: {
                insert: (state: MockQueryBuilderState) => {
                    if (state.insertData !== null && typeof state.insertData === "object" && !Array.isArray(state.insertData)) {
                        insertPayloadHolder.payload = state.insertData as DialecticSessionInsert;
                    }
                    return Promise.resolve({ data: [sessionRow], error: null, count: 1, status: 201, statusText: "created" });
                },
                delete: async () => ({ data: null, error: null, status: 204, statusText: "no content" })
            },
        },
        mockUser: MOCK_USER,
    };
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: mockIdempotencyKey };
    const mockAssembler = new MockPromptAssembler();
    mockAssembler.assembleSeedPrompt = spy(() => Promise.resolve(mockAssembledPrompt));
    const { client: mockClient } = createMockSupabaseClient(MOCK_USER.id, mockConfig);
    const result = await startSession(
        MOCK_USER,
        mockClient as unknown as SupabaseClient<Database>,
        payload,
        { logger: new MockLogger(), fileManager: MOCK_FILE_MANAGER, promptAssembler: mockAssembler, randomUUID: () => mockNewSessionId, providerMap: testProviderMap, embeddingApiKey: "test-key" }
    );
    assertExists(insertPayloadHolder.payload, "Insert should have been called with a payload");
    assertEquals(insertPayloadHolder.payload.idempotency_key, mockIdempotencyKey, "Insert must include idempotency_key");
    assertExists(result.data, "Normal creation with unique idempotency key should succeed");
    assertEquals(result.data.id, mockNewSessionId);
});

Deno.test("startSession - on unique constraint violation (23505 on idempotency_key) returns existing session", async () => {
    const mockProjectId = "project-23505";
    const mockIdempotencyKey = "idem-duplicate-session-key";
    const existingSessionId = "session-existing-23505";
    const mockAssembledPrompt: AssembledPrompt = {
        promptContent: "Re-assembled seed prompt for existing session.",
        source_prompt_resource_id: "prompt-res-23505",
    };
    const existingSessionRow = {
        id: existingSessionId,
        project_id: mockProjectId,
        current_stage_id: "stage-1",
        status: "pending_hypothesis",
        iteration_count: 1,
        selected_model_ids: ["model-abc"],
        session_description: "Existing session",
        associated_chat_id: null,
        created_at: new Date().toISOString(),
        idempotency_key: mockIdempotencyKey,
    };
    const idempotencyConflictError: PostgresError = {
        name: "PostgrestError",
        message: 'duplicate key value violates unique constraint "dialectic_sessions_idempotency_key_key"',
        code: "23505",
        details: "idempotency_key",
        hint: undefined,
    };
    let selectCallCount = 0;
    const mockConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_projects: {
                select: async () => ({
                    data: [{ id: mockProjectId, user_id: MOCK_USER.id, process_template_id: "proc-template-ok", project_name: "test", initial_user_prompt: "test", dialectic_domains: { name: "test" }, selected_domain_id: "d-1" }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            dialectic_process_templates: {
                select: async () => ({
                    data: [{ id: "proc-template-ok", name: "Test Template", starting_stage_id: "stage-1" }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            dialectic_stages: {
                select: async () => ({
                    data: [{ id: "stage-1", display_name: "Hypothesis", slug: "hypothesis", default_system_prompt_id: "p-1" }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            system_prompts: {
                select: async () => ({ data: [{ id: "p-1", prompt_text: "test prompt" }], error: null, status: 200, statusText: "ok" })
            },
            domain_specific_prompt_overlays: {
                select: async () => ({ data: [{ overlay_values: { role: "senior product strategist", stage_instructions: "baseline", style_guide_markdown: "# Guide", expected_output_artifacts_json: "{}" } }], error: null, status: 200, statusText: "ok" })
            },
            ai_providers: {
                select: async () => ({
                    data: [{ id: "model-abc", api_identifier: "openai-gpt-4o", provider_max_input_tokens: 8000, config: { tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" } } }],
                    error: null,
                    status: 200,
                    statusText: "ok"
                })
            },
            dialectic_sessions: {
                insert: async () => ({
                    data: null,
                    error: idempotencyConflictError,
                    count: 0,
                    status: 409,
                    statusText: "Conflict",
                }),
                select: async () => {
                    selectCallCount += 1;
                    return { data: [existingSessionRow], error: null, count: 1, status: 200, statusText: "ok" };
                },
            },
        },
        mockUser: MOCK_USER,
    };
    const payload: StartSessionPayload = { projectId: mockProjectId, selectedModels: [{ id: "model-abc", displayName: "Model ABC" }], idempotencyKey: mockIdempotencyKey };
    const mockAssembler = new MockPromptAssembler();
    mockAssembler.assembleSeedPrompt = spy(() => Promise.resolve(mockAssembledPrompt));
    const { client: mockClient } = createMockSupabaseClient(MOCK_USER.id, mockConfig);
    const result = await startSession(
        MOCK_USER,
        mockClient as unknown as SupabaseClient<Database>,
        payload,
        { logger: new MockLogger(), fileManager: MOCK_FILE_MANAGER, promptAssembler: mockAssembler, providerMap: testProviderMap, embeddingApiKey: "test-key" }
    );
    assertExists(result.data, "Should return existing session on 23505 instead of error");
    assertEquals(result.data.id, existingSessionId);
    assert(selectCallCount >= 1, "Select by idempotency_key should be called to fetch existing session");
});