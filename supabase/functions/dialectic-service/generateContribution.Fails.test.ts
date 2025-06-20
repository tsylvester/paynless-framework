import { assertEquals, assertExists, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions, type GenerateContributionsDeps } from "./generateContribution.ts";
import { 
    createMockSupabaseClient,
    PostgrestError
} from "../_shared/supabase.mock.ts";
import { 
    type DialecticStage,
    type GenerateContributionsPayload, 
    type UnifiedAIResponse,
    type FailedAttemptError,
    type UploadContext as DialecticUploadContext,
    type DialecticContribution
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { 
    DownloadStorageResult
} from "../_shared/supabase_storage_utils.ts";
import type { IFileManager, UploadContext as SharedUploadContext } from "../_shared/types/file_manager.types.ts";

const mockStage: DialecticStage = {
    id: 'stage-thesis',
    slug: 'thesis',
    display_name: 'Thesis',
    description: 'The first stage',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'prompt-1',
    expected_output_artifacts: {},
    input_artifact_rules: {}
};

Deno.test("generateContributions - FileManagerService fails to upload/register file", async () => {
    const mockAuthToken = "auth-token-fm-upload-fail";
    const mockSessionId = "session-id-fm-upload-fail";
    const mockProjectId = "project-id-fm-upload-fail";
    const mockProjectOwnerUserId = "user-id-owner-fm-upload-fail";
    const mockModelProviderId = "mp-id-fm-upload-fail";
    const mockSeedPrompt = "Prompt for FileManagerService failure";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
        selectedModelCatalogIds: [mockModelProviderId],
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSupabase = createMockSupabaseClient(mockProjectOwnerUserId, {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'id' && f.value === mockProjectId)) {
                        return { data: [{ user_id: mockProjectOwnerUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found", code: "PGRST116" }), count: 0, status: 406, statusText: 'Not Found' };
                }
            },
            dialectic_sessions: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { 
                            data: [{
                                id: mockSessionId,
                                project_id: mockProjectId,
                                status: `pending_${mockStage.slug}`,
                                selected_model_catalog_ids: [mockModelProviderId],
                                associated_chat_id: "mock-chat-id-fm-fail",
                                current_stage_slug: mockStage.slug,
                                current_iteration_number: 1,
                                iteration_count: 0,
                            }], 
                            error: null,
                            count: 1, status: 200, statusText: 'OK'
                        };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found", code: "PGRST116" }), count: 0, status: 406, statusText: 'Not Found' };
                },
                update: async (state) => {
                    if (state.updateData && (state.updateData as { status: string }).status === `${mockStage.slug}_generation_failed`) {
                        return { data: [{ id: mockSessionId, status: `${mockStage.slug}_generation_failed` }], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Update failed", code: "PGRSTERR" }), count: 0, status: 500, statusText: 'Error' };
                }
            },
            dialectic_stages: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'slug' && f.value === mockStage.slug)) {
                        return { data: [mockStage], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found by slug in mock", code: "PGRST116" }), count: 0, status: 406, statusText: 'Not Found' };
                }
            },
            ai_providers: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'id' && f.value === mockModelProviderId)) {
                        return { 
                            data: [{ id: mockModelProviderId, provider: 'mockProvider', name: 'ProvFMFail', api_identifier: 'api-id-fm-fail', requires_api_key: false }], 
                            error: null,
                            count: 1, status: 200, statusText: 'OK'
                        };
                    }
                     return { data: null, error: new PostgrestError({ message: "AI Provider not found", code: "PGRST116" }), count: 0, status: 406, statusText: 'Not Found' };
                }
            },
        }
    });

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: "Some AI content", error: null, errorCode: null, inputTokens: 1, outputTokens: 1, processingTimeMs: 10, rawProviderResponse: {}
    }));
    
    const mockDownloadFromStorage = spy(async (
        _dbClient: unknown,
        _bucket: string,
        _path: string,
    ): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));
    
    const mockUploadAndRegisterFileSpy = spy(async (_context: SharedUploadContext) => {
        return await Promise.resolve({ record: null, error: { message: "Simulated FileManagerService failure", code: "FILE_MANAGER_ERROR", name: "FileManagerError", details: "Detailed FM error" } });
    });

    const mockFileManagerInstance: IFileManager = {
        uploadAndRegisterFile: mockUploadAndRegisterFileSpy,
    };

    const mockDeleteFromStorage = spy(async () => ({ data: null, error: null }));

    const mockDeps: Partial<GenerateContributionsDeps> = {
        callUnifiedAIModel: mockCallUnifiedAIModel as any,
        downloadFromStorage: mockDownloadFromStorage, 
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => "mock-uuid-fm-fail"),
        fileManager: mockFileManagerInstance,
        deleteFromStorage: mockDeleteFromStorage,
    };

    try {
        const result = await generateContributions(mockSupabase.client as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        
        const details = result.error?.details as unknown as FailedAttemptError[];
        assert(Array.isArray(details));
        assertEquals(details.length, 1);
        assert(details[0].error.includes("Simulated FileManagerService failure"));
        assertEquals(details[0].code, "FILE_MANAGER_ERROR");
        assertEquals(details[0].modelId, mockModelProviderId);

        assertEquals(mockCallUnifiedAIModel.calls.length, 1);
        assertEquals(mockUploadAndRegisterFileSpy.calls.length, 1); 
        
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("FileManagerService failed for")));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("All models failed to generate contributions for session")));

        const sessionUpdateSpies = mockSupabase.clientSpies.getHistoricQueryBuilderSpies('dialectic_sessions', 'update');
        assertExists(sessionUpdateSpies);
        assert(sessionUpdateSpies.callCount >= 1, "Session update should have been called at least once");
        
        const lastSessionUpdateCallArgs = sessionUpdateSpies.callsArgs[sessionUpdateSpies.callsArgs.length -1];
        const updatePayload = lastSessionUpdateCallArgs[0] as { status: string };
        assertEquals(updatePayload.status, `${mockStage.slug}_generation_failed`);

        assertEquals(mockDeleteFromStorage.calls.length, 0, "deleteFromStorage in catch block should not be called if FileManagerService error is handled");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.cleanup();
    }
});

