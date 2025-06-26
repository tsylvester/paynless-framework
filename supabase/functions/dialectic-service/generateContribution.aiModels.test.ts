import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import type { 
    UnifiedAIResponse,
    GenerateContributionsPayload,
    FailedAttemptError
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import type { PostgrestError } from "npm:@supabase/postgrest-js@1.15.5";
import type { IFileManager } from "../_shared/types/file_manager.types.ts";

Deno.test("generateContributions - Handles no selected models for session", async () => {
    const mockAuthToken = "auth-token-no-models";
    const mockSessionId = "session-id-no-models";
    const mockProjectId = "project-id-no-models";
    const mockStageSlug = 'thesis';
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: 1, 
        projectId: mockProjectId,
        selectedModelIds: [],
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({
                    data: [{ id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" }],
                    error: null,
                }),
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockStageSlug}`,
                        associated_chat_id: "any-chat-id",
                        selected_model_ids: [],
                    }],
                    error: null,
                }),
            },
            'dialectic_projects': {
                select: () => Promise.resolve({
                    data: [{ user_id: "owner-user-id" }],
                    error: null,
                }),
            },
        }
    };

    const { client: mockDbClient, spies: clientSpies, clearAllStubs: cleanup } = createMockSupabaseClient(undefined, mockSupabaseConfig);

    const mockFileManager: IFileManager = {
        uploadAndRegisterFile: spy(async () => await Promise.resolve({ record: null, error: { message: "Should not be called" } })),
    };

    const mockDeps = {
        logger: logger,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
        fileManager: mockFileManager,
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "No models selected for this session.");
        assertEquals(result.error?.code, 'NO_MODELS_SELECTED');
        assertEquals(result.error?.status, 400);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        if (cleanup) cleanup();
    }
});

Deno.test("generateContributions - All selected AI models fail", async () => {
    const mockAuthToken = "auth-token-all-fail";
    const mockSessionId = "session-id-all-fail";
    const mockProjectId = "project-id-all-fail";
    const mockModelCatalogId1 = "mp-id1-all-fail";
    const mockModelCatalogId2 = "mp-id2-all-fail";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId,
        selectedModelIds: [mockModelCatalogId1, mockModelCatalogId2],
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockProjectResourceDataAllFail = {
        storage_bucket: 'dialectic-private-resources',
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt_all_fail.md`,
        file_name: 'seed_prompt_all_fail.md',
        resource_description: JSON.stringify({ 
            type: "seed_prompt", 
            session_id: mockSessionId, 
            stage_slug: mockStageSlug, 
            iteration: mockIterationNumber 
        }),
    };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({
                    data: [{ id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" }],
                    error: null,
                }),
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockStageSlug}`,
                        associated_chat_id: "any-chat-id",
                        selected_model_ids: [mockModelCatalogId1, mockModelCatalogId2],
                    }],
                    error: null,
                }),
                update: () => Promise.resolve({ data: [], error: null }),
            },
            'dialectic_projects': {
                select: () => Promise.resolve({
                    data: [{ user_id: "owner-user-id" }],
                    error: null,
                }),
            },
            'ai_providers': {
                select: spy(returnsNext([
                    Promise.resolve({ data: [{ id: mockModelCatalogId1, provider: "P1", name: "M1", api_identifier: "api1" }], error: null }),
                    Promise.resolve({ data: [{ id: mockModelCatalogId2, provider: "P2", name: "M2", api_identifier: "api2" }], error: null }),
                ]))
            },
            'dialectic_project_resources': {
                select: async (state: any) => {
                    if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
                        return { data: [mockProjectResourceDataAllFail], error: null, count: 1 };
                    }
                    return { data: [], error: null, count: 0 };
                }
            }
        }
    };

    const { client: mockDbClient, spies: clientSpies, clearAllStubs: cleanup } = createMockSupabaseClient(undefined, mockSupabaseConfig);
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: null, error: "Simulated AI fail", errorCode: "AI_FAIL" }));

    const mockFileManager: IFileManager = {
        uploadAndRegisterFile: spy(async () => await Promise.resolve({ record: null, error: { message: "Should not be called in failure test" } })),
    };

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new TextEncoder().encode("prompt content").buffer, error: null })),
        getExtensionFromMimeType: spy(() => ".txt"),
        logger: logger,
        randomUUID: spy(() => "dummy-uuid"),
        fileManager: mockFileManager,
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);
        
        const details = result.error?.details as FailedAttemptError[];
        assertExists(details);
        assertEquals(details.length, 2);
        assert(details.some(d => d.error === "Simulated AI fail" && d.modelId === mockModelCatalogId1 && d.code === "AI_FAIL"));
        assert(details.some(d => d.error === "Simulated AI fail" && d.modelId === mockModelCatalogId2 && d.code === "AI_FAIL"));

        const sessionTableSpies = clientSpies?.getLatestQueryBuilderSpies('dialectic_sessions');
        const sessionUpdateSpy = sessionTableSpies?.update;

        assertExists(sessionUpdateSpy);
        if (sessionUpdateSpy) {
            assertEquals(sessionUpdateSpy.calls.length, 1);
            assertEquals(sessionUpdateSpy.calls[0].args[0], {
                status: `${mockStageSlug}_generation_failed`,
            });
        }

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        if (cleanup) cleanup();
    }
});


Deno.test("generateContributions - AI Provider details fetch fails", async () => {
    const mockAuthToken = "auth-token-provider-missing";
    const mockSessionId = "session-id-provider-missing";
    const mockProjectId = "project-id-provider-missing";
    const mockModelCatalogId = "mp-id-1";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId,
        selectedModelIds: [mockModelCatalogId],
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockProjectResourceDataProviderMissing = {
        storage_bucket: 'dialectic-private-resources',
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt_provider_missing.md`,
        file_name: 'seed_prompt_provider_missing.md',
        resource_description: JSON.stringify({ 
            type: "seed_prompt", 
            session_id: mockSessionId, 
            stage_slug: mockStageSlug, 
            iteration: mockIterationNumber 
        }),
    };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({
                    data: [{ id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" }],
                    error: null,
                }),
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockStageSlug}`,
                        associated_chat_id: "any-chat-id",
                        selected_model_ids: [mockModelCatalogId],
                    }],
                    error: null,
                }),
                update: () => Promise.resolve({ data: [], error: null }),
            },
            'dialectic_projects': {
                select: () => Promise.resolve({
                    data: [{ user_id: "owner-user-id" }],
                    error: null,
                }),
            },
            'ai_providers': {
                select: () => Promise.resolve({ 
                    data: null, 
                    error: { 
                        name: 'PostgrestError', 
                        message: "Simulated DB error", 
                        code: "DB_ERROR", 
                        details: "Details of DB error", 
                        hint: "Hint for DB" 
                    }
                }),
            },
            'dialectic_project_resources': {
                select: async (state: any) => {
                    if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
                        return { data: [mockProjectResourceDataProviderMissing], error: null, count: 1 };
                    }
                    return { data: [], error: null, count: 0 };
                }
            }
        }
    };
    
    const { client: mockDbClient, spies: clientSpies, clearAllStubs: cleanup } = createMockSupabaseClient(undefined, mockSupabaseConfig);

    const mockFileManager: IFileManager = {
        uploadAndRegisterFile: spy(async () => await Promise.resolve({ record: null, error: { message: "FM Should not be called" } })),
    };

    const mockDeps = {
        logger: logger,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new TextEncoder().encode("prompt content").buffer, error: null })),
        fileManager: mockFileManager,
        getExtensionFromMimeType: spy(() => ".txt"),
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);
        
        const details = result.error?.details as FailedAttemptError[];
        assertExists(details);
        assertEquals(details.length, 1);
        assertEquals(details[0].modelId, mockModelCatalogId);
        assertEquals(details[0].error, "Failed to fetch AI Provider details from database.");
        assertEquals(details[0].details, "Simulated DB error");
        assertEquals(details[0].code, "DB_ERROR");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        if (cleanup) cleanup();
    }
});

Deno.test("generateContributions - AI model returns no content", async () => {
    const mockAuthToken = "auth-token-no-content";
    const mockSessionId = "session-id-no-content";
    const mockProjectId = "project-id-no-content";
    const mockModelCatalogId = "mp-id-no-content";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId,
        selectedModelIds: [mockModelCatalogId],
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockProjectResourceDataNoContent = {
        storage_bucket: 'dialectic-private-resources',
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt_no_content.md`,
        file_name: 'seed_prompt_no_content.md',
        resource_description: JSON.stringify({ 
            type: "seed_prompt", 
            session_id: mockSessionId, 
            stage_slug: mockStageSlug, 
            iteration: mockIterationNumber 
        }),
    };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({
                    data: [{ id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" }],
                    error: null,
                }),
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockStageSlug}`,
                        associated_chat_id: "any-chat-id",
                        selected_model_ids: [mockModelCatalogId],
                    }],
                    error: null,
                }),
                update: () => Promise.resolve({ data: [], error: null }),
            },
            'dialectic_projects': {
                select: () => Promise.resolve({
                    data: [{ user_id: "owner-user-id" }],
                    error: null,
                }),
            },
            'ai_providers': {
                select: () => Promise.resolve({ 
                    data: [{ id: mockModelCatalogId, provider: "P1", name: "M-NoContent", api_identifier: "api-no-content" }], 
                    error: null 
                }),
            },
            'dialectic_project_resources': {
                select: async (state: any) => {
                    if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
                        return { data: [mockProjectResourceDataNoContent], error: null, count: 1 };
                    }
                    return { data: [], error: null, count: 0 };
                }
            }
        }
    };

    const { client: mockDbClient, spies: clientSpies, clearAllStubs: cleanup } = createMockSupabaseClient(undefined, mockSupabaseConfig);
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: null, error: null, errorCode: 'NO_CONTENT_RETURNED' }));

    const mockFileManager: IFileManager = {
        uploadAndRegisterFile: spy(async () => await Promise.resolve({ record: null, error: { message: "FM Should not be called" } })),
    };

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new TextEncoder().encode("prompt content").buffer, error: null })),
        logger: logger,
        fileManager: mockFileManager,
        getExtensionFromMimeType: spy(() => ".txt"),
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);

        const details = result.error?.details as FailedAttemptError[];
        assertExists(details);
        assertEquals(details.length, 1);
        assertEquals(details[0].error, "AI model returned no content.");
        assertEquals(details[0].code, "NO_CONTENT_RETURNED");
        assertEquals(details[0].modelId, mockModelCatalogId);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        if (cleanup) cleanup();
    }
});

Deno.test("generateContributions - Successfully generates one contribution", async () => {
    const mockAuthToken = "auth-token-success";
    const mockSessionId = "session-id-success";
    const mockProjectId = "project-id-success";
    const mockModelCatalogId = "mp-id-success";
    const mockStageSlug = 'thesis';
    const mockContributionId = "contribution-id-1";
    const mockChatId = "chat-id-1";
    const mockOwnerUserId = "owner-user-id-success";
    const mockIterationNumber = 1;

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId,
        selectedModelIds: [mockModelCatalogId],
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockProjectResourceDataSuccess = {
        storage_bucket: 'dialectic-private-resources',
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt_success.md`,
        file_name: 'seed_prompt_success.md',
        resource_description: JSON.stringify({ 
            type: "seed_prompt", 
            session_id: mockSessionId, 
            stage_slug: mockStageSlug, 
            iteration: mockIterationNumber 
        }),
    };

    const mockSuccessfulContributionRow = {
        id: mockContributionId,
        session_id: mockSessionId,
        model_id: mockModelCatalogId,
        model_name: "M-Success",
        user_id: mockOwnerUserId,
        stage: mockStageSlug,
        iteration_number: 1,
        storage_bucket: 'dialectic-contributions',
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/${mockStageSlug}.md`,
        mime_type: "text/markdown",
        size_bytes: 29,
        raw_response_storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_${mockStageSlug}_response.json`,
        tokens_used_input: 10,
        tokens_used_output: 20,
        processing_time_ms: 1000,
        seed_prompt_url: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/${mockStageSlug}/seed_prompt.md`,
        citations: null,
        target_contribution_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        error: null,
        contribution_type: mockStageSlug,
    };

    const mockSupabaseConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            'dialectic_stages': {
                select: () => Promise.resolve({
                    data: [{ id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" }],
                    error: null,
                }),
            },
            'dialectic_sessions': {
                select: () => Promise.resolve({
                    data: [{
                        id: mockSessionId,
                        project_id: mockProjectId,
                        status: `pending_${mockStageSlug}`,
                        associated_chat_id: mockChatId,
                        selected_model_ids: [mockModelCatalogId],
                    }],
                    error: null,
                }),
                update: () => Promise.resolve({ data: [], error: null }),
            },
            'dialectic_projects': {
                select: () => Promise.resolve({
                    data: [{ user_id: mockOwnerUserId }],
                    error: null,
                }),
            },
            'ai_providers': {
                select: () => Promise.resolve({
                    data: [{ id: mockModelCatalogId, provider: "P-Success", name: "M-Success", api_identifier: "api-success" }],
                    error: null
                }),
            },
            'dialectic_project_resources': {
                select: async (state: any) => {
                    if (state.filters.some((f: any) => f.column === 'project_id' && f.value === mockProjectId)) {
                        return { data: [mockProjectResourceDataSuccess], error: null, count: 1 };
                    }
                    return { data: [], error: null, count: 0 };
                }
            }
        }
    };

    const { client: mockDbClient, spies: clientSpies, clearAllStubs: cleanup } = createMockSupabaseClient(mockOwnerUserId, mockSupabaseConfig);
    
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ 
        content: "Successful contribution content", 
        contentType: "text/markdown",
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 1000,
        rawProviderResponse: { "some": "raw_data" },
        error: null 
    }));

    const mockFileManager: IFileManager = {
        uploadAndRegisterFile: spy(async () => await Promise.resolve({ 
            record: mockSuccessfulContributionRow as any,
            error: null 
        })),
    };

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new TextEncoder().encode("seed prompt").buffer, error: null })),
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId),
        fileManager: mockFileManager,
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);

        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data?.contributions.length, 1);
        const firstContribution = result.data?.contributions[0];
        assertExists(firstContribution);
        assertEquals(firstContribution.id, mockContributionId);
        assertEquals(firstContribution.model_id, mockModelCatalogId);
        assertEquals(firstContribution.user_id, mockOwnerUserId);
        assertEquals(firstContribution.stage, mockStageSlug);
        assertEquals(result.data?.status, `${mockStageSlug}_generation_complete`);
        
        const fmSpy = mockFileManager.uploadAndRegisterFile as Spy;
        assertEquals(fmSpy.calls.length, 1);
        const fmCallArgs = fmSpy.calls[0].args[0];
        
        assertExists(fmCallArgs.pathContext);
        assertEquals(fmCallArgs.pathContext.projectId, mockProjectId);
        assertEquals(fmCallArgs.pathContext.sessionId, mockSessionId);
        assertEquals(fmCallArgs.pathContext.stageSlug, mockStageSlug);
        assertEquals(fmCallArgs.pathContext.modelSlug, "api-success");

        assertExists(fmCallArgs.contributionMetadata);
        assertEquals(fmCallArgs.contributionMetadata.sessionId, mockSessionId);
        assertEquals(fmCallArgs.contributionMetadata.modelIdUsed, mockModelCatalogId);
        assertEquals(fmCallArgs.contributionMetadata.tokensUsedInput, 10);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        if (cleanup) cleanup();
    }
});
