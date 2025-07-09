import { assertEquals, assertExists, assertObjectMatch, assert, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import { 
    type CallUnifiedAIModelOptions,
    type DialecticStage,
    type GenerateContributionsPayload, 
    type UnifiedAIResponse,
    FailedAttemptError,
    isResourceDescription,
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { 
    UploadStorageResult, 
    DownloadStorageResult
} from "../_shared/supabase_storage_utils.ts";
import { createMockSupabaseClient, type MockSupabaseClientSetup } from "../_shared/supabase.mock.ts";
import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { UploadContext } from '../_shared/types/file_manager.types.ts';

const mockThesisStage: DialecticStage = {
    id: 'stage-thesis',
    slug: 'thesis',
    display_name: 'Thesis',
    description: 'The first stage',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'prompt-1',
    expected_output_artifacts: {},
    input_artifact_rules: {}
};

const mockSynthesisStage: DialecticStage = {
    id: 'stage-synthesis',
    slug: 'synthesis',
    display_name: 'Synthesis',
    description: 'The final stage',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'prompt-3',
    expected_output_artifacts: {},
    input_artifact_rules: {}
};

// Removed global logger spies:
// const loggerSpyInfo = spy(logger, 'info');
// const loggerSpyError = spy(logger, 'error');
// const loggerSpyWarn = spy(logger, 'warn');

Deno.test("generateContributions - Happy Path (Single Model, with notification)", async () => {
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');

    // Mocks
    const mockAuthToken = "test-auth-token-happy";
    const mockSessionId = "test-session-id-happy";
    const mockProjectId = "test-project-id-happy";
    const mockUserId = "test-user-id-happy";
    const mockChatId = "test-chat-id-happy";
    const mockModelProviderId = "model-id-happy";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockSynthesisStage.slug, // Use synthesis for this test
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId],
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockSynthesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/synthesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'synthesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_synthesis', // Correct starting status
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId],
                    }],
                },
                update: { data: [] }
            },
            'ai_providers': {
                select: { data: [{ id: mockModelProviderId, provider: 'p-happy', name: 'm-happy', api_identifier: 'api-happy' }] }
            }
        }
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
        content: "Happy path content", error: null
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ id: 'happy-contrib-id' } as any, null);

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid-happy"),
                fileManager: mockFileManager,
            },
        );

        // Assertions for the main function result
        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data.successfulContributions.length, 1);
        assertEquals(result.data.failedAttempts.length, 0);
        assertEquals(result.data.status, 'synthesis_generation_complete');
        assertEquals(result.data.successfulContributions[0].id, 'happy-contrib-id');


        // Assertions for the notification RPC call
        assertEquals(rpcSpy.calls.length, 1, "RPC function 'create_notification_for_user' should be called once.");
        
        const rpcArgs = rpcSpy.calls[0].args;
        assertEquals(rpcArgs[0], 'create_notification_for_user');
        assertObjectMatch(rpcArgs[1], {
            target_user_id: mockUserId,
            notification_type: 'contribution_generation_complete',
            notification_data: {
                sessionId: mockSessionId,
                finalStatus: 'synthesis_generation_complete',
            }
        });

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - continueUntilComplete flag is true", async () => {
    const mockAuthToken = "test-auth-token-happy";
    const mockSessionId = "test-session-id-happy";
    const mockProjectId = "test-project-id-happy";
    const mockUserId = "test-user-id-happy";
    const mockChatId = "test-chat-id-happy";
    const mockModelProviderId = "model-id-happy";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockSynthesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId],
        continueUntilComplete: true,
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockSynthesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/synthesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'synthesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_synthesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId],
                    }],
                },
                update: { data: [] }
            },
            'ai_providers': {
                select: { data: [{ id: mockModelProviderId, provider: 'p-happy', name: 'm-happy', api_identifier: 'api-happy' }] }
            }
        }
    });

    const mockCallUnifiedAIModel = spy(async (
        _modelCatalogId: string,
        _renderedPrompt: string,
        _associatedChatId: string | null | undefined,
        _authToken: string,
        _options?: CallUnifiedAIModelOptions,
        _continueUntilComplete?: boolean
    ): Promise<UnifiedAIResponse> => ({
        content: "Happy path content", error: null
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ id: 'happy-contrib-id' } as any, null);

    try {
        await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid-happy"),
                fileManager: mockFileManager,
            }
        );

        assert(mockCallUnifiedAIModel.calls.length > 0, "callUnifiedAIModel should have been called");
        const callArgs = mockCallUnifiedAIModel.calls[0].args;
        assertEquals(callArgs[5], true, "continueUntilComplete argument should be true");


    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - continueUntilComplete flag is false", async () => {
    const mockAuthToken = "test-auth-token-happy";
    const mockSessionId = "test-session-id-happy";
    const mockProjectId = "test-project-id-happy";
    const mockUserId = "test-user-id-happy";
    const mockChatId = "test-chat-id-happy";
    const mockModelProviderId = "model-id-happy";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockSynthesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId],
        continueUntilComplete: false,
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockSynthesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/synthesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'synthesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_synthesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId],
                    }],
                },
                update: { data: [] }
            },
            'ai_providers': {
                select: { data: [{ id: mockModelProviderId, provider: 'p-happy', name: 'm-happy', api_identifier: 'api-happy' }] }
            }
        }
    });

    const mockCallUnifiedAIModel = spy(async (
        _modelCatalogId: string,
        _renderedPrompt: string,
        _associatedChatId: string | null | undefined,
        _authToken: string,
        _options?: CallUnifiedAIModelOptions,
        _continueUntilComplete?: boolean
    ): Promise<UnifiedAIResponse> => ({
        content: "Happy path content", error: null
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ id: 'happy-contrib-id' } as any, null);

    try {
        await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid-happy"),
                fileManager: mockFileManager,
            }
        );

        assert(mockCallUnifiedAIModel.calls.length > 0, "callUnifiedAIModel should have been called");
        const callArgs = mockCallUnifiedAIModel.calls[0].args;
        assertEquals(callArgs[5], false, "continueUntilComplete argument should be false");

    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Multiple Models (one success, one fail)", async () => {
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const mockAuthToken = "test-auth-token-mixed";
    const mockSessionId = "test-session-id-mixed";
    const mockProjectId = "test-project-id-mixed";
    const mockChatId = "test-chat-id-mixed";
    const mockUserId = "test-user-id-mixed";
    const successModelId = "model-id-success-m";
    const failureModelId = "model-id-failure-m";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [successModelId, failureModelId],
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/thesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'thesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_thesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [successModelId, failureModelId],
                    }],
                },
                update: { data: [] }
            },
            'ai_providers': {
                select: (state) => {
                    const modelId = state.filters.find(f => f.column === 'id')?.value;
                    let model;
                    if (modelId === successModelId) {
                        model = { id: successModelId, provider: 'p-succ', name: 'm-succ', api_identifier: 'api-succ' };
                    } else {
                        model = { id: failureModelId, provider: 'p-fail', name: 'm-fail', api_identifier: 'api-fail' };
                    }
                    return Promise.resolve({ data: [model], error: null, count: 1, status: 200, statusText: 'OK' });
                }
            }
        }
    });
    
    const rpcSpy = mockSupabase.spies.rpcSpy;

    const mockAiService = {
        callUnifiedAIModel: async (): Promise<UnifiedAIResponse> => {
            // This is a placeholder that should not be called.
            return await Promise.resolve({ content: '', error: 'Stub not implemented' });
        }
    };
    const mockCallUnifiedAIModel = stub(mockAiService, 'callUnifiedAIModel', returnsNext([
        Promise.resolve({ content: "Success content", error: null }), // Success
        Promise.resolve({ content: null, error: "AI timed out" })     // Failure
    ]));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ id: 'mixed-contrib-id', created_at: new Date().toISOString(), file_name: 'mixed-contrib.md', mime_type: 'text/markdown', project_id: mockProjectId, resource_description: JSON.stringify({}), size_bytes: 100, storage_bucket: 'dialectic-contributions', storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/thesis`, updated_at: new Date().toISOString(), user_id: mockUserId } as any, null);

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockAiService.callUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid-mixed"),
                fileManager: mockFileManager,
            }
        );

        // Assertions
        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data.successfulContributions.length, 1, "Should have one successful contribution");
        assertEquals(result.data.failedAttempts.length, 1, "Should have one failed attempt");
        assertEquals(result.data.status, 'thesis_generation_failed', "Final status should be failed");
        assertEquals(result.data.failedAttempts[0].modelId, failureModelId);
        
        // Check notification for mixed results
        assertEquals(rpcSpy.calls.length, 1);
        const rpcArgs = rpcSpy.calls[0].args;
        assertEquals(rpcArgs[0], 'create_notification_for_user');
        assertObjectMatch(rpcArgs[1] as any, {
            target_user_id: mockUserId,
            notification_data: {
                finalStatus: 'thesis_generation_failed',
                successful_contributions: ['mixed-contrib-id'],
                failed_contributions: [failureModelId],
            }
        });

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
        mockCallUnifiedAIModel.restore();
    }
});

Deno.test("generateContributions - All Models Fail", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockAuthToken = "test-auth-token-all-fail";
    const mockSessionId = "test-session-id-all-fail";
    const mockProjectId = "test-project-id-all-fail";
    const mockChatId = "test-chat-id-all-fail";
    const mockUserId = "test-user-id-all-fail";
    const failModelId1 = "model-id-fail-1";
    const failModelId2 = "model-id-fail-2";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [failModelId1, failModelId2],
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/thesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'thesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_thesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [failModelId1, failModelId2],
                    }],
                },
                update: { data: [] }
            },
            'ai_providers': {
                select: (state) => {
                    const modelId = state.filters.find(f => f.column === 'id')?.value;
                    let model;
                    if (modelId === failModelId1) {
                        model = { id: failModelId1, provider: 'p-f1', name: 'm-f1', api_identifier: 'api-f1' };
                    } else {
                        model = { id: failModelId2, provider: 'p-f2', name: 'm-f2', api_identifier: 'api-f2' };
                    }
                    return Promise.resolve({ data: [model], error: null, count: 1, status: 200, statusText: 'OK' });
                }
            }
        }
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    const mockAiService = {
        callUnifiedAIModel: async (): Promise<UnifiedAIResponse> => {
            return await Promise.resolve({ content: null, error: 'AI system offline' });
        }
    };
    // Spy on the method to ensure it's called
    const callAISpy = spy(mockAiService, 'callUnifiedAIModel');

    const mockFileManager = new MockFileManagerService();
    // In case of failure, file manager is not expected to be called, but we have a mock ready.
    mockFileManager.setUploadAndRegisterFileResponse(null, { message: "Should not be called" } as any);

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockAiService.callUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger, 
                randomUUID: spy(() => "uuid-all-fail"),
                fileManager: mockFileManager,
            }
        );

        assertEquals(result.success, true); // The function itself succeeds, but reports failures internally
        assertExists(result.data);
        assertEquals(result.data.successfulContributions.length, 0, "Should have no successful contributions");
        assertEquals(result.data.failedAttempts.length, 2, "Should have two failed attempts");
        assertEquals(result.data.status, 'thesis_generation_failed', "Final status should be failed");
        assertEquals(callAISpy.calls.length, 2, "AI model should be called for each provider");
        
        // Check notification for all-fail results
        assertEquals(rpcSpy.calls.length, 1);
        const rpcArgs = rpcSpy.calls[0].args;
        assertEquals(rpcArgs[0], 'create_notification_for_user');
        assertObjectMatch(rpcArgs[1] as any, {
            target_user_id: mockUserId,
            notification_data: {
                finalStatus: 'thesis_generation_failed',
                failed_contributions: [failModelId1, failModelId2],
            }
        });
    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
        callAISpy.restore();
    }
});

Deno.test("generateContributions - Parallel Processing with two successful models", async () => {
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');

    // Mocks
    const mockAuthToken = "test-auth-token-parallel";
    const mockSessionId = "test-session-id-parallel";
    const mockProjectId = "test-project-id-parallel";
    const mockChatId = "test-chat-id-parallel";
    const mockModelProviderId1 = "model-id-1-p";
    const mockModelProviderId2 = "model-id-2-p";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId1, mockModelProviderId2],
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: 'test-user-id-parallel' }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/thesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'thesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_thesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId1, mockModelProviderId2],
                    }],
                },
                update: { data: [] } // Not asserted in this test, but needed for spies
            },
            'ai_providers': {
                select: (state) => {
                    const modelId = state.filters.find(f => f.column === 'id')?.value;
                    let model;
                    if (modelId === mockModelProviderId1) {
                         model = { id: mockModelProviderId1, provider: 'p1', name: 'm1', api_identifier: 'api1' };
                    } else {
                         model = { id: mockModelProviderId2, provider: 'p2', name: 'm2', api_identifier: 'api2' };
                    }
                    return Promise.resolve({ data: [model], error: null, count: 1, status: 200, statusText: 'OK' });
                }
            }
        }
    });

    // Mock AI call to be slow and count completions
    let aiCallsCompletedCount = 0;
    const mockCallUnifiedAIModel = spy(
        () => new Promise<UnifiedAIResponse>(resolve => {
            setTimeout(() => {
                aiCallsCompletedCount++;
                resolve({ content: "Slow content", error: null });
            }, 150);
        })
    );

    // Mock FileManager
    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ id: 'dummy-id' } as any, null);

    try {
        const startTime = performance.now();
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel as any,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: mockFileManager,
            }
        );
        const endTime = performance.now();

        assertEquals(result.success, true, "Function should indicate success");
        assertExists(result.data, "Data object should exist");
        assert(endTime - startTime >= 150, `Function should wait for slow AI calls. Duration: ${endTime - startTime}ms`);
        assertEquals(aiCallsCompletedCount, 2, "Both AI calls should have completed");
        
        assertEquals(result.data.successfulContributions.length, 2, "Should have two successful contributions");
        assertEquals(result.data.failedAttempts.length, 0, "Should have no failed attempts");
        assertEquals(result.data.status, "thesis_generation_complete", "Final status should be complete");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Missing stageSlug", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockPayload = {
        sessionId: "test-session",
        stageSlug: undefined, // Missing!
    } as unknown as GenerateContributionsPayload; // Force type for testing

    const mockSupabase = createMockSupabaseClient("any-chat-id", {});
    
    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                // None of these should be called
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assert(result.error?.message.includes("stageSlug is required"));
        assertEquals(localLoggerError.calls.length, 1);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Stage not found", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockPayload: GenerateContributionsPayload = {
        sessionId: "test-session",
        stageSlug: "non-existent-stage",
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: "any-project-id",
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { 
                select: { 
                    data: [], // No stage found
                    error: { message: "Not found", code: "PGRST116", details: "The result contains 0 rows" } as any
                } 
            },
        }
    });
    
    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                // None of these should be called
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 404);
        assertStringIncludes(String(result.error.message), "not found");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), "Error fetching stage");

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Session not found", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "non-existent-session";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: "any-project-id",
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': { 
                select: { 
                    data: [], // No session found
                    error: { message: "Not found", code: "PGRST116", details: "The result contains 0 rows" } as any 
                } 
            },
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 404);
        assertStringIncludes(String(result.error.message), "Session not found");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Error fetching session ${mockSessionId}`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Project ID missing on session", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-no-project";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: "any-project-id", // This is on payload, but mock will return a session without it
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: null, // Missing project_id
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: ['any-model-id'],
                    }],
                }
            },
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertStringIncludes(String(result.error.message), "Project ID is missing for session");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Project ID is missing for session ${mockSessionId}`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Project owner not found", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-with-project";
    const mockProjectId = "project-no-owner";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: ['any-model-id'],
                    }],
                }
            },
            'dialectic_projects': {
                select: {
                    data: [], // No project owner found
                    error: { message: "Not found", code: "PGRST116", details: "The result contains 0 rows" } as any
                }
            }
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertStringIncludes(String(result.error.message), "Could not determine project owner");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Error fetching project owner user_id for project ${mockProjectId}`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Invalid session status", async () => {
    const localLoggerWarn = spy(logger, 'warn');
    const mockSessionId = "session-invalid-status";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: "any-project-id",
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: "any-project-id",
                        status: 'synthesis_generation_complete', // Invalid status
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: ['any-model-id'],
                    }],
                },
            },
            'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
        }
    });
    
    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assertStringIncludes(String(result.error.message), "not in a valid status for generation");
        assertEquals(localLoggerWarn.calls.length, 1);
        assertStringIncludes(String(localLoggerWarn.calls[0].args[0]), "not in a valid status for generation");

    } finally {
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: No models selected for session", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-no-models";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: "any-project-id",
        selectedModelIds: [], // This is what we are testing, but the function should use the session's list
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: "any-project-id",
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: [], // No models selected
                    }],
                },
            },
            'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assertStringIncludes(String(result.error.message), "No models selected for this session.");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `No models selected for session ${mockSessionId} (selected_model_ids is null or empty).`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Fetching project resources fails", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-resources-fail";
    const mockProjectId = "project-resources-fail";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: ['any-model-id'],
                    }],
                },
            },
            'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
            'dialectic_project_resources': {
                select: {
                    data: null,
                    error: new Error("DB connection failed")
                }
            }
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertStringIncludes(String(result.error.message), "Could not fetch project resources.");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Error fetching project resources for project ${mockProjectId}`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Seed prompt resource not found", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-no-seed-prompt";
    const mockProjectId = "project-no-seed-prompt";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: ['any-model-id'],
                    }],
                },
            },
            'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
            'dialectic_project_resources': {
                select: {
                    data: [] // No resources found
                }
            }
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({} as any)),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertStringIncludes(String(result.error.message), "Seed prompt resource metadata not found or description mismatch.");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `No specific seed prompt resource found matching criteria for session ${mockSessionId}`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Seed prompt resource metadata incomplete", async (t) => {
    const mockSessionId = "session-metadata-incomplete";
    const mockProjectId = "project-metadata-incomplete";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: ["any-model-id"],
    };

    await t.step("Metadata is not valid JSON", async () => {
        const localLoggerError = spy(logger, 'error');
        const mockSupabase = createMockSupabaseClient("any-chat-id", {
            genericMockResults: {
                'dialectic_stages': { select: { data: [mockThesisStage] } },
                'dialectic_sessions': {
                    select: {
                        data: [{
                            id: mockSessionId,
                            project_id: mockProjectId,
                            status: `pending_${mockThesisStage.slug}`,
                            associated_chat_id: 'any-chat-id',
                            selected_model_ids: ['any-model-id'],
                        }],
                    },
                },
                'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
                'dialectic_project_resources': {
                    select: {
                        data: [{
                            storage_bucket: 'dialectic-contributions',
                            storage_path: 'any/path',
                            file_name: 'seed.md',
                            resource_description: "this-is-not-json"
                        }]
                    }
                }
            }
        });

        try {
            const result = await generateContributions(
                mockSupabase.client as any,
                mockPayload,
                "any-auth-token",
                {
                    callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                    downloadFromStorage: spy(() => Promise.resolve({} as any)),
                    deleteFromStorage: spy(() => Promise.resolve({} as any)),
                    getExtensionFromMimeType: spy(() => ".md"),
                    logger: logger,
                    randomUUID: spy(() => "uuid"),
                    fileManager: new MockFileManagerService(),
                }
            );

            assertEquals(result.success, false);
            assertExists(result.error);
            assertEquals(result.error?.status, 500);
            assertStringIncludes(String(result.error.message), "Seed prompt resource metadata not found or description mismatch.");
            assertEquals(localLoggerError.calls.length, 1);
        } finally {
            localLoggerError.restore();
            mockSupabase.clearAllStubs?.();
        }
    });

    await t.step("Metadata is missing required fields", async () => {
        const localLoggerError = spy(logger, 'error');
        const mockSupabase = createMockSupabaseClient("any-chat-id", {
             genericMockResults: {
                'dialectic_stages': { select: { data: [mockThesisStage] } },
                'dialectic_sessions': {
                    select: {
                        data: [{
                            id: mockSessionId,
                            project_id: mockProjectId,
                            status: `pending_${mockThesisStage.slug}`,
                            associated_chat_id: 'any-chat-id',
                            selected_model_ids: ['any-model-id'],
                        }],
                    },
                },
                'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
                'dialectic_project_resources': {
                    select: {
                        data: [{
                            storage_bucket: 'dialectic-contributions',
                            storage_path: 'any/path',
                            file_name: 'seed.md',
                            resource_description: JSON.stringify({ type: 'not_a_seed_prompt' }) // Mismatched type
                        }]
                    }
                }
            }
        });

        try {
            const result = await generateContributions(
                mockSupabase.client as any,
                mockPayload,
                "any-auth-token",
                {
                    callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                    downloadFromStorage: spy(() => Promise.resolve({} as any)),
                    deleteFromStorage: spy(() => Promise.resolve({} as any)),
                    getExtensionFromMimeType: spy(() => ".md"),
                    logger: logger,
                    randomUUID: spy(() => "uuid"),
                    fileManager: new MockFileManagerService(),
                }
            );

            assertEquals(result.success, false);
            assertExists(result.error);
            assertEquals(result.error?.status, 500);
            assertStringIncludes(String(result.error.message), "Seed prompt resource metadata not found or description mismatch.");
            assertEquals(localLoggerError.calls.length, 1);
        } finally {
             localLoggerError.restore();
             mockSupabase.clearAllStubs?.();
        }
    });
});

Deno.test("generateContributions - Error: Seed prompt download fails", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-download-fails";
    const mockProjectId = "project-download-fails";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: ['any-model-id'],
                    }],
                },
            },
            'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: "dialectic-contributions",
                        storage_path: "any/path/to",
                        file_name: "seed.md",
                        resource_description: JSON.stringify({
                            type: "seed_prompt",
                            session_id: mockSessionId,
                            stage_slug: mockThesisStage.slug,
                            iteration: 1,
                        }),
                    }],
                }
            }
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({ data: null, error: new Error("Download failed") })),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertStringIncludes(String(result.error.message), "Could not retrieve the seed prompt for this stage.");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Failed to download seed prompt`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Seed prompt content is empty", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-empty-content";
    const mockProjectId = "project-empty-content";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: ["any-model-id"],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: ['any-model-id'],
                    }],
                },
            },
            'dialectic_projects': { select: { data: [{ user_id: 'any-user-id' }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: "dialectic-contributions",
                        storage_path: "any/path/to",
                        file_name: "seed.md",
                        resource_description: JSON.stringify({
                            type: "seed_prompt",
                            session_id: mockSessionId,
                            stage_slug: mockThesisStage.slug,
                            iteration: 1,
                        }),
                    }],
                }
            }
        }
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(() => Promise.resolve({ data: new TextEncoder().encode("").buffer as ArrayBuffer, error: null })), // Empty content
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 400);
        assertStringIncludes(String(result.error.message), "Rendered seed prompt is empty. Cannot proceed.");
        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Rendered seed prompt is empty for session ${mockSessionId}`);

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: Fetching AI provider details fails", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-ai-provider-fails";
    const mockProjectId = "project-ai-provider-fails";
    const mockUserId = "user-ai-provider-fails";
    const mockModelId = "model-ai-provider-fails";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: [mockModelId],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: [mockModelId],
                    }],
                },
                update: { data: [] } // To capture the final status update
            },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: "dialectic-contributions",
                        storage_path: "any/path/to",
                        file_name: "seed.md",
                        resource_description: JSON.stringify({
                            type: "seed_prompt",
                            session_id: mockSessionId,
                            stage_slug: mockThesisStage.slug,
                            iteration: 1,
                        }),
                    }],
                }
            },
            'ai_providers': {
                select: {
                    data: null,
                    error: new Error("Failed to fetch AI provider")
                }
            }
        }
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => Promise.resolve({} as any)),
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, true); // Function completes, but with failed attempts
        assertExists(result.data);
        assertEquals(result.data.successfulContributions.length, 0);
        assertEquals(result.data.failedAttempts.length, 1);
        assertEquals(result.data.status, `${mockThesisStage.slug}_generation_failed`);

        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Failed to fetch AI Provider details for model ID ${mockModelId}. Session ${mockSessionId}.`);

        // Check for failure notification
        assertEquals(rpcSpy.calls.length, 1);
        const rpcArgs = rpcSpy.calls[0].args;
        assertObjectMatch(rpcArgs[1] as any, {
            target_user_id: mockUserId,
            notification_type: 'contribution_generation_complete',
            notification_data: {
                finalStatus: `${mockThesisStage.slug}_generation_failed`,
                failed_contributions: [mockModelId],
            }
        });

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: AI provider data mismatch", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockSessionId = "session-provider-mismatch";
    const mockProjectId = "project-provider-mismatch";
    const mockUserId = "user-provider-mismatch";
    const mockModelId = "model-provider-mismatch";
    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: "any-chat-id",
        projectId: mockProjectId,
        selectedModelIds: [mockModelId],
    };

    const mockSupabase = createMockSupabaseClient("any-chat-id", {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockThesisStage.slug}`,
                        associated_chat_id: 'any-chat-id',
                        selected_model_ids: [mockModelId],
                    }],
                },
                update: { data: [] }
            },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: "dialectic-contributions",
                        storage_path: "any/path/to",
                        file_name: "seed.md",
                        resource_description: JSON.stringify({
                            type: "seed_prompt",
                            session_id: mockSessionId,
                            stage_slug: mockThesisStage.slug,
                            iteration: 1,
                        }),
                    }],
                }
            },
            'ai_providers': {
                select: {
                    data: [{
                        id: mockModelId,
                        provider: "p-mismatch",
                        name: "m-mismatch",
                        api_identifier: null // Missing api_identifier
                    }]
                }
            }
        }
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            "any-auth-token",
            {
                callUnifiedAIModel: spy(() => {
                    throw new Error("callUnifiedAIModel should not have been called in this test.");
                }),
                downloadFromStorage: spy(() => Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(() => Promise.resolve({} as any)),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data.successfulContributions.length, 0);
        assertEquals(result.data.failedAttempts.length, 1);
        assertEquals(result.data.status, `${mockThesisStage.slug}_generation_failed`);

        assertEquals(localLoggerError.calls.length, 1);
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Fetched provider data for model ID ${mockModelId} does not match the expected SelectedAiProvider interface.`);

        assertEquals(rpcSpy.calls.length, 1);
        const rpcArgs = rpcSpy.calls[0].args;
        assertObjectMatch(rpcArgs[1] as any, {
            target_user_id: mockUserId,
            notification_type: 'contribution_generation_complete',
            notification_data: {
                finalStatus: `${mockThesisStage.slug}_generation_failed`,
                failed_contributions: [mockModelId],
            }
        });

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Error: FileManager service fails to upload", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockAuthToken = "test-auth-token-fm-fail";
    const mockSessionId = "test-session-id-fm-fail";
    const mockProjectId = "test-project-id-fm-fail";
    const mockChatId = "test-chat-id-fm-fail";
    const mockUserId = "test-user-id-fm-fail";
    const mockModelProviderId = "model-id-fm-fail";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId],
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/thesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'thesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_thesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId],
                    }],
                },
                update: { data: [] }
            },
            'ai_providers': {
                select: { data: [{ id: mockModelProviderId, provider: 'p-fm', name: 'm-fm', api_identifier: 'api-fm' }] }
            }
        }
    });

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
        content: "File manager test content", error: null
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(null, new Error("File upload failed spectacularly"));

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid-fm-fail"),
                fileManager: mockFileManager,
            }
        );

        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data.successfulContributions.length, 0);
        assertEquals(result.data.failedAttempts.length, 1);
        assertEquals(result.data.status, 'thesis_generation_failed');
        assertStringIncludes(String(localLoggerError.calls[0].args[0]), "Failed to upload and register contribution file for model");

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - CRITICAL: Final session status update fails", async () => {
    const localLoggerError = spy(logger, 'error');

    // Mocks
    const mockAuthToken = "test-auth-token-update-fails";
    const mockSessionId = "test-session-id-update-fails";
    const mockProjectId = "test-project-id-update-fails";
    const mockUserId = "test-user-id-update-fails";
    const mockChatId = "test-chat-id-update-fails";
    const mockModelProviderId = "model-id-update-fails";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId],
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/thesis`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'thesis',
                            iteration: 1,
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_thesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId],
                    }],
                },
                // This is the critical part for this test
                update: {
                    data: null,
                    error: new Error("DB update failed")
                }
            },
            'ai_providers': {
                select: { data: [{ id: mockModelProviderId, provider: 'p-update-fail', name: 'm-update-fail', api_identifier: 'api-update-fail' }] }
            }
        }
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;
    
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
        content: "Update fail test content", error: null
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ id: 'update-fail-contrib-id' } as any, null);

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid-update-fail"),
                fileManager: mockFileManager,
            }
        );

        // Assertions
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertStringIncludes(result.error.message, `CRITICAL: Failed to update final session status for session ${mockSessionId}.`);

        // Check that the logger was called with a critical error
        assertEquals(localLoggerError.calls.length, 1);
        const logArgs = localLoggerError.calls[0].args;
        const logMessage = logArgs[0] as string;
        assertStringIncludes(logMessage, `CRITICAL: Failed to update final session status for ${mockSessionId} to thesis_generation_complete.`);
        
        const errorPayload = logArgs[1] as { error: Error };
        assertExists(errorPayload.error);
        assertStringIncludes(errorPayload.error.message, "DB update failed");
        
        // Notification should not be sent if status update fails.
        assertEquals(rpcSpy.calls.length, 0, "Notification should not be sent if status update fails.");


    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Unhandled Exception", async () => {
    const localLoggerError = spy(logger, 'error');
    const mockAuthToken = "test-auth-token-unhandled";
    const mockSessionId = "test-session-id-unhandled";
    const mockProjectId = "test-project-id-unhandled";
    const mockChatId = "test-chat-id-unhandled";
    const mockModelProviderId = "model-id-unhandled";

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId],
    };

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [mockThesisStage] } },
            'dialectic_projects': { select: { data: [{ user_id: 'user-id-unhandled' }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'any/path',
                        file_name: 'seed.md',
                        resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: mockThesisStage.slug, iteration: 1 })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: 'pending_thesis',
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId],
                    }],
                },
            },
        }
    });

    const unhandledError = new Error("Catastrophic failure in a dependency!");

    const mockDownloadFromStorage = spy(() => {
        throw unhandledError;
    });

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: spy(async () => await Promise.resolve({ content: "ok", error: null })),
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => ".md"),
                logger: logger,
                randomUUID: spy(() => "uuid-unhandled"),
                fileManager: new MockFileManagerService(),
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.status, 500);
        assertEquals(result.error.message, "An unexpected server error occurred during contribution generation.");
        assertEquals(result.error.details, unhandledError.message);

        assertEquals(localLoggerError.calls.length, 1, "Logger should be called once for the unhandled exception.");
        const logArgs = localLoggerError.calls[0].args;
        assertStringIncludes(logArgs[0] as string, `Unhandled exception in generateContributions for session ${mockSessionId}`);
        assertObjectMatch(logArgs[1] as object, { error: unhandledError });

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});