Deno.test("generateContributions - Final session status update fails (critical log)", async () => {
    const mockAuthToken = "auth-token-status-update-fail";
    const mockSessionId = "session-id-status-update-fail";
    const mockProjectId = "project-id-status-update-fail";
    const mockProjectOwnerUserId = "user-id-owner-status-update-fail";
    const mockModelProviderId = "mp-id-status-update-fail";
    const mockContributionId = "uuid-contribution-status-fail";
    const mockContent = "AI content for status fail";
    const mockFileSize = new TextEncoder().encode(mockContent).byteLength;
    const mockSeedPrompt = "Prompt for status update fail";
    const mockStoragePath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/${mockStage.slug}.md`;
    const mockRawResponsePath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_${mockStage.slug}_response.json`;

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
        selectedModelCatalogIds: [mockModelProviderId],
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSuccessfulContributionRecord: Database['public']['Tables']['dialectic_contributions']['Row'] = {
        id: mockContributionId,
        session_id: mockSessionId,
        model_id: mockModelProviderId,
        model_name: 'ProvStatusFail',
        user_id: mockProjectOwnerUserId,
        stage: mockStage.slug,
        iteration_number: 1,
        seed_prompt_url: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/${mockStage.slug}/seed_prompt.md`,
        storage_bucket: 'dialectic-contributions',
        storage_path: mockStoragePath,
        mime_type: 'text/markdown',
        size_bytes: mockFileSize,
        raw_response_storage_path: mockRawResponsePath,
        tokens_used_input: 10,
        tokens_used_output: 20,
        processing_time_ms: 100,
        citations: null,
        target_contribution_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        error: null,
        file_name: 'mock-file-name',
        prompt_template_id_used: null,
        contribution_type: mockStage.slug,
    };

    const mockSupabase = createMockSupabaseClient(mockProjectOwnerUserId, {
        genericMockResults: {
            dialectic_projects: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'id' && f.value === mockProjectId)) {
                        return { data: [{ user_id: mockProjectOwnerUserId }], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            dialectic_sessions: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { 
                            data: [{
                                id: mockSessionId,
                                project_id: mockProjectId,
                                status: `pending_${mockStage.slug}`,
                                selected_model_catalog_ids: [mockModelProviderId],
                                associated_chat_id: "mock-chat-id-status-update-fail",
                                current_stage_slug: mockStage.slug,
                                current_iteration_number: 1,
                                iteration_count: 0,
                            }], error: null, count: 1, status: 200, statusText: 'OK'
                        };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                },
                update: async (state) => {
                    if (state.updateData && (state.updateData as { status: string }).status === `${mockStage.slug}_generation_complete`) {
                        return { data: null, error: new PostgrestError({ message: "Simulated session update failure", code: "DB_UPDATE_FAIL" }), count: 0, status: 500, statusText: 'Error' };
                    }
                    return { data: [{id: mockSessionId}], error: null, count: 1, status: 200, statusText: 'OK' };
                }
            },
            dialectic_stages: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'slug' && f.value === mockStage.slug)) {
                        return { data: [mockStage], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found by slug in mock", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            ai_providers: {
                select: async (state) => {
                    if (state.filters?.some(f => f.column === 'id' && f.value === mockModelProviderId)) {
                        return { 
                            data: [{ id: mockModelProviderId, provider: 'mockProvider', name: 'ProvStatusFail', api_identifier: 'api-id-status-update-fail', requires_api_key: false }], 
                            error: null, count: 1, status: 200, statusText: 'OK'
                        };
                    }
                     return { data: null, error: new PostgrestError({ message: "AI Provider not found", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
        }
    });
    
    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));

    const mockUploadAndRegisterFileSuccessSpy = spy(async (_context: SharedUploadContext) => {
        return await Promise.resolve({ record: mockSuccessfulContributionRecord, error: null });
    });

    const mockFileManagerInstance: IFileManager = {
        uploadAndRegisterFile: mockUploadAndRegisterFileSuccessSpy,
    };
    
    const mockDeps: Partial<GenerateContributionsDeps> = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ 
            content: mockContent, 
            error: null, 
            errorCode: null, 
            inputTokens:10, 
            outputTokens:20, 
            cost:0.001, 
            processingTimeMs:100, 
            rawProviderResponse: { some: "raw data"}
        })) as any,
        downloadFromStorage: mockDownloadFromStorage,
        getExtensionFromMimeType: spy((_mimeType: string): string => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId),
        fileManager: mockFileManagerInstance,
        deleteFromStorage: spy(async () => ({ data: null, error: null })),
    };

    try {
        const result = await generateContributions(mockSupabase.client as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data?.contributions?.length, 1);
        const contributionResponse = result.data?.contributions?.[0] as DialecticContribution;
        
        assertEquals(contributionResponse.id, mockContributionId);
        assertEquals(contributionResponse.model_id, mockModelProviderId);
        assertEquals(contributionResponse.storage_path, mockStoragePath);
        assertEquals(contributionResponse.raw_response_storage_path, mockRawResponsePath);
        assertEquals(contributionResponse.size_bytes, mockFileSize);
        assertEquals(contributionResponse.stage, mockStage.slug);

        assertEquals(result.data?.status, `${mockStage.slug}_generation_complete`); 

        const sessionUpdateSpies = mockSupabase.clientSpies.getHistoricQueryBuilderSpies('dialectic_sessions', 'update');
        assertExists(sessionUpdateSpies);
        assert(sessionUpdateSpies.callCount >= 1, "Session update should have been called");
        const lastSessionUpdateCall = sessionUpdateSpies.callsArgs.find(args => (args[0] as {status: string}).status === `${mockStage.slug}_generation_complete`);
        assertExists(lastSessionUpdateCall, "Session update to _generation_complete was not attempted");

        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && call.args[0].includes("CRITICAL: Failed to update session status for") &&
            call.args[0].includes(mockSessionId) &&
            call.args[0].includes(`${mockStage.slug}_generation_complete`)
        ), "Critical log for session update failure not found or incorrect.");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.cleanup();
    }
});
