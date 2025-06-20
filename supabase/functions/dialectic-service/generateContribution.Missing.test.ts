import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions, type GenerateContributionsDeps } from "./generateContribution.ts";
import type { 
    GenerateContributionsPayload, 
    UnifiedAIResponse,
    DialecticStage
} from "./dialectic.interface.ts";
import { logger } from "../_shared/logger.ts";
import { createMockSupabaseClient, PostgrestError } from "../_shared/supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import type { IFileManager, PathContext } from "../_shared/types/file_manager.types.ts";
import type { IMockQueryBuilder } from "../_shared/supabase.mock.ts";

Deno.test("generateContributions - Project owner details not found", async () => {
    const mockAuthToken = "test-auth-token-proj-owner-fail";
    const mockSessionId = "test-session-id-proj-owner-fail";
    const mockProjectId = "project-id-proj-owner-fail";
    const mockStageSlug = 'thesis';
    // Models are selected, so this check is passed.
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: 1, projectId: mockProjectId, selectedModelCatalogIds: ["m-id-1"] };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageData: DialecticStage = { 
        id: 'stage-id-owner-fail', 
        slug: mockStageSlug, 
        display_name: "Thesis", 
        description: "Test", 
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: {},
        input_artifact_rules: {}
    };
    const mockSessionData = { // Session fetch is successful
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_${mockStageSlug}`, // Correct status for processing
        associated_chat_id: "any-chat-id-owner-fail",
        selected_model_catalog_ids: ["m-id-1"], // Models are selected
        iteration_count: 0,
    };
    // dialectic_projects fetch will be configured to fail

    const { client: mockDbClientUntyped, clientSpies, getSpiesForTableQueryMethod } = createMockSupabaseClient("test-user-id-owner-fail", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found mock", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found mock", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_projects': { // Key for this test: this fetch fails
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        // Simulate project found, but user_id is null (or return error directly)
                        // return { data: [{ user_id: null }], error: null, count: 1, status: 200, statusText: 'OK' }; 
                        // OR Simulate error fetching project
                        return { data: null, error: new PostgrestError({ message: "Simulated DB error fetching project owner", code: "XXYYZ" }), count: 0, status: 500, statusText: 'Internal Server Error' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found mock (owner check)", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger, // Using the spied real logger
        // Other deps not expected to be called before this failure point
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        downloadFromStorage: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        getExtensionFromMimeType: spy(() => ".txt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy(() => "dummy/path"),
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})),
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "Could not determine project owner for contribution attribution.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.details, "Simulated DB error fetching project owner");


        // Verify calls to Supabase
        // 1 for dialectic_stages, 1 for dialectic_sessions, 1 for dialectic_projects
        assertEquals(clientSpies.fromSpy.calls.length, 3);
        assertEquals(clientSpies.fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(clientSpies.fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(clientSpies.fromSpy.calls[2].args[0], 'dialectic_projects');
        
        const projectSelectSpy = getSpiesForTableQueryMethod('dialectic_projects', 'select');
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.calls[0].args[0], 'user_id'); // Check that we are selecting 'user_id'

        const callUnifiedAIModelSpy = partialDepsForTest.callUnifiedAIModel as Stub;
        assertEquals(callUnifiedAIModelSpy.calls.length, 0);
        const downloadFromStorageSpy = partialDepsForTest.downloadFromStorage as Stub;
        assertEquals(downloadFromStorageSpy.calls.length, 0);

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Error fetching project owner user_id for project ${mockProjectId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - Seed prompt download fails", async () => {
    const mockAuthToken = "test-auth-token-seed-fail";
    const mockSessionId = "test-session-id-seed-fail";
    const mockProjectId = "project-id-seed-fail";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId, 
        selectedModelCatalogIds: ["m-id-seed-fail"] 
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageData: DialecticStage = { 
        id: 'stage-id-seed-fail', 
        slug: mockStageSlug, 
        display_name: "Thesis", 
        description: "Test", 
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: {},
        input_artifact_rules: {}
    };
    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_${mockStageSlug}`,
        associated_chat_id: "any-chat-id-seed-fail",
        selected_model_catalog_ids: ["m-id-seed-fail"], 
        iteration_count: mockIterationNumber -1, // Iteration count before this run
    };
    const mockProjectData = { // Project data is needed for project owner ID
        id: mockProjectId,
        user_id: "test-owner-user-id-seed-fail",
    };

    const { client: mockDbClientUntyped, clientSpies } = createMockSupabaseClient("test-user-id-seed-fail", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found mock", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found mock", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found mock (owner check)", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;

    const mockDownloadError = new Error("Simulated storage download failure");
    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ data: null, error: mockDownloadError }));
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy, // Key for this test
        // Other deps not expected to be called before this failure point or are not critical to mock precisely
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        getExtensionFromMimeType: spy(() => ".txt"), // Might be called if download was successful
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy(() => "dummy/path"),
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})),
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "Could not retrieve the seed prompt for this stage.");
        assertEquals(result.error?.status, 500);
        assertEquals(result.error?.details, mockDownloadError.message);

        // Verify calls to Supabase (DB part)
        assertEquals(clientSpies.fromSpy.calls.length, 3);
        assertEquals(clientSpies.fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(clientSpies.fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(clientSpies.fromSpy.calls[2].args[0], 'dialectic_projects');

        // Verify downloadFromStorage call
        assertEquals(mockDownloadFromStorageSpy.calls.length, 1);
        const downloadArgs = mockDownloadFromStorageSpy.calls[0].args;
        assertExists(downloadArgs, "downloadArgs should exist");
        assertEquals(downloadArgs.length, 3, "downloadFromStorageSpy should be called with 3 arguments");
        assertEquals(downloadArgs[0], mockDbClient); // First arg is the dbClient
        assertEquals(downloadArgs[1], 'dialectic-contributions'); // Bucket name
        const expectedSeedPath = `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt.md`;
        assertEquals(downloadArgs[2], expectedSeedPath); // Path

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Fetching seed prompt from: ${expectedSeedPath}`)));
        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && call.args[0].includes(`Failed to download seed prompt from ${expectedSeedPath}`)
        ));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - Associated chat ID missing, successful generation", async () => {
    const mockAuthToken = "test-auth-token-chatid-missing-success";
    const mockSessionId = "test-session-id-chatid-missing-success";
    const mockProjectId = "project-id-chatid-missing-success";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockModelProviderId = "m-id-chatid-success";
    const mockContributionId = "contrib-uuid-chatid-success";
    const mockSeedPromptContent = "This is the seed prompt content for chat ID missing test.";
    const mockAiContent = "Successful AI content when chat ID is missing.";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId, 
        selectedModelCatalogIds: [mockModelProviderId] 
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageData: DialecticStage = { 
        id: 'stage-id-chatid-success', 
        slug: mockStageSlug, 
        display_name: "Thesis Stage", 
        description: "Test stage for chat ID missing", 
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: {},
        input_artifact_rules: {}
    };
    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_${mockStageSlug}`,
        associated_chat_id: null, // Key for this test
        selected_model_catalog_ids: [mockModelProviderId], 
        iteration_count: mockIterationNumber - 1,
    };
    const mockProjectData = { 
        id: mockProjectId,
        user_id: "owner-user-id-chatid-success",
    };
    const mockAiProviderData = {
        id: mockModelProviderId, 
        provider: "mockProviderChatSuccess", 
        name: "MockModelChatSuccess", 
        api_identifier: "api-id-chat-success"
    };
    const mockContributionDataAfterInsert = {
        id: mockContributionId,
        session_id: mockSessionId,
        model_id: mockModelProviderId,
        model_name: mockAiProviderData.name,
        stage: mockStageSlug,
        iteration_number: mockIterationNumber,
        user_id: mockProjectData.user_id,
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/${mockStageSlug}.md`,
        raw_response_storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_${mockStageSlug}_response.json`,
        mime_type: 'text/markdown',
        size_bytes: mockAiContent.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tokens_used_input: 10,
        tokens_used_output: 20,
        processing_time_ms: 100,
        seed_prompt_url: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt.md`,
        contribution_type: mockStageSlug,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        error: null,
        citations: null,
        storage_bucket: 'dialectic-contributions',
    };

    const { client: mockDbClientUntyped, clientSpies, getHistoricBuildersForTable } = createMockSupabaseClient("test-user-chatid-success", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found mock", code: "PGRST116"}), count: 0, status: 404 };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found mock", code: "PGRST116"}), count: 0, status: 404 };
                },
                update: async (state) => { // Mock successful session update
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        if (state.updateData && (state.updateData as any).status === `${mockStageSlug}_generation_complete`) {
                            return { data: [{...mockSessionData, status: `${mockStageSlug}_generation_complete`, iteration_count: mockIterationNumber }], error: null, count: 1, status: 200, statusText: 'OK' };
                        }
                    }
                    return { data: null, error: new PostgrestError({ message: "Session update failed mock", code: "DB_UPDATE_ERROR"}), count: 0, status: 500 };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found mock", code: "PGRST116"}), count: 0, status: 404 };
                }
            },
            'ai_providers': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockModelProviderId)) {
                        return { data: [mockAiProviderData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "AI Provider not found mock", code: "PGRST116"}), count: 0, status: 404 };
                }
            },
            // dialectic_contributions insert is handled by fileManager mock spy return value
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;

    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ 
        data: new TextEncoder().encode(mockSeedPromptContent).buffer as ArrayBuffer, 
        error: null 
    }));
    const mockCallUnifiedAISpy = spy(async (_modelId: string, _prompt: string, _chatId: string | null | undefined, _authToken: string): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: mockAiContent,
        contentType: "text/markdown",
        error: null, errorCode: null, inputTokens: 10, outputTokens: 20, cost: 0.001, processingTimeMs: 100
    }));
    const mockFileManagerUploadSpy = spy(async (_uploadContext: any) => await Promise.resolve({ 
        record: mockContributionDataAfterInsert as any, 
        error: null 
    }));

    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        randomUUID: spy(() => mockContributionId), 
        downloadFromStorage: mockDownloadFromStorageSpy,
        callUnifiedAIModel: mockCallUnifiedAISpy,
        getExtensionFromMimeType: spy(() => ".md"), 
        fileManager: {
            uploadAndRegisterFile: mockFileManagerUploadSpy,
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy((context: PathContext) => `mock/path/for/${context.fileType}`), // Typed context
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})),
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, true, `Expected success, but got error: ${JSON.stringify(result.error, null, 2)}`);
        assertExists(result.data, "Expected data in successful response");
        assertEquals(result.data?.contributions?.length, 1, "Expected one contribution");
        assertExists(result.data?.contributions?.[0]);
        assertEquals(result.data?.contributions?.[0].id, mockContributionId);
        assertEquals(result.data?.status, `${mockStageSlug}_generation_complete`);

        // Verify DB calls
        const fromCalls = clientSpies.fromSpy.calls;
        assert(fromCalls.some(call => call.args[0] === 'dialectic_stages'), "dialectic_stages was not called");
        assert(fromCalls.some(call => call.args[0] === 'dialectic_sessions'), "dialectic_sessions select was not called");
        assert(fromCalls.some(call => call.args[0] === 'dialectic_projects'), "dialectic_projects was not called");
        assert(fromCalls.some(call => call.args[0] === 'ai_providers'), "ai_providers was not called");
        // Check session update call
        const sessionTableInteractions = getHistoricBuildersForTable('dialectic_sessions');
        assertExists(sessionTableInteractions, "No interactions with dialectic_sessions table recorded by mock client.");
        const updateInteraction = sessionTableInteractions.find(builder => (builder as any)._state.operation === 'update');
        assertExists(updateInteraction, "No update operation recorded for dialectic_sessions table.");
        const updateSpy = (updateInteraction as any).methodSpies.update as Stub;
        assertExists(updateSpy, "Update spy not found on session builder");
        assertEquals(updateSpy.calls.length, 1, "Session update was not called exactly once");
        assertObjectMatch(updateSpy.calls[0].args[0] as Record<string,unknown>, { status: `${mockStageSlug}_generation_complete`, iteration_count: mockIterationNumber });

        // Verify downloadFromStorage
        assertEquals(mockDownloadFromStorageSpy.calls.length, 1);
        const downloadArgs = mockDownloadFromStorageSpy.calls[0].args;
        assertExists(downloadArgs, "downloadArgs should exist");
        assertEquals(downloadArgs.length, 3, "downloadFromStorageSpy should be called with 3 arguments");
        assertEquals(downloadArgs[0], mockDbClient); // First arg is the dbClient
        assertEquals(downloadArgs[1], 'dialectic-contributions'); // Bucket name
        const expectedSeedPath = `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt.md`;
        assertEquals(downloadArgs[2], expectedSeedPath); // Path

        // Verify callUnifiedAIModel
        assertEquals(mockCallUnifiedAISpy.calls.length, 1);
        const callAIArgs = mockCallUnifiedAISpy.calls[0].args;
        assertExists(callAIArgs, "callAIArgs should exist");
        assertEquals(callAIArgs.length, 4, "callUnifiedAIModel should be called with at least 4 arguments");
        assertEquals(callAIArgs[0], mockModelProviderId); // modelId
        assertEquals(callAIArgs[1], mockSeedPromptContent); // prompt
        assert(callAIArgs[2] === null || callAIArgs[2] === undefined, "ChatId to callUnifiedAIModel was not null/undefined");
        assertEquals(callAIArgs[3], mockAuthToken); // authToken

        // Verify fileManager.uploadAndRegisterFile
        assertEquals(mockFileManagerUploadSpy.calls.length, 1);
        const fmUploadArgs = mockFileManagerUploadSpy.calls[0].args[0]; // First arg is UploadContext object
        assertExists(fmUploadArgs, "fmUploadArgs should exist");
        assertEquals(fmUploadArgs?.pathContext?.projectId, mockProjectId);
        assertEquals(fmUploadArgs?.pathContext?.sessionId, mockSessionId);
        assertEquals(fmUploadArgs?.pathContext?.stageSlug, mockStageSlug);
        assertEquals(fmUploadArgs?.fileContent, mockAiContent);
        assertEquals(fmUploadArgs?.userId, mockProjectData.user_id);

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`AI response received from ${mockAiProviderData.provider}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Contribution processed by FileManagerService for ${mockAiProviderData.provider}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Session ${mockSessionId} status updated to ${mockStageSlug}_generation_complete`)));
        assertEquals(localLoggerError.calls.length, 0, "Expected no error logs");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - No models selected for session", async () => {
    const mockAuthToken = "test-auth-token-no-models-selected";
    const mockSessionId = "test-session-id-no-models-selected";
    const mockProjectId = "project-id-no-models";
    const mockStageSlug = 'thesis';
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: 1, projectId: mockProjectId, selectedModelCatalogIds: [] }; // Empty selected models

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageData: DialecticStage = { 
        id: 'stage-id-no-models', 
        slug: mockStageSlug, 
        display_name: "Thesis", 
        description: "Test", 
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: {},
        input_artifact_rules: {}
    };
    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_${mockStageSlug}`,
        associated_chat_id: "any-chat-id-no-models",
        selected_model_catalog_ids: [], // Key for this test: no models selected
        iteration_count: 0,
    };
    const mockProjectData = {
        id: mockProjectId,
        user_id: "test-owner-user-id-no-models",
        initial_user_prompt: "some prompt" // Needed for seed prompt path construction logic, though download won't happen
    };

    const { client: mockDbClientUntyped, clientSpies } = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;
    
    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ 
        data: new TextEncoder().encode("seed prompt content").buffer as ArrayBuffer, 
        error: null 
    }));

    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        randomUUID: spy(() => "dummy-uuid-no-models"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        downloadFromStorage: mockDownloadFromStorageSpy,
        getExtensionFromMimeType: spy(() => ".txt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy(() => "dummy/path"),
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => await Promise.resolve({data:[], error: null})),
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "No models selected for this session.");
        assertEquals(result.error?.status, 400);
        assertEquals(result.error?.code, 'NO_MODELS_SELECTED');

        // Verify calls to Supabase
        // dialectic_stages, dialectic_sessions, dialectic_projects, downloadFromStorage (for seed prompt)
        assertEquals(clientSpies.fromSpy.calls.length, 3); 
        assertEquals(clientSpies.fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(clientSpies.fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(clientSpies.fromSpy.calls[2].args[0], 'dialectic_projects');

        // downloadFromStorage IS called to get the seed prompt before the selected_models check
        assertEquals(mockDownloadFromStorageSpy.calls.length, 1);
        const downloadArgs = mockDownloadFromStorageSpy.calls[0].args;
        assertExists(downloadArgs, "downloadArgs should exist");
        assertEquals(downloadArgs.length, 3, "downloadFromStorageSpy should be called with 3 arguments");
        assertEquals(downloadArgs?.[1], 'dialectic-contributions'); // bucket name
        assert(String(downloadArgs?.[2]).includes(`projects/${mockProjectId}/sessions/${mockSessionId}/iteration_1/thesis/seed_prompt.md`));

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`No models selected for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - Stage details not found", async () => {
    const mockAuthToken = "test-auth-token-stage-fail";
    const mockSessionId = "test-session-id-stage-fail";
    const mockProjectId = "project-id-stage-fail";
    const mockStageSlug = 'non_existent_stage'; // Key for this test
    const mockIterationNumber = 1;
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId, 
        selectedModelCatalogIds: ["m-id-stage-fail"] 
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // No mockStageData needed as it won't be found
    // Mock session and project data are defined but won't be fetched if stage fails
    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_some_other_stage`,
        associated_chat_id: "any-chat-id-stage-fail",
        selected_model_catalog_ids: ["m-id-stage-fail"], 
        iteration_count: mockIterationNumber -1,
    };
    const mockProjectData = { 
        id: mockProjectId,
        user_id: "owner-user-id-stage-fail",
    };

    const { client: mockDbClientUntyped, clientSpies, getHistoricBuildersForTable } = createMockSupabaseClient("test-user-stage-fail", { // Added getHistoricBuildersForTable
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    // Simulate stage not found
                    return { data: null, error: new PostgrestError({ message: "Simulated: Stage not found in DB", code: "PGRST116" }), count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': { // Won't be called if stage fetch fails
                select: async () => {
                    return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                }
            },
            'dialectic_projects': { // Won't be called
                select: async () => {
                    return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                }
            }
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger, // Using the spied real logger
        // None of the other major deps should be called if stage fetch fails
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        downloadFromStorage: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        getExtensionFromMimeType: spy(() => ".txt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy((context: PathContext) => `mock/path/for/${context.fileType}`),
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})),
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, `Stage with slug '${mockStageSlug}' not found.`);
        assertEquals(result.error?.status, 404);
        assertEquals(result.error?.details, "Simulated: Stage not found in DB");

        // Verify calls to Supabase
        assertEquals(clientSpies.fromSpy.calls.length, 1, "Only dialectic_stages should be queried.");
        assertEquals(clientSpies.fromSpy.calls[0].args[0], 'dialectic_stages');
        
        const stageSelectSpy = getHistoricBuildersForTable('dialectic_stages')?.[0]?.methodSpies.select as Stub;
        assertExists(stageSelectSpy, "select spy should exist for dialectic_stages");
        assertEquals(stageSelectSpy.calls.length, 1);
        assertEquals(stageSelectSpy.calls[0].args.length, 1, "select should be called with one argument");
        assertEquals(stageSelectSpy.calls[0].args[0], '*');

        // const eqSpy = getHistoricBuildersForTable('dialectic_stages')?.[0]?.methodSpies.eq as Stub;
        // assertExists(eqSpy, "eq spy should exist for dialectic_stages");
        // assertEquals(eqSpy.calls.length, 1);
        // assertObjectMatch(eqSpy.calls[0].args[0], { column: 'slug', value: mockStageSlug, type: 'eq' });

        // const singleSpy = getHistoricBuildersForTable('dialectic_stages')?.[0]?.methodSpies.single as Stub;
        // assertExists(singleSpy, "single spy should exist for dialectic_stages");
        // assertEquals(singleSpy.calls.length, 1);

        // Verify logger calls
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        
        // Detailed assertions for localLoggerError
        assertEquals(localLoggerError.calls.length, 1, "localLoggerError should have been called once.");
        
        const errorCall = localLoggerError.calls[0];
        assertExists(errorCall, "First call to localLoggerError should exist.");
        assert(errorCall.args.length > 0, "First call to localLoggerError should have arguments.");
        
        const firstArg = errorCall.args[0];
        assertExists(firstArg, "First argument to logger.error should exist.");

        const capturedArg = firstArg as any; 
        const actualMessageString = String(capturedArg); 
        const expectedSubstringString = String('non_existent_stage');

        // ADD DEBUG LOGS HERE
        // console.log("DEBUG_ASSERT: actualMessageString:", JSON.stringify(actualMessageString));
        // console.log("DEBUG_ASSERT: expectedSubstringString:", JSON.stringify(expectedSubstringString));
        const indexOfResult = actualMessageString.indexOf(expectedSubstringString);
        // console.log("DEBUG_ASSERT: indexOfResult:", indexOfResult);
        const includesResult = actualMessageString.includes(expectedSubstringString);
        // console.log("DEBUG_ASSERT: includesResult:", includesResult);
        // END DEBUG LOGS

        assertStringIncludes(
            actualMessageString,
            expectedSubstringString,
            `Expected logger error message "${actualMessageString}" to include substring "${expectedSubstringString}"`
        );

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - No AI models selected", async () => {
    const mockAuthToken = "test-auth-token-no-models-sel";
    const mockSessionId = "test-session-id-no-models-sel";
    const mockProjectId = "project-id-no-models-sel";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    // Payload indicates some models, but the session data will have none.
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId, 
        selectedModelCatalogIds: ["m-id-from-payload"] // This is for payload, session will have []
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageData: DialecticStage = { 
        id: 'stage-id-no-models', 
        slug: mockStageSlug, 
        display_name: "Thesis", 
        description: "Test", 
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: {},
        input_artifact_rules: {}
    };
    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_${mockStageSlug}`,
        associated_chat_id: "any-chat-id-no-models",
        selected_model_catalog_ids: [], // Key for this test: no models selected
        iteration_count: 0,
    };
    const mockProjectData = { 
        id: mockProjectId,
        user_id: "owner-user-id-no-models-sel",
    };
    const mockSeedPromptContent = "Seed prompt content for no models test.";

    const { client: mockDbClientUntyped, clientSpies, getHistoricBuildersForTable } = createMockSupabaseClient("test-user-no-models-sel", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            }
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;

    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ 
        data: new TextEncoder().encode(mockSeedPromptContent).buffer as ArrayBuffer, 
        error: null 
    }));    

    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger, 
        downloadFromStorage: mockDownloadFromStorageSpy, // This will be called successfully
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)), // Not called
        getExtensionFromMimeType: spy(() => ".txt"), // Not called
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy((context: PathContext) => `mock/path/for/${context.fileType}`),
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})),
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "No models selected for this session.");
        assertEquals(result.error?.status, 400);
        assertEquals(result.error?.code, 'NO_MODELS_SELECTED');

        // Verify DB calls
        assertEquals(clientSpies.fromSpy.calls.length, 3, "Expected calls to stages, sessions, projects");
        assertEquals(clientSpies.fromSpy.calls?.[0]?.args?.[0], 'dialectic_stages');
        assertEquals(clientSpies.fromSpy.calls?.[1]?.args?.[0], 'dialectic_sessions');
        assertEquals(clientSpies.fromSpy.calls?.[2]?.args?.[0], 'dialectic_projects');

        // Verify downloadFromStorage was called
        assertEquals(mockDownloadFromStorageSpy.calls.length, 1);
        const downloadArgs = mockDownloadFromStorageSpy.calls[0].args;
        assertExists(downloadArgs, "downloadArgs should exist");
        assertEquals(downloadArgs.length, 3, "downloadFromStorageSpy should be called with 3 arguments");
        assertEquals(downloadArgs?.[1], 'dialectic-contributions'); // bucket name
        const expectedSeedPath = `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt.md`;
        assertEquals(downloadArgs?.[2], expectedSeedPath); // Path

        // Verify other operations were NOT called
        const callUnifiedAIModelSpy = partialDepsForTest.callUnifiedAIModel as Stub;
        assertEquals(callUnifiedAIModelSpy.calls.length, 0);
        const fileManagerUploadSpy = (partialDepsForTest.fileManager as IFileManager).uploadAndRegisterFile as Stub;
        assertEquals(fileManagerUploadSpy.calls.length, 0);

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Fetching seed prompt from: ${expectedSeedPath}`)));
        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && 
            call.args[0].includes(`No models selected for session ${mockSessionId}`)
        ));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - CallUnifiedAIModel returns an error", async () => {
    const mockAuthToken = "test-auth-token-ai-call-fail";
    const mockSessionId = "test-session-id-ai-call-fail";
    const mockProjectId = "project-id-ai-call-fail";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockModelCatalogId = "m-id-ai-fail";
    const mockAiProviderApiIdentifier = "api-id-ai-fail";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId, 
        selectedModelCatalogIds: [mockModelCatalogId] 
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageData: DialecticStage = { 
        id: 'stage-id-ai-fail', 
        slug: mockStageSlug, 
        display_name: "Thesis Stage AI Fail", 
        description: "Test AI call failure", 
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: {},
        input_artifact_rules: {}
    };
    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_${mockStageSlug}`,
        associated_chat_id: "chat-id-ai-fail",
        selected_model_catalog_ids: [mockModelCatalogId], 
        iteration_count: mockIterationNumber - 1,
    };
    const mockProjectData = { 
        id: mockProjectId,
        user_id: "owner-user-id-ai-fail",
    };
    const mockAiProviderData = {
        id: mockModelCatalogId, 
        provider: "mockProviderAiFail", 
        name: "MockModelAiFail", 
        api_identifier: mockAiProviderApiIdentifier
    };
    const mockSeedPromptContent = "Seed prompt for AI call failure test.";
    const aiErrorDetails = { 
        error: "Simulated AI Provider Error", 
        errorCode: "AI_PROVIDER_ERROR", 
        inputTokens: 5, 
        outputTokens: 0, 
        processingTimeMs: 50 
    };

    const { client: mockDbClientUntyped, clientSpies, getHistoricBuildersForTable } = createMockSupabaseClient("test-user-ai-fail", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' }; // Ensure this returns successfully
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found mock (should not happen in this test)", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'ai_providers': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockModelCatalogId)) {
                        return { data: [mockAiProviderData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "AI Provider not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            }
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;

    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ 
        data: new TextEncoder().encode(mockSeedPromptContent).buffer as ArrayBuffer, 
        error: null 
    }));
    const mockCallUnifiedAISpy = spy(async (_modelId: string, _prompt: string, _chatId: string | null | undefined, _authToken: string): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: null, // AI call fails
        ...aiErrorDetails
    }));
    // This spy is for the fileManager dependency, it should NOT be called in this test.
    const mockFileManagerUploadSpy = spy(async (_uploadContext: any) => Promise.resolve({ 
        record: null, // No record created due to error
        error: new Error("uploadAndRegisterFile should not be called in AI fail test") // Key for this test
    }));

    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy,
        callUnifiedAIModel: mockCallUnifiedAISpy, // Key for this test
        randomUUID: spy(() => "contrib-uuid-ai-fail"), 
        getExtensionFromMimeType: spy(() => ".md"), 
        fileManager: {
            uploadAndRegisterFile: mockFileManagerUploadSpy,
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy((context: PathContext) => `mock/path/for/${context.fileType}`),
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})), 
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error, "Error object should exist");
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);
        assertExists(result.error?.details, "Error details should exist");
        assert(Array.isArray(result.error.details), "Error details should be an array");
        assertEquals(result.error.details.length, 1);
        // Ensure all AI error details are checked
        assertObjectMatch(result.error.details[0] as unknown as Record<string,unknown>, {
            modelId: mockModelCatalogId,
            modelName: mockAiProviderData.name,
            providerName: mockAiProviderData.provider,
            error: aiErrorDetails.error,
            code: aiErrorDetails.errorCode,
            inputTokens: aiErrorDetails.inputTokens,
            outputTokens: aiErrorDetails.outputTokens,
            processingTimeMs: aiErrorDetails.processingTimeMs
        });

        // Verify DB calls (stages, sessions, projects, ai_providers, session update)
        assertEquals(clientSpies.fromSpy.calls.length, 5, "Expected DB interactions for stages, sessions, projects, ai_providers, and session update");

        // Verify downloadFromStorage and callUnifiedAIModel were called
        assertEquals(mockDownloadFromStorageSpy.calls.length, 1);
        assertEquals(mockCallUnifiedAISpy.calls.length, 1);
        const callAIArgs = mockCallUnifiedAISpy.calls[0].args;
        assertExists(callAIArgs, "callAIArgs should exist");
        assertEquals(callAIArgs.length, 4, "callUnifiedAIModel should be called with at least 4 arguments");
        assertEquals(callAIArgs[0], mockModelCatalogId);
        assertEquals(callAIArgs[1], mockSeedPromptContent);
        assertEquals(callAIArgs[2], mockSessionData.associated_chat_id);
        assertEquals(callAIArgs[3], mockAuthToken);

        // Verify fileManager.uploadAndRegisterFile was NOT called
        assertEquals(mockFileManagerUploadSpy.calls.length, 0);
        
        // Verify session status update call
        const sessionUpdateBuilders = getHistoricBuildersForTable('dialectic_sessions');
        const updateBuilder = sessionUpdateBuilders?.find(b => (b as any)._state.operation === 'update');
        assertExists(updateBuilder, "Session update operation not found");
        const updateSpy = (updateBuilder as any).methodSpies.update as Stub;
        assertEquals(updateSpy.calls.length, 1, "Session update not called once");
        assertObjectMatch(updateSpy.calls[0].args[0] as Record<string,unknown>, { status: `${mockStageSlug}_generation_failed` });

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        // Correct logger assertion for AI error
        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && 
            call.args[0].startsWith(`[generateContributions] Error from callUnifiedAIModel for ${mockAiProviderData.provider} - ${mockAiProviderData.name} (ProviderID: ${mockModelCatalogId}, API_ID: ${mockAiProviderApiIdentifier}):`)
        ));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`All models failed to generate contributions for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - FileManagerService uploadAndRegisterFile fails", async () => {
    const mockAuthToken = "test-auth-token-fm-fail";
    const mockSessionId = "test-session-id-fm-fail";
    const mockProjectId = "project-id-fm-fail";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockModelCatalogId = "m-id-fm-fail";
    const mockAiProviderApiIdentifier = "api-id-fm-fail";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId, 
        selectedModelCatalogIds: [mockModelCatalogId] 
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageData: DialecticStage = { 
        id: 'stage-id-fm-fail', 
        slug: mockStageSlug, 
        display_name: "Thesis Stage FM Fail", 
        description: "Test FM failure", 
        created_at: new Date().toISOString(),
        default_system_prompt_id: null,
        expected_output_artifacts: {},
        input_artifact_rules: {}
    };
    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: `pending_${mockStageSlug}`,
        associated_chat_id: "chat-id-fm-fail",
        selected_model_catalog_ids: [mockModelCatalogId], 
        iteration_count: mockIterationNumber - 1,
    };
    const mockProjectData = { 
        id: mockProjectId,
        user_id: "owner-user-id-fm-fail",
    };
    const mockAiProviderData = {
        id: mockModelCatalogId, 
        provider: "mockProviderFmFail", 
        name: "MockModelFmFail", 
        api_identifier: mockAiProviderApiIdentifier
    };
    const mockSeedPromptContent = "Seed prompt for FM failure test.";
    const mockSuccessfulAiContent = "Successful AI content before FM fails.";
    const fileManagerError = new Error("Simulated FileManagerService failure during upload/DB insert");

    const { client: mockDbClientUntyped, clientSpies, getHistoricBuildersForTable } = createMockSupabaseClient("test-user-fm-fail", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Stage not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Session not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "Project not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            },
            'ai_providers': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockModelCatalogId)) {
                        return { data: [mockAiProviderData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: new PostgrestError({ message: "AI Provider not found mock", code: "PGRST116" }), count: 0, status: 404 };
                }
            }
            // No dialectic_contributions insert mock needed here, as fileManager is mocked to fail before it
        }
    });
    const mockDbClient = mockDbClientUntyped as unknown as SupabaseClient<Database>;

    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ 
        data: new TextEncoder().encode(mockSeedPromptContent).buffer as ArrayBuffer, 
        error: null 
    }));
    const mockCallUnifiedAISpy = spy(async (_modelId: string, _prompt: string, _chatId: string | null | undefined, _authToken: string): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: mockSuccessfulAiContent,
        contentType: "text/markdown",
        error: null, errorCode: null, inputTokens: 10, outputTokens: 20, cost: 0.001, processingTimeMs: 100
    }));
    const mockFileManagerUploadSpy = spy(async (_uploadContext: any) => await Promise.resolve({ 
        record: null, // No record created due to error
        error: fileManagerError // Key for this test
    }));

    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy,
        callUnifiedAIModel: mockCallUnifiedAISpy,
        randomUUID: spy(() => "contrib-uuid-fm-fail"), 
        getExtensionFromMimeType: spy(() => ".md"), 
        fileManager: {
            uploadAndRegisterFile: mockFileManagerUploadSpy,
            deleteFileRecord: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            deleteFileFromStorageOnly: spy(async () => Promise.resolve({ error: new Error("Should not be called") })),
            constructPath: spy((context: PathContext) => `mock/path/for/${context.fileType}`),
            downloadFile: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})), 
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error, "Error object should exist");
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);
        assertExists(result.error?.details, "Error details should exist");
        assert(Array.isArray(result.error.details), "Error details should be an array");
        assertEquals(result.error.details.length, 1);
        assertObjectMatch(result.error.details[0] as unknown as Record<string,unknown>, {
            modelId: mockModelCatalogId,
            modelName: mockAiProviderData.name,
            providerName: mockAiProviderData.provider,
            error: fileManagerError.message,
            code: 'FILE_MANAGER_ERROR',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100
        });

        // Verify DB calls (stages, sessions, projects, ai_providers, session update)
        assertEquals(clientSpies.fromSpy.calls.length, 5, "Expected DB interactions for stages, sessions, projects, ai_providers, and session update");

        // Verify downloadFromStorage and callUnifiedAIModel were called
        assertEquals(mockDownloadFromStorageSpy.calls.length, 1);
        assertEquals(mockCallUnifiedAISpy.calls.length, 1);

        // Verify fileManager.uploadAndRegisterFile was called
        assertEquals(mockFileManagerUploadSpy.calls.length, 1);
        
        // Verify session status update call
        const sessionUpdateBuilders = getHistoricBuildersForTable('dialectic_sessions');
        const updateBuilder = sessionUpdateBuilders?.find(b => (b as any)._state.operation === 'update');
        assertExists(updateBuilder, "Session update operation not found");
        const updateSpy = (updateBuilder as any).methodSpies.update as Stub;
        assertEquals(updateSpy.calls.length, 1, "Session update not called once");
        assertObjectMatch(updateSpy.calls[0].args[0] as Record<string,unknown>, { status: `${mockStageSlug}_generation_failed` });

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`AI response received from ${mockAiProviderData.provider}`)));
        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && 
            call.args[0].startsWith(`[generateContributions] FileManagerService failed for ${mockAiProviderData.provider} - ${mockAiProviderData.name} (ProviderID: ${mockModelCatalogId}, API_ID: ${mockAiProviderApiIdentifier}):`)
        ));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`All models failed to generate contributions for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});
