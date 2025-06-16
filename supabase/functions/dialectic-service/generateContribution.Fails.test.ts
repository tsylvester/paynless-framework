import { assertEquals, assertExists, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import { 
    type DialecticStage,
    type GenerateContributionsPayload, 
    type UnifiedAIResponse,
    type FailedAttemptError
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { 
    UploadStorageResult, 
    DeleteStorageResult,
    DownloadStorageResult
} from "../_shared/supabase_storage_utils.ts";

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

Deno.test("generateContributions - Failure during content upload to storage", async () => {
    const mockAuthToken = "auth-token-upload-fail";
    const mockSessionId = "session-id-upload-fail";
    const mockProjectId = "project-id-upload-fail";
    const mockModelProviderId = "mp-id-upload-fail";
    const mockContributionId = "uuid-upload-fail";
    const mockSeedPrompt = "Prompt for upload fail";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockStageSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: mockStage, error: null }))
        }))
    }));

    const mockSessionSelectSpy = spy(() => ({ 
        eq: spy(() => ({ 
            single: spy(async () => await Promise.resolve({
                data: {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    selected_model_catalog_ids: [mockModelProviderId],
                    associated_chat_id: "mock-chat-id-upload-fail",
                },
                error: null
            }))
        }))
    }));
    
    const mockAiProvidersSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({
                data: { id: mockModelProviderId, provider: 'mockProvider', name: 'ProvUploadFail', api_identifier: 'api-id-upload-fail' }, error: null
            }))
        }))
    }));

    const mockSessionUpdateSpy = spy(() => ({
        eq: spy(async () => await Promise.resolve({ error: null }))
    }));

    const mockDbClient = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockAiProvidersSelectSpy };
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

    const mockDownloadFromStorage = spy(async (
        _dbClient: any,
        _bucket: string,
        _path: string,
    ): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));
    
    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel as any,
        uploadToStorage: mockUploadToStorage as any,
        downloadFromStorage: mockDownloadFromStorage,
        getFileMetadata: spy(async () => await Promise.resolve({ size: 0, error: null })), // Won't be called if upload fails
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })), // Cleanup might be called
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        
        const details = result.error?.details as unknown as FailedAttemptError[];
        assert(Array.isArray(details));
        assertEquals(details.length, 1);
        assert(details[0].error.includes("Failed to upload contribution content."));
        assertEquals(details[0].modelId, mockModelProviderId);

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

