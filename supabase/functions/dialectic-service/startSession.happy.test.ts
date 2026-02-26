// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub } from "jsr:@std/testing@0.225.1/mock";
import { startSession } from "./startSession.ts";
import type { StartSessionPayload, StartSessionSuccessResponse, DialecticProjectResource, StartSessionDeps, SelectedModels } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { MockPromptAssembler } from "../_shared/prompt-assembler/prompt-assembler.mock.ts";
import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { AiProviderAdapterInstance, FactoryDependencies } from "../_shared/types.ts";
import { DummyAdapter } from "../_shared/ai_service/dummy_adapter.ts";
import type { AiModelExtendedConfig } from "../_shared/types.ts";
import {
    AssembledPrompt,
} from "../_shared/prompt-assembler/prompt-assembler.interface.ts";

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
        sessionDescription: mockExplicitSessionDescription,
    };

    // --- Start of Mocking Setup ---
    const mockAssembledPrompt: AssembledPrompt = {
        promptContent: "This is the assembled seed prompt.",
        source_prompt_resource_id: "new-prompt-resource-id",
    };
    const mockAssembler = new MockPromptAssembler();
    mockAssembler.assembleSeedPrompt = spy(() => Promise.resolve(mockAssembledPrompt));

    const mockFileManager = new MockFileManagerService();

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
                select: async () => ({ data: [{ overlay_values: { role: 'senior product strategist', stage_instructions: 'baseline', style_guide_markdown: '# Guide', expected_output_artifacts_json: '{}' } }], error: null, status: 200, statusText: 'ok' })
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
                            api_identifier: 'gpt-4o',
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
    const mockLogger = new MockLogger();

    const deps: Partial<StartSessionDeps> = {
        logger: mockLogger,
        fileManager: mockFileManager,
        promptAssembler: mockAssembler,
        randomUUID: () => mockNewChatId,
    };

    const result = await startSession(mockUser, adminDbClient, payload, deps);

    assertExists(result.data, `Session start failed: ${result.error?.message}`);
    assertEquals(result.error, undefined, "Error should be undefined on happy path");
    const expectedSelectedModels: SelectedModels[] = payload.selectedModelIds.map((id) => ({ id, displayName: id }));
    assertEquals(result.data.selected_models, expectedSelectedModels, "Response should include selected_models derived from payload.selectedModelIds.");
    assertExists(result.data.seedPrompt, "The seedPrompt should be part of the successful response.");
    assertEquals(result.data.seedPrompt, mockAssembledPrompt, "The returned seedPrompt should match the assembled prompt.");

    assertEquals(
        mockAssembler.assembleSeedPrompt.calls.length,
        1,
        "assembleSeedPrompt should have been called once.",
    );

    const {
        project,
        session,
        stage,
        projectInitialUserPrompt,
        iterationNumber,
    } = mockAssembler.assembleSeedPrompt.calls[0].args[0];

    assertExists(project, "The project context should have been provided.");
    assertExists(session, "The session context should have been provided.");
    assertExists(stage, "The stage context should have been provided.");
    assertEquals(
        projectInitialUserPrompt,
        "Let's be happy.",
        "The correct initial user prompt should be passed.",
    );
    assertEquals(
        iterationNumber,
        1,
        "The correct iteration number should be passed.",
    );

    assertEquals(
        mockFileManager.uploadAndRegisterFile.calls.length,
        0,
        "uploadAndRegisterFile should not be called from startSession.",
    );
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

    const mockAssembledPrompt: AssembledPrompt = {
        promptContent: "This is the assembled seed prompt for default case.",
        source_prompt_resource_id: "default-case-resource-id",
    };
    const mockAssembler = new MockPromptAssembler();
    mockAssembler.assembleSeedPrompt = spy(() => Promise.resolve(mockAssembledPrompt));

    const mockFileManager = new MockFileManagerService();

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
                select: async () => ({ data: [{ overlay_values: { role: 'senior product strategist', stage_instructions: 'baseline', style_guide_markdown: '# Guide', expected_output_artifacts_json: '{}' } }], error: null, status: 200, statusText: 'ok' })
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
    const expectedSelectedModels: SelectedModels[] = payload.selectedModelIds.map((id) => ({ id, displayName: id }));
    assertEquals(result.data.selected_models, expectedSelectedModels, "Response should include selected_models derived from payload.selectedModelIds.");

    const expectedResponse: Partial<StartSessionSuccessResponse> = {
        id: mockNewSessionId,
        project_id: mockProjectId,
        session_description: expectedDefaultDescription,
        current_stage_id: mockInitialStageId,
    };
    assertObjectMatch(result.data, expectedResponse);
    assertExists(result.data.seedPrompt, "The seedPrompt should be part of the successful response in the default case.");
    assertEquals(result.data.seedPrompt, mockAssembledPrompt, "The returned seedPrompt should match the assembled prompt in the default case.");
    assertEquals(
        mockFileManager.uploadAndRegisterFile.calls.length,
        0,
        "The file manager should NOT have been called for the default case.",
    );

    // Assert that assembler.assembleSeedPrompt was called correctly for the default case
    assertEquals(
        mockAssembler.assembleSeedPrompt.calls.length,
        1,
        "assembler.assembleSeedPrompt should have been called once for default case.",
    );
    const {
        project,
        session,
        stage,
        projectInitialUserPrompt,
        iterationNumber,
    } = mockAssembler.assembleSeedPrompt.calls[0].args[0];

    assertExists(
        project,
        "The project context should have been provided for default case.",
    );
    assertExists(
        session,
        "The session context should have been provided for default case.",
    );
    assertExists(
        stage,
        "The stage context should have been provided for default case.",
    );
    assertEquals(
        projectInitialUserPrompt,
        "Default prompt",
        "The correct default prompt string should be passed.",
    );
    assertEquals(
        iterationNumber,
        1,
        "iterationNumber 1 should be passed for default case.",
    );
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
        sessionDescription: "Session from a file prompt",
    };

    const mockAssembledPrompt: AssembledPrompt = {
        promptContent: "This is the assembled seed prompt from file.",
        source_prompt_resource_id: "file-resource-id",
    };
    const mockAssembler = new MockPromptAssembler();
    mockAssembler.assembleSeedPrompt = spy(() => Promise.resolve(mockAssembledPrompt));

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
                select: async () => ({ data: [{ overlay_values: { role: 'senior product strategist', stage_instructions: 'baseline', style_guide_markdown: '# Guide', expected_output_artifacts_json: '{}' } }], error: null, status: 200, statusText: 'ok' })
            },
            dialectic_sessions: {
                insert: async () => ({
                    data: [{ id: mockNewSessionId, project_id: mockProjectId, session_description: payload.sessionDescription, selected_model_ids: payload.selectedModelIds }],
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

    assertExists(
        result.data,
        `Session start with file prompt failed: ${result.error?.message}`,
    );
    assertEquals(
        result.error,
        undefined,
        "Error should be undefined on file prompt happy path",
    );
    const expectedSelectedModels: SelectedModels[] = payload.selectedModelIds.map((id) => ({ id, displayName: id }));
    assertEquals(result.data.selected_models, expectedSelectedModels, "Response should include selected_models derived from payload.selectedModelIds.");
    assertExists(result.data.seedPrompt, "The seedPrompt should be part of the successful response in the file prompt case.");
    assertEquals(result.data.seedPrompt, mockAssembledPrompt, "The returned seedPrompt should match the assembled prompt in the file prompt case.");

    assertEquals(
        mockAssembler.assembleSeedPrompt.calls.length,
        1,
        "assembler.assembleSeedPrompt should have been called once for file case.",
    );
    const {
        project,
        session,
        stage,
        projectInitialUserPrompt,
        iterationNumber,
    } = mockAssembler.assembleSeedPrompt.calls[0].args[0];

    // Check that the prompt content from the file was passed to the assembler
    assertEquals(
        projectInitialUserPrompt,
        mockFileContent,
        "The content of the initial prompt file should be passed.",
    );
    assertEquals(
        iterationNumber,
        1,
        "The iterationNumber should be 1 for file case.",
    );

    assertEquals(
        mockFileManager.uploadAndRegisterFile.calls.length,
        0,
        "File manager upload should not be called from startSession for file case.",
    );
});

Deno.test("startSession - selects DummyAdapter for embedding when default provider is dummy", async () => {
    const mockUser: User = {
        id: "user-dummy-embed",
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
    };
    const mockProjectId = "project-dummy-embed";
    const mockProcessTemplateId = "proc-template-dummy";
    const mockInitialStageId = "stage-initial-dummy";
    const mockInitialStageName = "Dummy Stage";
    const mockInitialStageSlug = "dummy-stage";
    const mockSystemPromptId = "system-prompt-dummy";
    const mockSystemPromptText = "Dummy system prompt.";
    const mockNewSessionId = "session-dummy-embed";

    const payload: StartSessionPayload = {
        projectId: mockProjectId,
        selectedModelIds: ["dummy-model-v1"],
        sessionDescription: "Dummy embedding session",
    };

    const mockAssembledPrompt: AssembledPrompt = {
        promptContent: "This is the assembled seed prompt for dummy case.",
        source_prompt_resource_id: "dummy-resource-id",
    };
    const mockAssembler = new MockPromptAssembler();
    mockAssembler.assembleSeedPrompt = spy(() => Promise.resolve(mockAssembledPrompt));
    const mockFileManager = new MockFileManagerService();

    const dummyConfig: AiModelExtendedConfig = {
        api_identifier: "dummy-model-v1",
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
        context_window_tokens: 4096,
        hard_cap_output_tokens: 4096,
    };

    const { client } = createMockSupabaseClient(mockUser.id, {
        genericMockResults: {
            dialectic_projects: { select: async () => ({ data: [{ id: mockProjectId, user_id: mockUser.id, project_name: "Dummy Project", initial_user_prompt: "Hi", process_template_id: mockProcessTemplateId, dialectic_domains: { name: 'General' }, selected_domain_id: 'd-1' }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_process_templates: { select: async () => ({ data: [{ id: mockProcessTemplateId, name: 'Dummy Template', starting_stage_id: mockInitialStageId }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_stages: { select: async () => ({ data: [{ id: mockInitialStageId, slug: mockInitialStageSlug, display_name: mockInitialStageName, default_system_prompt_id: mockSystemPromptId }], error: null, status: 200, statusText: 'ok' }) },
            system_prompts: { select: async () => ({ data: [{ id: mockSystemPromptId, prompt_text: mockSystemPromptText }], error: null, status: 200, statusText: 'ok' }) },
            domain_specific_prompt_overlays: { select: async () => ({ data: [{ overlay_values: { role: 'senior product strategist', stage_instructions: 'baseline', style_guide_markdown: '# Guide', expected_output_artifacts_json: '{}' } }], error: null, status: 200, statusText: 'ok' }) },
            dialectic_sessions: { insert: async () => ({ data: [{ id: mockNewSessionId, project_id: mockProjectId, session_description: payload.sessionDescription, status: `pending_${mockInitialStageName}`, iteration_count: 1, associated_chat_id: 'chat-id', current_stage_id: mockInitialStageId, selected_model_ids: payload.selectedModelIds }], error: null, status: 201, statusText: 'ok' }) },
            ai_providers: { select: async () => ({ data: [{ id: 'prov-dummy', api_identifier: 'dummy-model-v1', name: 'Dummy', description: 'Dummy', is_active: true, provider: 'dummy', config: dummyConfig, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_default_embedding: true, is_enabled: true }], error: null, status: 200, statusText: 'ok' }) },
        },
        mockUser: mockUser,
    });

    const adminDbClient = client as unknown as SupabaseClient<Database>;
    const mockLogger = new MockLogger();

    const getAdapterSpy = spy((deps: FactoryDependencies): AiProviderAdapterInstance | null => {
        // Construct a real DummyAdapter for the provided row
        const providerRow = deps.provider;
        return new DummyAdapter(providerRow, 'dummy-key', mockLogger);
    });

    const deps: Partial<StartSessionDeps> = {
        logger: mockLogger,
        fileManager: mockFileManager,
        promptAssembler: mockAssembler,
        randomUUID: () => mockNewSessionId,
        getAiProviderAdapter: getAdapterSpy,
    };

    const result = await startSession(mockUser, adminDbClient, payload, deps);

    // Desired behavior: should succeed, proving DummyAdapter is accepted for embeddings
    assertExists(
        result.data,
        `Expected startSession to succeed with dummy embedding provider, but got error: ${result.error
            ?.message}`,
    );
    const expectedSelectedModels: SelectedModels[] = payload.selectedModelIds.map((id) => ({ id, displayName: id }));
    assertEquals(result.data.selected_models, expectedSelectedModels, "Response should include selected_models derived from payload.selectedModelIds.");
    assertExists(result.data.seedPrompt, "The seedPrompt should be part of the successful response in the dummy adapter case.");
    assertEquals(result.data.seedPrompt, mockAssembledPrompt, "The returned seedPrompt should match the assembled prompt in the dummy adapter case.");
    assertEquals(
        mockFileManager.uploadAndRegisterFile.calls.length,
        0,
        "File manager upload should not be called from startSession for dummy case.",
    );
    assertEquals(
        mockAssembler.assembleSeedPrompt.calls.length,
        1,
        "assembleSeedPrompt should have been called once for dummy case.",
    );
});
