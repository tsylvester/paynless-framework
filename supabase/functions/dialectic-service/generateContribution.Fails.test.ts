import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateStageContributions } from "./generateContribution.ts";
import type { 
    GenerateStageContributionsPayload, 
    UnifiedAIResponse
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { 
    UploadStorageResult, 
    DeleteStorageResult 
} from "../_shared/supabase_storage_utils.ts"; // Import newly exported types


Deno.test("generateStageContributions - Failure during content upload to storage", async () => {
    const mockAuthToken = "auth-token-upload-fail";
    const mockSessionId = "session-id-upload-fail";
    const mockProjectId = "project-id-upload-fail";
    const mockChatId = "chat-id-upload-fail";
    const mockInitialPrompt = "Prompt for upload fail";
    const mockModelProviderId = "mp-id-upload-fail";
    const mockSessionModelId = "sm-id-upload-fail";
    const mockApiIdentifier = "api-id-upload-fail";
    const mockProviderName = "ProvUploadFail";
    const mockModelName = "ModUploadFail";
    const mockContributionId = "uuid-upload-fail";

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { /* ... standard session data ... */ 
            id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                { id: mockSessionModelId, model_id: mockModelProviderId, ai_providers: { id: mockModelProviderId, provider_name: mockProviderName, model_name: mockModelName, api_identifier: mockApiIdentifier } }
            ]
        },
        error: null
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: spy(() => ({eq: spy(async () => Promise.resolve({error: null}))})) };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: "Some AI content", error: null, errorCode: null, inputTokens: 1, outputTokens: 1, cost: 0.0001, processingTimeMs: 10
    }));
    const mockUploadToStorage = spy(async (db: any, bucket: string, path: string, body:any, opts:any): Promise<UploadStorageResult> => {
        if (path.includes("thesis.md")) { // Fail only content upload
            return await Promise.resolve({ error: new Error("Simulated storage upload failure"), path: null });
        }
        return await Promise.resolve({ error: null, path }); // Allow raw response upload
    });

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        uploadToStorage: mockUploadToStorage,
        getFileMetadata: spy(async () => await Promise.resolve({ size: 0, error: null })), // Won't be called if upload fails
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })), // Cleanup might be called
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assert(result.error?.details?.includes("Failed to upload contribution content."));

        assertEquals(mockDeps.callUnifiedAIModel.calls.length, 1);
        assertEquals(mockDeps.uploadToStorage.calls.length, 1); // Attempted content upload
        assertEquals(mockDeps.getFileMetadata.calls.length, 0);
        assertEquals(mockDeps.deleteFromStorage.calls.length, 0); // No cleanup if no db insert was attempted
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Failed to upload content for")));
    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - Failure during raw response upload (should warn, contribution proceeds)", async () => {
    const mockAuthToken = "auth-token-raw-upload-warn";
    const mockSessionId = "session-id-raw-upload-warn";
    const mockProjectId = "project-id-raw-upload-warn";
    const mockChatId = "chat-id-raw-upload-warn";
    const mockInitialPrompt = "Prompt for raw upload warn";
    const mockModelProviderId = "mp-id-raw-upload-warn";
    const mockSessionModelId = "sm-id-raw-upload-warn";
    const mockApiIdentifier = "api-id-raw-upload-warn";
    const mockProviderName = "ProvRawWarn";
    const mockModelName = "ModRawWarn";
    const mockContributionId = "uuid-raw-warn";
    const mockContent = "AI content for raw warn test";
    const mockFileSize = 123;

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { /* ... standard session data ... */ 
            id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                { id: mockSessionModelId, model_id: mockModelProviderId, ai_providers: { id: mockModelProviderId, provider_name: mockProviderName, model_name: mockModelName, api_identifier: mockApiIdentifier } }
            ]
        }, error: null
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    let capturedInsertArg: any = null;
    const mockContributionInsertSelectSingleSpy = spy(async () => await Promise.resolve({ data: { id: mockContributionId, ...capturedInsertArg }, error: null }));
    const mockContributionInsertSelectSpy = spy(() => ({ single: mockContributionInsertSelectSingleSpy }));
    const mockContributionInsertSpy = spy((data: any) => { capturedInsertArg = data; return { select: mockContributionInsertSelectSpy }; });

    const mockSessionUpdateEqSpy = spy<[string, string], Promise<{error: Error | null}>>(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy<[Partial<Database['public']['Tables']['dialectic_sessions']['Update']>] , { eq: Stub }>(() => ({ eq: mockSessionUpdateEqSpy as Stub }));

    const mockDbClientFromSpy = spy((tableName: string) => {
        if (tableName === 'dialectic_sessions') {
            // This needs to handle the initial select AND the final update.
            // A more robust mock would inspect the operation (select vs update) or use call order.
            // Crude approach: if update spy hasn't been called, it's a select, else it's an update.
            if (mockSessionUpdateSpy.calls.length === 0) { 
                return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy }; 
            }
            return { update: mockSessionUpdateSpy, select: mockSessionSelectSpy }; 
        }
        if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
        return { select: spy(), insert: spy(), update: spy() };
    });
    const mockDbClient: any = { from: mockDbClientFromSpy };

    // Dependency Mocks
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: mockContent, 
        error: null, 
        errorCode: null, 
        inputTokens:1, 
        outputTokens:1, 
        cost:0.001, 
        processingTimeMs:10, 
        rawProviderResponse: {}
    }));

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, true); // Still returns success as contributions were made
        assertExists(result.data);
        assertEquals(result.data?.contributions?.length, 1);
        assertEquals(result.data?.status, 'stage_generation_complete'); // Status reflects attempted update

        assertEquals(mockSessionUpdateSpy.calls.length, 1);
        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && call.args[0].includes("CRITICAL: Failed to update session status for") &&
            typeof call.args[0] === 'string' && call.args[0].includes("but contributions were made")
        ));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - getFileMetadata fails or returns no size", async () => {
    // ... (similar setup to happy path, but mockGetFileMetadata returns error or no size) ...
    const mockAuthToken = "auth-token-meta-fail";
    const mockSessionId = "session-id-meta-fail";
    const mockProjectId = "project-id-meta-fail";
    const mockChatId = "chat-id-meta-fail";
    const mockInitialPrompt = "Prompt for meta fail";
    const mockModelProviderId = "mp-id-meta-fail";
    const mockSessionModelId = "sm-id-meta-fail";
    const mockApiIdentifier = "api-id-meta-fail";
    const mockProviderName = "ProvMetaFail";
    const mockModelName = "ModMetaFail";
    const mockContributionId = "uuid-meta-fail";
    const mockContent = "AI content for meta fail test";

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({ /* ... session data ... */ 
        data: { id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                { id: mockSessionModelId, model_id: mockModelProviderId, ai_providers: { id: mockModelProviderId, provider_name: mockProviderName, model_name: mockModelName, api_identifier: mockApiIdentifier } }
            ]
        }, error: null
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    let capturedInsertArg: any = null;
    const mockContributionInsertSelectSingleSpy = spy(async () => await Promise.resolve({ data: { id: mockContributionId, ...capturedInsertArg }, error: null }));
    const mockContributionInsertSelectSpy = spy(() => ({ single: mockContributionInsertSelectSingleSpy }));
    const mockContributionInsertSpy = spy((data: any) => { capturedInsertArg = data; return { select: mockContributionInsertSelectSpy }; });

    const mockSessionUpdateEqSpy = spy<[string, string], Promise<{error: Error | null}>>(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy<[Partial<Database['public']['Tables']['dialectic_sessions']['Update']>] , { eq: Stub }>(() => ({ eq: mockSessionUpdateEqSpy as Stub }));

    const mockDbClientFromSpy = spy((tableName: string) => {
        if (tableName === 'dialectic_sessions') {
             if (mockSessionUpdateSpy.calls.length === 0) { 
                return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy }; 
            }
            return { update: mockSessionUpdateSpy, select: mockSessionSelectSpy }; 
        }
        if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
        return { select: spy(), insert: spy(), update: spy() };
    });
    const mockDbClient: any = { from: mockDbClientFromSpy };

    // Test two scenarios for getFileMetadata: 1. returns error, 2. returns no size
    const mockGetFileMetadataError = spy(async () => await Promise.resolve({ error: new Error("Simulated metadata fetch error"), size: undefined }));
    const mockGetFileMetadataNoSize = spy(async () => await Promise.resolve({ error: null, size: undefined }));

    const commonDeps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({
            content: mockContent, error: null, errorCode: null, inputTokens: 1, outputTokens: 1, cost: 0.0001, processingTimeMs: 10
        })),
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy_path" })),
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    // Scenario 1: getFileMetadata returns error
    try {
        const resultError = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, { ...commonDeps, getFileMetadata: mockGetFileMetadataError });
        assertEquals(resultError.success, true); // Should still succeed, size defaults to 0
        assertExists(resultError.data?.contributions?.[0]);
        assertEquals(resultError.data?.contributions?.[0].content_size_bytes, 0);
        assert(localLoggerWarn.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Could not get file metadata")));
    } finally {
        mockGetFileMetadataError.calls = []; // Reset calls for spy
        localLoggerWarn.calls = []; // Reset calls for spy
    }
    
    // Scenario 2: getFileMetadata returns no size
    try {
        const resultNoSize = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, { ...commonDeps, getFileMetadata: mockGetFileMetadataNoSize });
        assertEquals(resultNoSize.success, true); // Should still succeed, size defaults to 0
        assertExists(resultNoSize.data?.contributions?.[0]);
        assertEquals(resultNoSize.data?.contributions?.[0].content_size_bytes, 0);
        assert(localLoggerWarn.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Could not get file metadata")));
    } finally {
        // Restore spies or reset calls if necessary for subsequent tests
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - DB insertion for contribution fails (verify storage cleanup)", async () => {
    // ... (similar setup to happy path, but mock DB insert fails) ...
    const mockAuthToken = "auth-token-db-insert-fail";
    const mockSessionId = "session-id-db-insert-fail";
    const mockProjectId = "project-id-db-insert-fail";
    const mockChatId = "chat-id-db-insert-fail";
    const mockInitialPrompt = "Prompt for DB insert fail";
    const mockModelProviderId = "mp-id-db-insert-fail";
    const mockSessionModelId = "sm-id-db-insert-fail";
    const mockApiIdentifier = "api-id-db-insert-fail";
    const mockProviderName = "ProvDbFail";
    const mockModelName = "ModDbFail";
    const mockContributionId = "uuid-db-fail";
    const mockContent = "AI content for DB fail";
    const mockContentPath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/thesis.md`;
    const mockRawPath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_thesis_response.json`;

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({ /* ... session data ... */ 
        data: { id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                { id: mockSessionModelId, model_id: mockModelProviderId, ai_providers: { id: mockModelProviderId, provider_name: mockProviderName, model_name: mockModelName, api_identifier: mockApiIdentifier } }
            ]
        }, error: null
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockContributionInsertSpy = spy(() => ({
        select: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: null, error: { message: "Simulated DB insert error", code: "DB_ERROR" } }))
        }))
    }));

    const mockSessionUpdateEqSpy = spy<[string, string], Promise<{error: Error | null}>>(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy<[Partial<Database['public']['Tables']['dialectic_sessions']['Update']>] , { eq: Stub }>(() => ({ eq: mockSessionUpdateEqSpy as Stub }));

    const mockDbClientFromSpy = spy((tableName: string) => {
        if (tableName === 'dialectic_sessions') {
            // This needs to handle the initial select AND the final update.
            // A more robust mock would inspect the operation (select vs update) or use call order.
            // Crude approach: if update spy hasn't been called, it's a select, else it's an update.
            if (mockSessionUpdateSpy.calls.length === 0) { 
                return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy }; 
            }
            return { update: mockSessionUpdateSpy, select: mockSessionSelectSpy }; 
        }
        if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
        return { select: spy(), insert: spy(), update: spy() };
    });
    const mockDbClient: any = { from: mockDbClientFromSpy };

    const mockDeps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: mockContent, error: null, errorCode: null, inputTokens:1, outputTokens:1, cost:0.001, processingTimeMs:10, rawProviderResponse: {} })),
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy_path" })),
        getFileMetadata: spy(async () => await Promise.resolve({ size: 0, error: null })),
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assert(result.error?.details?.includes("Failed to insert contribution into database."));

        assertEquals(mockContributionInsertSpy.calls.length, 1);
        assertEquals(mockDeps.deleteFromStorage.calls.length, 2); // Cleanup called for content and raw response
        if (mockDeps.deleteFromStorage.calls.length === 2) {
            assertObjectMatch(mockDeps.deleteFromStorage.calls[0].args[2] as string[], [mockContentPath]);
            assertObjectMatch(mockDeps.deleteFromStorage.calls[1].args[2] as string[], [mockRawPath]);
        }
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Error inserting contribution to DB for")));
        assert(localLoggerWarn.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Attempting to clean up storage for failed DB insert")));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - Final session status update fails (critical log)", async () => {
    // ... (similar to happy path, but mock session update fails) ...
    const mockAuthToken = "auth-token-status-update-fail";
    const mockSessionId = "session-id-status-update-fail";
    const mockProjectId = "project-id-status-update-fail";
    const mockChatId = "chat-id-status-update-fail";
    const mockInitialPrompt = "Prompt for status update fail";
    const mockModelProviderId = "mp-id-status-update-fail";
    const mockSessionModelId = "sm-id-status-update-fail";
    const mockApiIdentifier = "api-id-status-update-fail";
    const mockProviderName = "ProvStatusFail";
    const mockModelName = "ModStatusFail";
    const mockContributionId = "uuid-status-fail";
    const mockContent = "AI content for status fail";
    const mockFileSize = 77;

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({ /* ... session data ... */ 
        data: { id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                { id: mockSessionModelId, model_id: mockModelProviderId, ai_providers: { id: mockModelProviderId, provider_name: mockProviderName, model_name: mockModelName, api_identifier: mockApiIdentifier } }
            ]
        }, error: null
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    let capturedInsertArg: any = null;
    const mockContributionInsertSelectSingleSpy = spy(async () => await Promise.resolve({ data: { id: mockContributionId, ...capturedInsertArg }, error: null }));
    const mockContributionInsertSelectSpy = spy(() => ({ single: mockContributionInsertSelectSingleSpy }));
    const mockContributionInsertSpy = spy((data: any) => { capturedInsertArg = data; return { select: mockContributionInsertSelectSpy }; });

    const mockSessionUpdateEqSpy = spy<[string, string], Promise<{error: Error | null}>>(async () => await Promise.resolve({ error: { message: "Simulated session update failure", code: "DB_UPDATE_FAIL"} })); // Key: Update fails
    const mockSessionUpdateSpy = spy<[Partial<Database['public']['Tables']['dialectic_sessions']['Update']>] , { eq: Stub }>(() => ({ eq: mockSessionUpdateEqSpy as Stub }));

    const mockDbClientFromSpy = spy((tableName: string) => {
        if (tableName === 'dialectic_sessions') {
            // This needs to handle the initial select AND the final update.
            // A more robust mock would inspect the operation (select vs update) or use call order.
            // Crude approach: if update spy hasn't been called, it's a select, else it's an update.
            if (mockSessionUpdateSpy.calls.length === 0) { 
                return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy }; 
            }
            return { update: mockSessionUpdateSpy, select: mockSessionSelectSpy }; 
        }
        if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
        return { select: spy(), insert: spy(), update: spy() };
    });
    const mockDbClient: any = { from: mockDbClientFromSpy };

    const mockDeps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: mockContent, error: null, errorCode: null, inputTokens:1, outputTokens:1, cost:0.001, processingTimeMs:10, rawProviderResponse: {}})),
        uploadToStorage: spy(async (): Promise<UploadStorageResult> => await Promise.resolve({ error: null, path: "dummy_path" })),
        getFileMetadata: spy(async (): Promise<{ size?: number; mimeType?: string; error: Error | null; }> => await Promise.resolve({ size: mockFileSize, mimeType: "text/markdown", error: null })),
        deleteFromStorage: spy(async (): Promise<DeleteStorageResult> => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy((_mimeType: string): string => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, true); // Still returns success as contributions were made
        assertExists(result.data);
        assertEquals(result.data?.contributions?.length, 1);
        assertEquals(result.data?.status, 'thesis_generation_complete'); // Status reflects attempted update

        assertEquals(mockSessionUpdateSpy.calls.length, 1);
        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && call.args[0].includes("CRITICAL: Failed to update session status for") &&
            typeof call.args[0] === 'string' && call.args[0].includes("but contributions were made")
        ));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});
