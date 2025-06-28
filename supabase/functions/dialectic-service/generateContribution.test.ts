import { assertEquals, assertExists, assertObjectMatch, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import { 
    type DialecticStage,
    type GenerateContributionsPayload, 
    type UnifiedAIResponse,
    FailedAttemptError,
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

Deno.test("generateContributions - Happy Path (Single Model, Synthesis Stage)", async () => {
    const mockFileManager = new MockFileManagerService();
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockAuthToken = "test-auth-token";
    const mockSessionId = "test-session-id";
    const mockProjectId = "test-project-id";
    const mockChatId = "test-chat-id";
    const mockIterationNumber = 1;
    const mockStageSlug = mockSynthesisStage;
    const mockSeedPrompt = "This is the seed prompt for the synthesis stage.";
    const mockModelProviderId = "test-ai-provider-id";
    const mockApiIdentifier = "testprovider-testmodel";
    const mockProviderName = "TestProvider";
    const mockModelName = "TestModel";
    const mockContributionId = "new-contribution-uuid";
    const mockContent = "Generated synthesis content.";
    const mockContentType = "text/markdown";
    const mockFileExtension = ".md";

    const mockSeedPromptPath = `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug.slug}/seed_prompt.md`;
    const mockContentStoragePath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/${mockStageSlug.slug}${mockFileExtension}`;
    const mockRawResponseStoragePath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_${mockStageSlug.slug}_response.json`;
    const mockFileSize = 100;

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockStageSlug.slug,
        iterationNumber: mockIterationNumber,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId],
    };

    const mockSuccessfulContributionRecord: Database['public']['Tables']['dialectic_contributions']['Row'] = {
        id: mockContributionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_id: mockSessionId,
        model_id: mockModelProviderId,
        model_name: mockModelName,
        stage: mockStageSlug.slug,
        iteration_number: mockIterationNumber,
        storage_path: mockContentStoragePath,
        raw_response_storage_path: mockRawResponseStoragePath,
        seed_prompt_url: mockSeedPromptPath,
        user_id: "test-user-id",
        citations: null,
        contribution_type: null,
        edit_version: 1,
        error: null,
        is_latest_edit: true,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        target_contribution_id: null,
        tokens_used_input: 10,
        tokens_used_output: 20,
        processing_time_ms: 1000,
        file_name: 'synthesis.md',
        mime_type: 'text/markdown',
        size_bytes: mockFileSize,
        storage_bucket: 'dialectic-contributions',
    };

    mockFileManager.setUploadAndRegisterFileResponse(mockSuccessfulContributionRecord, null);

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': {
                select: {
                    data: [mockSynthesisStage],
                }
            },
            'dialectic_projects': {
                select: {
                    data: [{ user_id: 'test-user-id' }]
                }
            },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'dialectic-contributions',
                        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug.slug}`,
                        file_name: 'seed_prompt.md',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: mockStageSlug.slug,
                            iteration: mockIterationNumber
                        })
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockStageSlug.slug}`,
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelProviderId],
                    }],
                },
                update: { data: [{ id: mockSessionId, status: `${mockStageSlug.slug}_generation_complete` }] }
            },
            'ai_providers': {
                select: {
                    data: [{ id: mockModelProviderId, provider: mockProviderName, name: mockModelName, api_identifier: mockApiIdentifier }],
                }
            },
            'dialectic_contributions': {
                insert: (state) => {
                    const insertData = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                    // Assert versioning fields are set correctly on initial creation
                    assertEquals(insertData.edit_version, 1);
                    assertEquals(insertData.is_latest_edit, true);
                    assertEquals(insertData.original_model_contribution_id, null);
                    return Promise.resolve({ data: [{ id: mockContributionId, ...insertData }], error: null, count: 1, status: 201, statusText: 'Created' });
                }
            }
        }
    });

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: mockContent, error: null, inputTokens: 10, outputTokens: 20, processingTimeMs: 1000
    }));

    const mockUploadToStorage = spy(async (_db: any, _b: string, path: string): Promise<UploadStorageResult> => await Promise.resolve({ error: null, path }));
    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer, error: null
    }));
    const mockGetFileMetadata = spy(async () => await Promise.resolve({ size: mockFileSize, mimeType: "text/markdown", error: null }));

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                downloadFromStorage: mockDownloadFromStorage,
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => mockFileExtension),
                logger: logger,
                randomUUID: spy(() => mockContributionId),
                fileManager: mockFileManager,
            }
        );

        assert(result.success, `Expected success but got error: ${result.error?.message}`);
        assertExists(result.data);
        assertEquals(result.data.contributions.length, 1);
        assertEquals(result.data.contributions[0].id, mockContributionId);
        assertEquals(result.data.status, `${mockStageSlug.slug}_generation_complete`);

        const uploadSpy = mockFileManager.uploadAndRegisterFile as unknown as Stub;
        assertEquals(uploadSpy.calls.length, 1);
        const uploadCallArgs = (uploadSpy.calls[0].args[0] as unknown as UploadContext);
        
        assertObjectMatch(uploadCallArgs.pathContext, {
            projectId: mockProjectId,
            sessionId: mockSessionId,
            stageSlug: mockStageSlug.slug,
            iteration: mockIterationNumber,
            fileType: 'model_contribution_main',
            modelSlug: `${mockProviderName}-${mockModelName}`.toLowerCase().replace(/\s+/g, '-'),
        });

        assertObjectMatch(uploadCallArgs.contributionMetadata as object, {
            modelIdUsed: mockModelProviderId,
            modelNameDisplay: mockModelName,
            iterationNumber: mockIterationNumber,
            seedPromptStoragePath: mockSeedPromptPath,
        });
        
        const sessionUpdateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_sessions', 'update');
        assertEquals(sessionUpdateSpy?.callsArgs.length, 1);
        assertObjectMatch(sessionUpdateSpy?.callsArgs[0][0] as any, { status: `${mockStageSlug.slug}_generation_complete` });

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Multiple Models (some success, some fail)", async () => {
    const mockFileManager = new MockFileManagerService();
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockAuthToken = "test-auth-token-multi";
    const mockSessionId = "test-session-id-multi";
    const mockProjectId = "test-project-id-multi";
    const mockChatId = "test-chat-id-multi";
    const mockInitialPrompt = "Test initial prompt for multiple models";

    // Define multiple models
    const mockModelProviderId1 = "model-id-1-success";
    const mockProviderName1 = "Provider1";
    const mockModelName1 = "Model1-S";
    const mockApiIdentifier1 = "api-1";
    const mockContributionId1 = "contrib-uuid-1";
    const mockContent1 = "Successful content from Model 1.";

    const mockModelProviderId2 = "model-id-2-fail-ai";
    const mockProviderName2 = "Provider2";
    const mockModelName2 = "Model2-F-AI";
    const mockApiIdentifier2 = "api-2";
    
    const mockModelProviderId3 = "model-id-3-fail-upload";
    const mockProviderName3 = "Provider3";
    const mockModelName3 = "Model3-F-Upload";
    const mockApiIdentifier3 = "api-3";
    const mockContributionId3 = "contrib-uuid-3"; // Will attempt to generate this before failing upload
    const mockContent3 = "Content from Model 3 that fails upload.";
    const mockSeedPrompt = "Test seed prompt for multi-model test";

    const mockFileExtension = ".md"; // Assume same extension for simplicity

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModelProviderId1, mockModelProviderId2, mockModelProviderId3],
    };

    // Setup MockFileManager to return success for the first model, and an error for the third.
    const successfulRecord: Database['public']['Tables']['dialectic_contributions']['Row'] = {
        id: mockContributionId1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_id: mockSessionId,
        model_id: mockModelProviderId1,
        model_name: mockModelName1,
        stage: mockThesisStage.slug,
        iteration_number: 1,
        storage_path: 'path/to/successful/content.md',
        raw_response_storage_path: 'path/to/successful/raw_response.json',
        seed_prompt_url: 'path/to/successful/seed_prompt.md',
        user_id: "test-user-id-multi",
        citations: null,
        contribution_type: null,
        edit_version: 1,
        error: null,
        is_latest_edit: true,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        target_contribution_id: null,
        tokens_used_input: 10,
        tokens_used_output: 20,
        processing_time_ms: 1000,
        file_name: 'thesis.md',
        mime_type: 'text/markdown',
        size_bytes: 100,
        storage_bucket: 'dialectic-contributions',
    };
    
    const uploadResponses = [
        Promise.resolve({ record: successfulRecord, error: null }),
        Promise.resolve({ record: null, error: { message: 'Forced file manager error for upload test' } })
    ];
    mockFileManager.uploadAndRegisterFile = spy(returnsNext(uploadResponses));

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': {
                select: {
                    data: [mockThesisStage],
                }
            },
            'dialectic_projects': {
                select: {
                    data: [{ user_id: 'test-user-id-multi' }]
                }
            },
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
                        selected_model_ids: [mockModelProviderId1, mockModelProviderId2, mockModelProviderId3],
                    }],
                },
                update: { data: [{ id: mockSessionId, status: 'thesis_generation_partial' }] }
            },
            'ai_providers': {
                select: (state) => {
                    const modelId = state.filters.find(f => f.column === 'id')?.value;
                    const model = Object.values({
                        [mockModelProviderId1]: { id: mockModelProviderId1, provider: mockProviderName1, name: mockModelName1, api_identifier: mockApiIdentifier1 },
                        [mockModelProviderId2]: { id: mockModelProviderId2, provider: mockProviderName2, name: mockModelName2, api_identifier: mockApiIdentifier2 },
                        [mockModelProviderId3]: { id: mockModelProviderId3, provider: mockProviderName3, name: mockModelName3, api_identifier: mockApiIdentifier3 },
                    }).find(m => m.id === modelId);
                    return Promise.resolve({ data: [{ id: model?.id, name: model?.name, api_identifier: model?.api_identifier, provider: model?.provider }], error: null, count: 1, status: 200, statusText: 'OK' });
                }
            },
            'dialectic_contributions': {
                insert: (state) => {
                    const insertPayload = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                    const modelId = insertPayload?.model_id;
                    if (modelId === mockModelProviderId1) {
                        return Promise.resolve({ data: [{ ...insertPayload, id: mockContributionId1 }], error: null, count: 1, status: 201, statusText: 'Created' });
                    }
                    return Promise.resolve({ data: null, error: new Error("Unexpected DB insert call for a failing model"), count: 0, status: 500, statusText: 'Error' });
                }
            }
        }
    });
    
    const mockCallUnifiedAIModel = spy(async (modelId: string): Promise<UnifiedAIResponse> => {
        if (modelId === mockModelProviderId2) {
            return await Promise.resolve({ content: null, error: "AI failed", errorCode: "AI_CALL_FAILED_M2", inputTokens: 5, outputTokens: 0, processingTimeMs: 50 });
        }
        if (modelId === mockModelProviderId1) {
            return await Promise.resolve({ content: mockContent1, error: null, inputTokens: 10, outputTokens: 20, processingTimeMs: 1200 });
        }
        return await Promise.resolve({ content: mockContent3, error: null, inputTokens: 15, outputTokens: 25, processingTimeMs: 1500 });
    });

    const mockUploadToStorage = spy(async (_db: any, _bucket: string, path: string): Promise<UploadStorageResult> => {
        if (path.includes(mockContributionId3)) {
            return await Promise.resolve({ error: { name: 'StorageError', message: "Failed to upload for Model 3" }, path: null });
        }
        return await Promise.resolve({ error: null, path });
    });
    
    const uuidSpy = spy(
        returnsNext([
            mockContributionId1,
            mockContributionId3,
        ])
    );
    
    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel as any,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
                getExtensionFromMimeType: spy(() => mockFileExtension),
                logger: logger,
                randomUUID: uuidSpy as any,
                fileManager: mockFileManager,
            }
        );

        assert(result.success, `Expected success but got error: ${result.error?.message}`);
        assertExists(result.data);
        assertEquals(result.data.contributions.length, 1);
        assertEquals(result.data.contributions[0].model_id, mockModelProviderId1);
        assertEquals(result.data.errors?.length, 2);
        
        const aiFailure = result.data.errors?.find(e => e.modelId === mockModelProviderId2);
        assertExists(aiFailure);
        assertEquals(aiFailure.message, "AI failed");

        const uploadFailure = result.data.errors?.find(e => e.modelId === mockModelProviderId3);
        assertExists(uploadFailure);
        assertEquals(uploadFailure.message, "Forced file manager error for upload test");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - All Models Fail", async () => {
    const mockFileManager = new MockFileManagerService();
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');
    
    const mockAuthToken = "test-auth-token-all-fail";
    const mockSessionId = "test-session-id-all-fail";
    const mockProjectId = "test-project-id-all-fail";
    const mockChatId = "test-chat-id-all-fail";
    const mockFileExtension = ".md";

    const mockModels = {
        fail_db: { id: "model-id-1-db-fail", name: "Model1-DB-Fail", provider: "Provider1", apiId: "api-1-db-fail", contributionId: "contrib-uuid-1-db-fail" },
        fail_ai: { id: "model-id-2-ai-fail", name: "Model2-AI-Fail", provider: "Provider2", apiId: "api-2-ai-fail", contributionId: "contrib-uuid-2-ai-fail" },
        fail_upload: { id: "model-id-3-upload-fail", name: "Model3-Upload-Fail", provider: "Provider3", apiId: "api-3-upload-fail", contributionId: "contrib-uuid-3-upload-fail" },
    };

    const mockPayload: GenerateContributionsPayload = {
        sessionId: mockSessionId,
        stageSlug: mockThesisStage.slug,
        iterationNumber: 1,
        chatId: mockChatId,
        projectId: mockProjectId,
        selectedModelIds: [mockModels.fail_db.id, mockModels.fail_ai.id, mockModels.fail_upload.id],
    };

    mockFileManager.setUploadAndRegisterFileResponse(null, { message: 'File manager forced error' });

    const mockSupabase = createMockSupabaseClient(mockChatId, {
        genericMockResults: {
            'dialectic_stages': {
                select: {
                    data: [mockThesisStage],
                }
            },
            'dialectic_projects': {
                select: {
                    data: [{ user_id: 'test-user-id-all-fail' }]
                }
            },
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
                select: { data: [{ id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId, selected_model_ids: Object.values(mockModels).map(m => m.id) }] },
                update: { data: null, error: new Error("Simulated final status update failure") }
            },
            'ai_providers': {
                select: (state) => {
                    const modelId = state.filters.find(f => f.column === 'id')?.value;
                    const model = Object.values(mockModels).find(m => m.id === modelId);
                    return Promise.resolve({ data: [{ id: model?.id, name: model?.name, api_identifier: model?.apiId, provider: model?.provider }], error: null, count: 1, status: 200, statusText: 'OK' });
                }
            },
            'dialectic_contributions': {
                insert: (state) => {
                    const modelId = (state.insertData as any)?.model_id;
                    if (modelId === mockModels.fail_db.id) {
                        return Promise.resolve({ data: null, error: { message: "DB insert failed for Model 1", code: "DB_INSERT_ERROR_M1" } as any });
                    }
                    return Promise.resolve({ data: [{ id: `contrib-uuid-for-${modelId}`, ...(state.insertData as any) }], error: null, count: 1, status: 201, statusText: 'Created' });
                }
            }
        }
    });
    
    const mockCallUnifiedAIModel = spy(async (modelId: string): Promise<UnifiedAIResponse> => {
        if (modelId === mockModels.fail_ai.id) {
            return await Promise.resolve({ content: null, error: "AI failed for Model 2", errorCode: "AI_CALL_FAILED_M2", inputTokens: 5, outputTokens: 0, processingTimeMs: 50 });
        }
        return await Promise.resolve({
            content: `Failed content from ${modelId}`,
            error: null,
            inputTokens: 5,
            outputTokens: 5,
            processingTimeMs: 100
        });
    });

    const mockUploadToStorage = spy(async (_db: any, _bucket: string, path: string): Promise<UploadStorageResult> => {
        if (path.includes(mockModels.fail_upload.contributionId)) {
            return await Promise.resolve({ error: { name: 'StorageUploadError', message: 'Failed to upload for Model 3' }, path: null });
        }
        return await Promise.resolve({ error: null, path });
    });
    
    const mockDeleteFromStorage = spy(async () => await Promise.resolve({ data: [], error: null }));
    
    const uuidSpy = spy(returnsNext(Object.values(mockModels).map(m => m.contributionId)));

    try {
        const result = await generateContributions(
            mockSupabase.client as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null })),
                deleteFromStorage: mockDeleteFromStorage,
                getExtensionFromMimeType: spy(() => mockFileExtension),
                logger: logger,
                randomUUID: uuidSpy,
                fileManager: mockFileManager,
            }
        );

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error.message, "All models failed to generate stage contributions.");
        
        const details = result.error.details as FailedAttemptError[];
        assertEquals(details.length, 3);
        
        const dbError = details.find(e => e.modelId === mockModels.fail_db.id);
        assertExists(dbError, "DB failure error should be captured");
        assertEquals(dbError.error, "File manager forced error");

        const aiError = details.find(e => e.modelId === mockModels.fail_ai.id);
        assertExists(aiError, "AI failure error should be captured");
        assertEquals(aiError.error, "AI failed for Model 2");

        const uploadError = details.find(e => e.modelId === mockModels.fail_upload.id);
        assertExists(uploadError, "Upload failure error should be captured");
        assertEquals(uploadError.error, "File manager forced error");

        const deleteSpy = mockDeleteFromStorage as unknown as Stub;
        assertEquals(deleteSpy.calls.length, 0, "Storage cleanup should not be called as FileManager handles it internally now.");
        
        const sessionUpdateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_sessions', 'update');
        assertEquals(sessionUpdateSpy?.callsArgs.length, 1);
        assertObjectMatch(sessionUpdateSpy?.callsArgs[0][0] as any, { status: 'thesis_generation_failed' });

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});
