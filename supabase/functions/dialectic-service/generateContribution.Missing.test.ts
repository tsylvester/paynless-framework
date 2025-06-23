import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Spy, type Stub } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions, type GenerateContributionsDeps } from "./generateContribution.ts";
import type { 
    GenerateContributionsPayload, 
    UnifiedAIResponse,
    DialecticStage
} from "./dialectic.interface.ts";
import { logger } from "../_shared/logger.ts";
import { createMockSupabaseClient, type MockPGRSTError, type IMockQueryBuilder } from "../_shared/supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import type { IFileManager } from "../_shared/types/file_manager.types.ts";

// Define a type for the spy call arguments for better readability
type SpyCall = { args: unknown[] };

Deno.test("generateContributions - Project owner details not found", async () => {
    const mockAuthToken = "test-auth-token-proj-owner-fail";
    const mockSessionId = "test-session-id-proj-owner-fail";
    const mockProjectId = "project-id-proj-owner-fail";
    const mockStageSlug = 'thesis';
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

    const mockSupabase = createMockSupabaseClient("test-user-id-owner-fail", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Stage not found mock", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Session not found mock", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_projects': { // Key for this test: this fetch fails
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        // Simulate project found, but user_id is null (or return error directly)
                        // return { data: [{ user_id: null }], error: null, count: 1, status: 200, statusText: 'OK' }; 
                        // OR Simulate error fetching project
                        return { data: null, error: { name: 'MockPGRSTError', message: "Simulated DB error fetching project owner", code: "XXYYZ", details: "", hint: "" }, count: 0, status: 500, statusText: 'Internal Server Error' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Project not found mock (owner check)", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    });
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger, // Using the spied real logger
        // Other deps not expected to be called before this failure point
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        downloadFromStorage: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        getExtensionFromMimeType: spy(() => ".txt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
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

        assertEquals(mockSupabase.spies.fromSpy.calls.length, 3);
        assertEquals(mockSupabase.spies.fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(mockSupabase.spies.fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(mockSupabase.spies.fromSpy.calls[2].args[0], 'dialectic_projects');
        
        const projectSelectSpy = mockSupabase.client.getSpiesForTableQueryMethod('dialectic_projects', 'select');
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.calls[0].args[0], 'user_id');

        const callUnifiedAIModelSpy = partialDepsForTest.callUnifiedAIModel as Stub;
        assertEquals(callUnifiedAIModelSpy.calls.length, 0);
        const downloadFromStorageSpy = partialDepsForTest.downloadFromStorage as Stub;
        assertEquals(downloadFromStorageSpy.calls.length, 0);

        assert(localLoggerInfo.calls.some((call: SpyCall) => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some((call: SpyCall) => typeof call.args[0] === 'string' && call.args[0].includes(`Error fetching project owner user_id for project ${mockProjectId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
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

    const mockProjectResourceSeedFail: Database['public']['Tables']['dialectic_project_resources']['Row'] = {
        // Required fields, adapt as necessary, especially resource_description
        id: 'resource-id-seed-fail',
        project_id: mockProjectId,
        storage_bucket: 'dialectic-private-resources',
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt_to_fail_download.md`,
        file_name: 'seed_prompt_to_fail_download.md',
        mime_type: 'text/markdown',
        size_bytes: 123,
        resource_description: JSON.stringify({ 
            type: "seed_prompt", 
            session_id: mockSessionId, 
            stage_slug: mockStageSlug, 
            iteration: mockIterationNumber 
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: "test-owner-user-id-seed-fail", // or null if appropriate
        // aiconfig_id: null, // if you have this column
        // metadata: null, // if you have this column
    };

    const mockSupabase = createMockSupabaseClient("test-user-id-seed-fail", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Stage not found mock", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Session not found mock", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId && state.selectColumns === 'user_id')) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Project not found mock", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_project_resources': { // Ensure this is added/updated
                select: async (state) => {
                    // Check if the query is for the specific project_id
                    if (state.filters.some(f => f.column === 'project_id' && f.value === mockProjectId)) {
                        // And if the query selects the necessary columns for finding the seed prompt
                        if (state.selectColumns?.includes('resource_description')) {
                             return { data: [mockProjectResourceSeedFail], error: null, count: 1, status: 200, statusText: 'OK' };
                        }
                    }
                    // Default fallback if needed, or stricter error if not expected
                    return { data: [], error: null, count: 0, status: 200, statusText: 'OK' }; // Default to empty if no specific match
                }
            }
        }
    });
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

    const mockDownloadError = new Error("Simulated storage download failure");
    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ data: null, error: mockDownloadError }));
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy,
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        getExtensionFromMimeType: spy(() => ".txt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
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

        assertEquals(mockSupabase.spies.fromSpy.calls.length, 4); // Increment count due to dialectic_project_resources call
        assertEquals(mockSupabase.spies.fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(mockSupabase.spies.fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(mockSupabase.spies.fromSpy.calls[2].args[0], 'dialectic_projects');
        assertEquals(mockSupabase.spies.fromSpy.calls[3].args[0], 'dialectic_project_resources');
        
        const projectResourceSelectSpy = mockSupabase.client.getSpiesForTableQueryMethod('dialectic_project_resources', 'select');
        assertExists(projectResourceSelectSpy);
        // Add more specific assertions for projectResourceSelectSpy if needed

        const projectSelectSpy = mockSupabase.client.getSpiesForTableQueryMethod('dialectic_projects', 'select');
        assertExists(projectSelectSpy);
        assertEquals(projectSelectSpy.calls[0].args[0], 'user_id');

        const callUnifiedAIModelSpy = partialDepsForTest.callUnifiedAIModel as Stub;
        assertEquals(callUnifiedAIModelSpy.calls.length, 0);
        const downloadFromStorageSpy = partialDepsForTest.downloadFromStorage as Stub;
        assertEquals(downloadFromStorageSpy.calls.length, 1); // Should be 1 as download is attempted and fails

        assert(localLoggerInfo.calls.some((call: SpyCall) => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        // Check for the correct error log related to download failure
        assert(localLoggerError.calls.some((call: SpyCall) => {
            const arg = call.args[0] as string;
            return typeof arg === 'string' && 
                   arg.includes(`Failed to download seed prompt from bucket`) && 
                   arg.includes(mockProjectResourceSeedFail.storage_bucket) && 
                   arg.includes(mockProjectResourceSeedFail.storage_path);
        }));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Seed prompt is empty string", async () => {
    const mockAuthToken = "test-auth-token-empty-prompt";
    const mockSessionId = "test-session-id-empty-prompt";
    const mockProjectId = "project-id-empty-prompt";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId, 
        stageSlug: mockStageSlug, 
        iterationNumber: mockIterationNumber, 
        projectId: mockProjectId, 
        selectedModelCatalogIds: ["m-id-empty-prompt"] 
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');
    
    const mockStageData: DialecticStage = { id: 'stage-id-empty', slug: mockStageSlug, display_name: "Thesis", description: "Test", created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: {}, input_artifact_rules: {} };
    const mockSessionData = { id: mockSessionId, project_id: mockProjectId, status: `pending_${mockStageSlug}`, associated_chat_id: "any-chat-id-empty", selected_model_catalog_ids: ["m-id-empty-prompt"], iteration_count: 0 };
    const mockProjectData = { id: mockProjectId, user_id: "test-owner-user-id-empty" };
    const mockProjectResourceDataEmpty = { storage_bucket: 'dialectic-private-resources', storage_path: 'path/to/empty_seed.md', file_name: 'empty_seed.md', resource_description: JSON.stringify({ type: "seed_prompt", session_id: mockSessionId, stage_slug: mockStageSlug, iteration: mockIterationNumber }) };


    const mockSupabase = createMockSupabaseClient("test-user-id-empty-prompt", {
        genericMockResults: {
            'dialectic_stages': { select: async () => ({ data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'dialectic_sessions': { select: async () => ({ data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'dialectic_projects': { select: async () => ({ data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'dialectic_project_resources': { select: async () => ({ data: [mockProjectResourceDataEmpty], error: null, count: 1, status: 200, statusText: 'OK' }) }
        }
    });
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

    const mockEmptyPrompt = "";
    const mockDownloadFromStorageSpy = spy(async () => await Promise.resolve({ data: new TextEncoder().encode(mockEmptyPrompt).buffer as ArrayBuffer, error: null }));
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy,
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        getExtensionFromMimeType: spy(() => ".md"),
        randomUUID: spy(() => "contrib-uuid-empty-prompt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
        } as IFileManager,
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "Rendered seed prompt is empty. Cannot proceed.");
        assertEquals(result.error?.status, 400);
        assertEquals(result.error?.code, 'EMPTY_SEED_PROMPT');

        const callUnifiedAIModelSpy = partialDepsForTest.callUnifiedAIModel as Stub;
        assertEquals(callUnifiedAIModelSpy.calls.length, 0);
        
        assert(localLoggerError.calls.some((call: SpyCall) => typeof call.args[0] === 'string' && call.args[0].includes("Rendered seed prompt is empty for session")));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - Success with associated_chat_id", async () => {
    const mockAuthToken = "test-auth-token-chatid-success";
    const mockSessionId = "test-session-id-chatid-success";
    const mockProjectId = "project-id-chatid-success";
    const mockStageSlug = 'thesis';
    const mockIterationNumber = 1;
    const mockModelCatalogId = "m-id-chatid-success";
    const mockChatId = "actual-chat-id-for-session"; // Key for this test
    const mockContributionId = "contrib-id-chat-success"; // Defined ID

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

    const mockStageData: DialecticStage = { id: 'stage-id-chat', slug: mockStageSlug, display_name: "Chat Stage", description: "Test chat success", created_at: new Date().toISOString(), default_system_prompt_id: null, expected_output_artifacts: {}, input_artifact_rules: {} };
    const mockSessionDataWithChatId = { id: mockSessionId, project_id: mockProjectId, status: `pending_${mockStageSlug}`, associated_chat_id: mockChatId, selected_model_catalog_ids: [mockModelCatalogId], current_stage_slug: mockStageSlug, current_iteration_number: mockIterationNumber, iteration_count: 0 };
    const mockProjectData = { id: mockProjectId, user_id: "owner-id-chat" };
    const mockAiProviderData = { id: mockModelCatalogId, provider: "mockProvChat", name: "Mock Model Chat Success", api_identifier: "mock-model-chat-api" };
    const mockProjectResourceDataChat = { storage_bucket: 'dialectic-private-resources', storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/iteration_${mockIterationNumber}/${mockStageSlug}/seed_prompt.md`, file_name: 'seed_prompt.md', resource_description: JSON.stringify({ type: "seed_prompt", session_id: mockSessionId, stage_slug: mockStageSlug, iteration: mockIterationNumber }) };
    
    // Define mockSuccessfulContributionRecord (which is what mockContributionDataAfterInsert was trying to be)
    const mockSuccessfulContributionRecord: Database['public']['Tables']['dialectic_contributions']['Row'] = {
        id: mockContributionId,
        session_id: mockSessionId,
        model_id: mockModelCatalogId,
        user_id: mockProjectData.user_id,
        stage: mockStageSlug,
        iteration_number: mockIterationNumber,
        storage_bucket: 'dialectic-contributions', // Standard bucket for contributions
        storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/${mockStageSlug}.md`,
        mime_type:"text/markdown",
        size_bytes: 100, // Example size
        raw_response_storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_${mockStageSlug}_response.json`,
        tokens_used_input:10,
        tokens_used_output:20,
        processing_time_ms:150,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        edit_version:1,
        is_latest_edit:true,
        file_name:`${mockStageSlug}.md`,
        contribution_type: mockStageSlug,
        model_name: mockAiProviderData.name,
        original_model_contribution_id: null,
        error: null,
        citations: null,
        prompt_template_id_used: null,
        seed_prompt_url: mockProjectResourceDataChat.storage_path,
        target_contribution_id: null,
    };

    const mockSupabase = createMockSupabaseClient("test-user-chatid-success", {
        genericMockResults: {
            'dialectic_stages': { select: async () => ({ data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'dialectic_sessions': { 
                select: async () => ({ data: [mockSessionDataWithChatId], error: null, count: 1, status: 200, statusText: 'OK' }),
                update: async () => ({ data: [{id: mockSessionId, status: `${mockStageSlug}_generation_complete`, iteration_count: mockIterationNumber }], error: null, count: 1, status: 200, statusText: 'OK' })
            },
            'dialectic_projects': { select: async () => ({ data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'ai_providers': { select: async () => ({ data: [mockAiProviderData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'dialectic_project_resources': { select: async () => ({ data: [mockProjectResourceDataChat], error: null, count: 1, status: 200, statusText: 'OK'}) }
        }
    });
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;
    
    const mockSeedPromptContent = "Seed content for chat ID test.";
    const mockAiResponseContent = "AI Responds with ChatID for success test";

    // Explicitly type the return for downloadFromStorage spy
    const mockDownloadFromStorageSpy = spy(async (): Promise<{ data: ArrayBuffer | null, error: Error | null }> => {
        return await Promise.resolve({ data: new TextEncoder().encode(mockSeedPromptContent).buffer as ArrayBuffer, error: null });
    });

    const mockCallUnifiedAISpy = spy(async () => Promise.resolve({ content: mockAiResponseContent, contentType: "text/markdown", error: null, inputTokens:10, outputTokens:20, cost:0.01, processingTimeMs:100, rawProviderResponse: {} }));
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy as any, // Cast to any to bypass complex spy typing for now
        callUnifiedAIModel: mockCallUnifiedAISpy,
        getExtensionFromMimeType: spy(() => ".md"),
        randomUUID: spy(() => mockContributionId), // Use defined ID
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: mockSuccessfulContributionRecord, error: null })),
        } as IFileManager,
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data?.contributions?.length, 1);
        assertEquals(result.data?.contributions?.[0].id, mockContributionId);
        assertEquals(result.data?.status, `${mockStageSlug}_generation_complete`);

        assertEquals(mockCallUnifiedAISpy.calls.length, 1);
        const callAIArgs = (mockCallUnifiedAISpy.calls[0] as SpyCall).args;
        assertEquals(callAIArgs[0], mockModelCatalogId);
        assertEquals(callAIArgs[1], mockSeedPromptContent);
        assertEquals(callAIArgs[2], mockChatId);
        assertEquals(callAIArgs[3], mockAuthToken);

        const fromCalls = mockSupabase.spies.fromSpy.calls;
        assert(fromCalls.some((call: SpyCall) => call.args[0] === 'dialectic_stages'), "dialectic_stages was not called");
        assert(fromCalls.some((call: SpyCall) => call.args[0] === 'dialectic_sessions'), "dialectic_sessions select was not called");
        assert(fromCalls.some((call: SpyCall) => call.args[0] === 'dialectic_projects'), "dialectic_projects was not called");
        assert(fromCalls.some((call: SpyCall) => call.args[0] === 'ai_providers'), "ai_providers was not called");
        assert(fromCalls.some((call: SpyCall) => call.args[0] === 'dialectic_project_resources'), "dialectic_project_resources was not called");

        const sessionTableInteractions = mockSupabase.client.getHistoricBuildersForTable('dialectic_sessions');
        assertExists(sessionTableInteractions);
        const updateInteraction = sessionTableInteractions.find((builder: IMockQueryBuilder) => (builder as any)._state.operation === 'update');
        assertExists(updateInteraction, "Session update was not called");
        
        const updatePayload = (updateInteraction as any)._state.upsertData ?? (updateInteraction as any)._state.updateData; 
        assertObjectMatch(updatePayload as Record<string, unknown>, { status: `${mockStageSlug}_generation_complete`, iteration_count: mockIterationNumber });

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
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

    const mockSupabase = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Stage not found", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Session not found", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Project not found", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    });
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;
    
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

        // Verify calls to Supabase
        // dialectic_stages, dialectic_sessions, dialectic_projects, downloadFromStorage (for seed prompt)
        assertEquals(mockSupabase.spies.fromSpy.calls.length, 3); 
        assertEquals(mockSupabase.spies.fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(mockSupabase.spies.fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(mockSupabase.spies.fromSpy.calls[2].args[0], 'dialectic_projects');

        // downloadFromStorage IS NOT called anymore if no models are selected
        assertEquals(mockDownloadFromStorageSpy.calls.length, 0);
        // const downloadArgs = mockDownloadFromStorageSpy.calls[0].args; // Commented out as not needed

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`No models selected for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
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

    const mockSupabase = createMockSupabaseClient("test-user-stage-fail", { // Added getHistoricBuildersForTable
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    // Simulate stage not found
                    return { data: null, error: { name: 'MockPGRSTError', message: "Simulated: Stage not found in DB", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
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
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;
    
    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger, // Using the spied real logger
        // None of the other major deps should be called if stage fetch fails
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        downloadFromStorage: spy(async () => Promise.resolve({ data: null, error: new Error("Should not be called") })),
        getExtensionFromMimeType: spy(() => ".txt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
        } as IFileManager,
        deleteFromStorage: spy(async () => Promise.resolve({data:[], error: null})),
    };

    // Diagnostic log call
    logger.info("TEST MARKER BEFORE generateContributions CALL IN TEST"); 

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "Stage with slug 'non_existent_stage' not found.");
        assertEquals(result.error?.status, 404);
        assertEquals(result.error?.details, "Simulated: Stage not found in DB");

        // Verify calls to Supabase
        assertEquals(mockSupabase.spies.fromSpy.calls.length, 1, "Only dialectic_stages should be queried.");
        assertEquals(mockSupabase.spies.fromSpy.calls[0].args[0], 'dialectic_stages');
        
        const stageSelectSpy = mockSupabase.client.getSpiesForTableQueryMethod('dialectic_stages', 'select');
        assertExists(stageSelectSpy);
        assertEquals(stageSelectSpy.calls[0].args[0], '*');

        // Verify logger calls
        assertEquals(localLoggerInfo.calls.length, 1, "localLoggerInfo should have been called once for the test marker.");
        assert(localLoggerInfo.calls[0].args[0] === "TEST MARKER BEFORE generateContributions CALL IN TEST", "The test marker log was not captured by localLoggerInfo.");

        assertEquals(localLoggerError.calls.length, 1, "localLoggerError should have been called once.");
        const errorCall = localLoggerError.calls[0];
        assertExists(errorCall, "Error call to localLoggerError should exist.");
        assertEquals(errorCall.args.length, 1, "logger.error should have been called with one argument in this path.");

        const loggedErrorMessage = String(errorCall.args[0]);
        const expectedErrorMessage = `[generateContributions] Error fetching stage with slug '${mockStageSlug}': DETAILS: Simulated: Stage not found in DB`;
        assertEquals(loggedErrorMessage, expectedErrorMessage, "Function's logger error message content mismatch.");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - No AI models selected", async () => {
    const mockAuthToken = "test-auth-token-no-models-sel";
    const mockSessionId = "test-session-id-no-models-sel";
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

    const mockSupabase = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            'dialectic_stages': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'slug' && f.value === mockStageSlug)) {
                        return { data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Stage not found", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_sessions': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockSessionId)) {
                        return { data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Session not found", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            },
            'dialectic_projects': {
                select: async (state) => {
                    if (state.filters.some(f => f.column === 'id' && f.value === mockProjectId)) {
                        return { data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                    return { data: null, error: { name: 'MockPGRSTError', message: "Project not found", code: "PGRST116", details: "", hint: "" }, count: 0, status: 404, statusText: 'Not Found' };
                }
            }
        }
    });
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;
    
    const mockDownloadFromStorageSpy = spy(async (_client: SupabaseClient<Database>, _bucket: string, _path: string) => await Promise.resolve({ 
        data: new TextEncoder().encode("seed prompt content").buffer as ArrayBuffer, 
        error: null 
    }));

    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy,
        callUnifiedAIModel: spy(async () => Promise.resolve({} as UnifiedAIResponse)),
        getExtensionFromMimeType: spy(() => ".txt"),
        fileManager: {
            uploadAndRegisterFile: spy(async () => Promise.resolve({ record: null, error: new Error("Should not be called") })),
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

        // Verify calls to Supabase
        // dialectic_stages, dialectic_sessions, dialectic_projects, downloadFromStorage (for seed prompt)
        assertEquals(mockSupabase.spies.fromSpy.calls.length, 3); 
        assertEquals(mockSupabase.spies.fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(mockSupabase.spies.fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(mockSupabase.spies.fromSpy.calls[2].args[0], 'dialectic_projects');

        // downloadFromStorage IS NOT called anymore if no models are selected
        assertEquals(mockDownloadFromStorageSpy.calls.length, 0);
        // const downloadArgs = mockDownloadFromStorageSpy.calls[0].args; // Commented out as not needed

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`No models selected for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test("generateContributions - All models fail (FileManagerService failure)", async () => {
    // Similar to all AI fail, but failure is in FileManagerService for all
    const mockAuthToken = "auth-token-all-fm-fail";
    const mockSessionId = "session-id-all-fm-fail";
    const mockProjectId = "project-id-all-fm-fail";
    const mockStageSlug = 'final_review';
    const mockIterationNumber = 1;
    const model1ToFailFMAll = "m1-all-fm-fail";
    const model2ToFailFMAll = "m2-all-fm-fail";
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: mockIterationNumber, projectId: mockProjectId, selectedModelCatalogIds: [model1ToFailFMAll, model2ToFailFMAll] };
    const localLoggerError = spy(logger, 'error');

    const mockStageData: DialecticStage = { id: 's-all-fm', slug: mockStageSlug, /* ... */ created_at: "now", default_system_prompt_id: null, display_name: "", description: "", expected_output_artifacts: {}, input_artifact_rules: {} };
    const mockSessionData = { id: mockSessionId, project_id: mockProjectId, status: `pending_${mockStageSlug}`, selected_model_catalog_ids: mockPayload.selectedModelCatalogIds, /* ... */ associated_chat_id: "c-all-fm", current_stage_slug: mockStageSlug, current_iteration_number: mockIterationNumber, iteration_count: 0 };
    const mockProjectData = { id: mockProjectId, user_id: "u-all-fm" };
    const mockAiProvider1FMAll = { id: model1ToFailFMAll, provider: "p1fm", name: "M1FM_AllFail", api_identifier: "m1fm-all-api" };
    const mockAiProvider2FMAll = { id: model2ToFailFMAll, provider: "p2fm", name: "M2FM_AllFail", api_identifier: "m2fm-all-api" };
    const mockProjectResourceDataAllFMFail = { storage_bucket: 'b', storage_path: 'p/s.md', file_name: 's.md', resource_description: JSON.stringify({ type: "seed_prompt", session_id: mockSessionId, stage_slug: mockStageSlug, iteration: mockIterationNumber }) };
    const mockFileManagerErrorGeneric = { message: "FM Service failed for this model", code: "FM_GENERIC_ALL_FAIL", name: "FileManagerError" };

    const mockSupabase = createMockSupabaseClient("test-user-all-fm-fail", {
        genericMockResults: {
            'dialectic_stages': { select: async () => ({ data: [mockStageData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'dialectic_sessions': { 
                select: async () => ({ data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' }),
                update: async (state) => { // Expect update to _generation_failed
                    if ((state.updateData as {status: string}).status === `${mockStageSlug}_generation_failed`) {
                        return { data: [{id: mockSessionId, status: `${mockStageSlug}_generation_failed`}], error: null, count: 1, status: 200, statusText: 'OK' };
                    }
                     return { data: null, error: { name: 'MockPGRSTError', message: "Unexpected session update in all_fm_fail test", code:"UNEXPECTED_UPDATE", details:"", hint:""}};
                }
            },
            'dialectic_projects': { select: async () => ({ data: [mockProjectData], error: null, count: 1, status: 200, statusText: 'OK' }) },
            'ai_providers': { 
                select: async (state) => {
                    const modelId = state.filters.find(f => f.column === 'id')?.value;
                    if (modelId === model1ToFailFMAll) return { data: [mockAiProvider1FMAll], error: null, count: 1, status: 200, statusText: 'OK' };
                    if (modelId === model2ToFailFMAll) return { data: [mockAiProvider2FMAll], error: null, count: 1, status: 200, statusText: 'OK' };
                    return { data: null, error: { name: 'MockPGRSTError', message: "Unknown model ID", code:"ERR", details:"", hint:"" } };
                }
            },
            'dialectic_project_resources': { select: async () => ({ data: [mockProjectResourceDataAllFMFail], error: null, count: 1, status: 200, statusText: 'OK' }) }
        }
    });
    const mockDbClient = mockSupabase.client as unknown as SupabaseClient<Database>;
    
    const mockCallUnifiedAISpy = spy(async () => Promise.resolve({ content: "AI Content for FM all_fail test", error: null, inputTokens:1, outputTokens:1, processingTimeMs:10, rawProviderResponse: {} })); // All AI calls succeed
    const mockFileManagerSpy = spy(async () => Promise.resolve({ record: null, error: mockFileManagerErrorGeneric })); // All FM calls fail

    // Correctly define mockDownloadFromStorageSpy for this test
    const mockDownloadFromStorageSpy = spy(async (): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => {
        return await Promise.resolve({ data: new TextEncoder().encode("seed").buffer as ArrayBuffer, error: null });
    });

    const partialDepsForTest: Partial<GenerateContributionsDeps> = {
        logger: logger,
        downloadFromStorage: mockDownloadFromStorageSpy, // Use the defined spy
        callUnifiedAIModel: mockCallUnifiedAISpy,
        getExtensionFromMimeType: spy(() => ".md"),
        randomUUID: spy(() => "uuid-fm-all-fail"), // Can be same as models will fail before insert
        fileManager: { uploadAndRegisterFile: mockFileManagerSpy } as IFileManager,
    };

    try {
        const result = await generateContributions(mockDbClient, mockPayload, mockAuthToken, partialDepsForTest);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertExists(result.error?.details);
        const errorDetails = result.error?.details as { modelId: string, error: string }[]; // Cast to FailedAttemptError[]
        assertEquals(errorDetails.length, 2);
        // Correct assertions to check modelId and the 'error' property of FailedAttemptError
        assert(errorDetails.some(e => e.modelId === model1ToFailFMAll && e.error === mockFileManagerErrorGeneric.message));
        assert(errorDetails.some(e => e.modelId === model2ToFailFMAll && e.error === mockFileManagerErrorGeneric.message));

        assertEquals(mockCallUnifiedAISpy.calls.length, 2);
        assertEquals(mockFileManagerSpy.calls.length, 2);
        
        const sessionUpdateBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_sessions');
        assertExists(sessionUpdateBuilders);
        const updateBuilder = sessionUpdateBuilders.find((b: IMockQueryBuilder) => (b as any)._state.operation === 'update');
        assertExists(updateBuilder, "Session update for failure was not called");
        const updatePayload = (updateBuilder as any)._state.upsertData ?? (updateBuilder as any)._state.updateData;
        assertObjectMatch(updatePayload as Record<string, unknown>, { status: `${mockStageSlug}_generation_failed` });

        assert(localLoggerError.calls.some((call: SpyCall) => typeof call.args[0] === 'string' && call.args[0].includes("All models failed to generate contributions for session")));

    } finally {
        localLoggerError.restore();
        // restore other loggers
        mockSupabase.clearAllStubs?.();
    }
});