Deno.test("generateContributions - Failure during raw response upload (should warn, contribution proceeds)", async () => {
    const mockAuthToken = "auth-token-raw-upload-warn";
    const mockSessionId = "session-id-raw-upload-warn";
    const mockProjectId = "project-id-raw-upload-warn";
    const mockModelProviderId = "mp-id-raw-upload-warn";
    const mockContributionId = "uuid-raw-warn";
    const mockContent = "AI content for raw warn test";
    const mockFileSize = 123;
    const mockSeedPrompt = "Prompt for raw upload warn";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockStageSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: mockStage, error: null }))
        }))
    }));

    const mockSessionSelectSpy = spy(() => ({ 
        eq: spy(() => ({ 
            single: spy(async () => await Promise.resolve({
                data: {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    selected_model_catalog_ids: [mockModelProviderId],
                    associated_chat_id: "mock-chat-id-raw-upload-warn",
                }, error: null
            }))
        }))
    }));

    const mockAiProvidersSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({
                data: { id: mockModelProviderId, provider: 'mockProvider', name: 'ProvRawWarn', api_identifier: 'api-id-raw-upload-warn' }, error: null
            }))
        }))
    }));
    
    const mockContributionInsertSpy = spy(() => ({
        select: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: { id: mockContributionId }, error: null }))
        }))
    }));
    
    const mockSessionUpdateSpy = spy(() => ({
        eq: spy(async () => await Promise.resolve({ error: null }))
    }));

    const mockDbClient = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockAiProvidersSelectSpy };
            if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

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

    const mockUploadToStorage = spy(returnsNext([
        // Call 1: Content upload succeeds
        Promise.resolve({ error: null, path: `some/path/${mockContributionId}/thesis.md` }),
        // Call 2: Raw response upload fails
        Promise.resolve({ error: new Error("Simulated raw response upload failure"), path: null }),
    ]));

    const mockDownloadFromStorage = spy(async (
        _dbClient: any,
        _bucket: string,
        _path: string,
    ): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel as any,
        uploadToStorage: mockUploadToStorage as any,
        downloadFromStorage: mockDownloadFromStorage,
        getFileMetadata: spy(async (): Promise<{ size?: number; mimeType?: string; error: Error | null; }> => await Promise.resolve({ size: mockFileSize, mimeType: "text/markdown", error: null })),
        deleteFromStorage: spy(async (): Promise<DeleteStorageResult> => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy((_mimeType: string): string => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, true);
        assertExists(result.data?.contributions);
        assertEquals(result.data?.contributions?.[0].id, mockContributionId);

        assertEquals(mockUploadToStorage.calls.length, 2);
        assertEquals(mockContributionInsertSpy.calls.length, 1);
        
        assert(localLoggerWarn.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Failed to upload raw AI response for")));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - getFileMetadata returns error (should proceed with size 0)", async () => {
    const mockAuthToken = "auth-token-meta-fail";
    const mockSessionId = "session-id-meta-fail-err";
    const mockProjectId = "project-id-meta-fail-err";
    const mockModelProviderId = "mp-id-meta-fail-err";
    const mockContributionId = "uuid-meta-fail-err";
    const mockContent = "AI content for meta fail test";
    const mockSeedPrompt = "Prompt for meta fail";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockStageSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: mockStage, error: null }))
        }))
    }));

    const mockSessionSelectSpy = spy(() => ({ 
        eq: spy(() => ({ 
            single: spy(async () => await Promise.resolve({
                data: {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    selected_model_catalog_ids: [mockModelProviderId],
                    associated_chat_id: "mock-chat-id-meta-fail-err",
                }, error: null
            }))
        }))
    }));
    
    const mockAiProvidersSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({
                data: { id: mockModelProviderId, provider: 'mockProvider', name: 'ProvMetaFail', api_identifier: 'api-id-meta-fail' }, error: null
            }))
        }))
    }));
    
    let capturedInsertArg: any = null;
    const mockContributionInsertSpy = spy((data: any[]) => {
        capturedInsertArg = data[0];
        return {
            select: spy(() => ({
                single: spy(() => {
                    const dataToReturn = { 
                        id: mockContributionId, 
                        ...capturedInsertArg,
                        content_size_bytes: capturedInsertArg?.content_size_bytes ?? 0
                    };
                    return Promise.resolve({ data: dataToReturn, error: null });
                })
            }))
        };
    });

    const mockSessionUpdateSpy = spy(() => ({
        eq: spy(async () => await Promise.resolve({ error: null }))
    }));

    const mockDbClient = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockAiProvidersSelectSpy };
            if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));

    const mockGetFileMetadataError = spy(async () => await Promise.resolve({ error: new Error("Simulated metadata fetch error"), size: undefined }));

    const deps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({
            content: mockContent, error: null, errorCode: null, inputTokens: 1, outputTokens: 1, cost: 0.0001, processingTimeMs: 10
        })) as any,
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy_path" })) as any,
        downloadFromStorage: mockDownloadFromStorage,
        getFileMetadata: mockGetFileMetadataError,
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const resultError = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, deps);
        
        assertEquals(resultError.success, true);
        assertExists(resultError.data?.contributions?.[0]);
        assertEquals(resultError.data?.contributions?.[0].content_size_bytes, 0);
        assertEquals(mockGetFileMetadataError.calls.length, 1);
        assert(localLoggerWarn.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Could not get file metadata")));
        const insertedContribution = mockContributionInsertSpy.calls[0].args[0] as any;
        assertEquals(insertedContribution.content_size_bytes, 0);
    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - getFileMetadata returns no size (should proceed with size 0)", async () => {
    const mockAuthToken = "auth-token-meta-fail";
    const mockSessionId = "session-id-meta-fail-nosize";
    const mockProjectId = "project-id-meta-fail-nosize";
    const mockModelProviderId = "mp-id-meta-fail-nosize";
    const mockContributionId = "uuid-meta-fail-nosize";
    const mockContent = "AI content for meta fail test";
    const mockSeedPrompt = "Prompt for meta fail";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockStageSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: mockStage, error: null }))
        }))
    }));

    const mockSessionSelectSpy = spy(() => ({ 
        eq: spy(() => ({ 
            single: spy(async () => await Promise.resolve({
                data: {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    selected_model_catalog_ids: [mockModelProviderId],
                    associated_chat_id: "mock-chat-id-meta-fail-nosize",
                },
                error: null
            }))
        }))
    }));
    
    const mockAiProvidersSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({
                data: { id: mockModelProviderId, provider: 'mockProvider', name: 'ProvMetaFail', api_identifier: 'api-id-meta-fail' }, error: null
            }))
        }))
    }));
    
    let capturedInsertArg: any = null;
    const mockContributionInsertSpyNoSize = spy((data: any[]) => {
        capturedInsertArg = data[0];
        return {
            select: spy(() => ({
                single: spy(() => {
                    const dataToReturn = { 
                        id: mockContributionId, 
                        ...capturedInsertArg,
                        content_size_bytes: capturedInsertArg?.content_size_bytes ?? 0
                    };
                    return Promise.resolve({ data: dataToReturn, error: null });
                })
            }))
        };
    });

    const mockSessionUpdateSpy = spy(() => ({
        eq: spy(async () => await Promise.resolve({ error: null }))
    }));

    const mockDbClient = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockAiProvidersSelectSpy };
            if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpyNoSize };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };
    
    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));

    const mockGetFileMetadataSuccessNoSize = spy(async () => await Promise.resolve({ error: null, size: undefined }));

    const deps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({
            content: mockContent, error: null, errorCode: null, inputTokens: 1, outputTokens: 1, cost: 0.0001, processingTimeMs: 10
        })) as any,
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy_path" })),
        downloadFromStorage: mockDownloadFromStorage,
        getFileMetadata: mockGetFileMetadataSuccessNoSize,
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const resultNoSize = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, deps);
        
        assertEquals(resultNoSize.success, true);
        assertExists(resultNoSize.data?.contributions?.[0]);
        assertEquals(resultNoSize.data?.contributions?.[0].content_size_bytes, 0);
        assertEquals(mockGetFileMetadataSuccessNoSize.calls.length, 1);
        assert(localLoggerWarn.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Could not get file metadata")));
        const insertedContribution = mockContributionInsertSpyNoSize.calls[0].args[0] as any;
        assertEquals(insertedContribution.content_size_bytes, 0);
    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - DB insertion for contribution fails (verify storage cleanup)", async () => {
    const mockAuthToken = "auth-token-db-insert-fail";
    const mockSessionId = "session-id-db-insert-fail";
    const mockProjectId = "project-id-db-insert-fail";
    const mockModelProviderId = "mp-id-db-insert-fail";
    const mockContributionId = "uuid-db-fail";
    const mockContent = "AI content for DB fail";
    const mockSeedPrompt = "Prompt for DB insert fail";
    const mockContentPath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/thesis.md`;
    const mockRawPath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_thesis_response.json`;

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: mockStage, error: null }))
        }))
    }));

    const mockSessionSelectSpy = spy(() => ({ 
        eq: spy(() => ({ 
            single: spy(async () => await Promise.resolve({
                data: {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    selected_model_catalog_ids: [mockModelProviderId],
                    associated_chat_id: "mock-chat-id-db-insert-fail",
                }, error: null
            }))
        }))
    }));
    
    const mockAiProvidersSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({
                data: { id: mockModelProviderId, provider: 'mockProvider', name: 'ProvDbFail', api_identifier: 'api-id-db-insert-fail' }, error: null
            }))
        }))
    }));

    const mockContributionInsertSpyDbFail = spy(() => ({
        select: spy(() => ({
            single: spy(async () => await Promise.resolve({ 
                data: null, 
                error: { message: 'Simulated DB insert failure', code: 'DB_INSERT_FAIL' }
            }))
        }))
    }));

    const mockSessionUpdateSpy = spy(() => ({
        eq: spy(async () => await Promise.resolve({ error: null }))
    }));

    const mockDbClient = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockAiProvidersSelectSpy };
            if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpyDbFail };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));

    const mockDeps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: mockContent, error: null, errorCode: null, inputTokens:1, outputTokens:1, cost:0.001, processingTimeMs:10, rawProviderResponse: {} })) as any,
        uploadToStorage: spy(returnsNext([
             Promise.resolve({ error: null, path: mockContentPath }),
             Promise.resolve({ error: null, path: mockRawPath }),
        ])),
        getFileMetadata: spy(async () => await Promise.resolve({ size: 100, mimeType: 'text/markdown', error: null })),
        downloadFromStorage: mockDownloadFromStorage,
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy((_mimeType: string): string => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        
        const details = result.error?.details as unknown as FailedAttemptError[];
        assert(Array.isArray(details));
        assertEquals(details.length, 1);
        assert(details[0].error.includes("Failed to insert contribution into database."));
        assertEquals(details[0].modelId, mockModelProviderId);

        assertEquals(mockDeps.callUnifiedAIModel.calls.length, 1);
        assertEquals(mockDeps.uploadToStorage.calls.length, 2); // Content + Raw
        assertEquals(mockDeps.getFileMetadata.calls.length, 1);
        
        const deleteSpy = mockDeps.deleteFromStorage as unknown as Stub;
        assertEquals(deleteSpy.calls.length, 1);
        const deletedFiles = deleteSpy.calls[0].args[2] as string[];
        assertEquals(deletedFiles.length, 2);
        assert(deletedFiles.includes(mockContentPath), `Cleanup should include content path: ${mockContentPath}`);
        assert(deletedFiles.includes(mockRawPath), `Cleanup should include raw path: ${mockRawPath}`);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - Final session status update fails (critical log)", async () => {
    const mockAuthToken = "auth-token-status-update-fail";
    const mockSessionId = "session-id-status-update-fail";
    const mockProjectId = "project-id-status-update-fail";
    const mockModelProviderId = "mp-id-status-update-fail";
    const mockContributionId = "uuid-status-fail";
    const mockContent = "AI content for status fail";
    const mockFileSize = 77;
    const mockSeedPrompt = "Prompt for status update fail";

    const mockPayload: GenerateContributionsPayload = { 
        sessionId: mockSessionId,
        stageSlug: mockStage.slug,
        iterationNumber: 1,
    };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // DB Mocks
    const mockStageSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: mockStage, error: null }))
        }))
    }));

    const mockSessionSelectSpy = spy(() => ({ 
        eq: spy(() => ({ 
            single: spy(async () => await Promise.resolve({
                data: {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    selected_model_catalog_ids: [mockModelProviderId],
                    associated_chat_id: "mock-chat-id-status-update-fail",
                }, error: null
            }))
        }))
    }));

    const mockAiProvidersSelectSpy = spy(() => ({
        eq: spy(() => ({
            single: spy(async () => await Promise.resolve({
                data: { id: mockModelProviderId, provider: 'mockProvider', name: 'ProvStatusFail', api_identifier: 'api-id-status-update-fail' }, error: null
            }))
        }))
    }));

    const mockContributionInsertSpy = spy(() => ({
        select: spy(() => ({
            single: spy(async () => await Promise.resolve({ data: { id: mockContributionId }, error: null }))
        }))
    }));

    const mockSessionUpdateSpy = spy(() => ({
        eq: spy(async () => await Promise.resolve({ error: { message: "Simulated session update failure", code: "DB_UPDATE_FAIL"} })) // Key: Update fails
    }));
    
    const mockDbClient = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockAiProvidersSelectSpy };
            if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };
    
    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => await Promise.resolve({
        data: new TextEncoder().encode(mockSeedPrompt).buffer as ArrayBuffer,
        error: null,
    }));
    
    const mockDeps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: mockContent, error: null, errorCode: null, inputTokens:1, outputTokens:1, cost:0.001, processingTimeMs:10, rawProviderResponse: {}})) as any,
        uploadToStorage: spy(async (): Promise<UploadStorageResult> => await Promise.resolve({ error: null, path: "dummy_path" })) as any,
        getFileMetadata: spy(async (): Promise<{ size?: number; mimeType?: string; error: Error | null; }> => await Promise.resolve({ size: mockFileSize, mimeType: "text/markdown", error: null })),
        downloadFromStorage: mockDownloadFromStorage,
        deleteFromStorage: spy(async (): Promise<DeleteStorageResult> => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy((_mimeType: string): string => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, true); // Still returns success as contributions were made
        assertExists(result.data);
        assertEquals(result.data?.contributions?.length, 1);
        assertEquals(result.data?.status, 'thesis_generation_complete'); // Status reflects attempted update

        assertEquals(mockSessionUpdateSpy.calls.length, 1);
        assert(localLoggerError.calls.some(call => 
            typeof call.args[0] === 'string' && call.args[0].includes("CRITICAL: Failed to update session status for")
        ));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});
