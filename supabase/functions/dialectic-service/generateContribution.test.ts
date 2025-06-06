import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateStageContributions } from "./generateContribution.ts";
import type { 
    GenerateStageContributionsPayload, 
    GenerateStageContributionsSuccessResponse,
    DialecticContribution,
    CallUnifiedAIModelOptions,
    UnifiedAIResponse
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { 
    UploadStorageResult, 
    DeleteStorageResult 
} from "../_shared/supabase_storage_utils.ts"; // Import newly exported types
import * as pathUtilsModule from "../_shared/path_utils.ts"; // To mock path_utils if needed

// Removed global logger spies:
// const loggerSpyInfo = spy(logger, 'info');
// const loggerSpyError = spy(logger, 'error');
// const loggerSpyWarn = spy(logger, 'warn');

Deno.test("generateStageContributions - Happy Path (Single Model)", async () => {
    // Define local logger spies for this test
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockAuthToken = "test-auth-token";
    const mockSessionId = "test-session-id";
    const mockProjectId = "test-project-id";
    const mockChatId = "test-chat-id";
    const mockInitialPrompt = "Test initial prompt";
    const mockModelProviderId = "test-ai-provider-id"; // This is ai_providers.id
    const mockApiIdentifier = "test-api-identifier";
    const mockProviderName = "TestProvider";
    const mockModelName = "TestModel";
    const mockContributionId = "new-contribution-uuid";
    const mockContent = "Generated thesis content.";
    const mockContentType = "text/markdown";
    const mockFileExtension = ".md";
    const mockContentStoragePath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/thesis${mockFileExtension}`;
    const mockRawResponseStoragePath = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId}/raw_thesis_response.json`;
    const mockFileSize = 100;

    const mockPayload: GenerateStageContributionsPayload = {
        sessionId: mockSessionId,
        stage: 'thesis',
    };

    // Define spies for Supabase client methods BEFORE mockDbClient
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: mockProjectId,
            status: 'pending_thesis',
            associated_chat_id: mockChatId,
            selected_model_catalog_ids: [mockModelProviderId],
            dialectic_projects: { 
                initial_user_prompt: mockInitialPrompt,
                selected_domain_tag: null,
            },
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: any) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    // Spies for ai_providers table
    const mockAiProvidersSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockModelProviderId,
            provider: mockProviderName,
            name: mockModelName,
            api_identifier: mockApiIdentifier,
        },
        error: null,
    }));
    const mockAiProvidersSelectEqSpy = spy((_column: string, _value: any) => ({ single: mockAiProvidersSelectEqSingleSpy }));
    const mockAiProvidersSelectSpy = spy(() => ({ eq: mockAiProvidersSelectEqSpy }));

    let capturedInsertArg: any = null; // Keep this to capture the argument for assertion

    const mockContributionInsertSelectSingleSpy = spy(async () => { // No longer takes an arg
        // This spy will now form its response using the capturedInsertArg
        assertExists(capturedInsertArg, "capturedInsertArg must be set by mockContributionInsertSpy before select().single() is called");
        return await Promise.resolve({
            data: {
                id: mockContributionId, // Keep mock ID for predictability in tests
                session_id: capturedInsertArg.session_id || mockSessionId, // Use captured or default
                model_id: capturedInsertArg.model_id || mockModelProviderId,
                model_name: capturedInsertArg.model_name || mockModelName,
                stage: capturedInsertArg.stage || 'thesis',
                content_storage_bucket: capturedInsertArg.content_storage_bucket,
                content_storage_path: capturedInsertArg.content_storage_path || mockContentStoragePath,
                raw_response_storage_path: capturedInsertArg.raw_response_storage_path || mockRawResponseStoragePath,
                tokens_used_input: capturedInsertArg.tokens_used_input,
                tokens_used_output: capturedInsertArg.tokens_used_output,
                content_size_bytes: capturedInsertArg.content_size_bytes,
                processing_time_ms: capturedInsertArg.processing_time_ms,
                content_mime_type: capturedInsertArg.content_mime_type, // Ensure this is returned
            },
            error: null,
        });
    });

    const mockContributionInsertSelectSpy = spy(() => ({ single: mockContributionInsertSelectSingleSpy }));
    
    const mockContributionInsertSpy = spy((data: any) => {
        capturedInsertArg = data; // Capture the argument
        // mockContributionInsertSelectSingleSpy() is not called here directly anymore
        // It will be called when the code under test calls .select().single()
        return { select: mockContributionInsertSelectSpy };
    });


    const mockSessionUpdateEqSpy = spy(async (_column: string, _value: any) => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy((_values: Partial<Database['public']['Tables']['dialectic_sessions']['Update']>) => ({ eq: mockSessionUpdateEqSpy }));

    // Refactor mockDbClient.from to use returnsNext for precise call sequence control
    const mockDbClientFromSpy = spy(returnsNext([
        // 1. dialectic_sessions (fetch session)
        { select: mockSessionSelectSpy }, 
        // 2. ai_providers (model 1)
        { select: mockAiProvidersSelectSpy }, 
        // Correct sequence for single model:
        // 3. dialectic_contributions (insert for model 1 - success)
        { insert: mockContributionInsertSpy }, 
        // 4. dialectic_sessions (update session status)
        { update: mockSessionUpdateSpy }, 
    ]));
    const mockDbClient: any = { from: mockDbClientFromSpy };

    const mockCallUnifiedAIModel = spy(async (
        _modelId: string, 
        _prompt: string, 
        _chatId: string, 
        _authToken: string, 
        _options?: CallUnifiedAIModelOptions
    ): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: mockContent,
        error: null,
        errorCode: null,
        inputTokens: 10,
        outputTokens: 20,
        tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        processingTimeMs: 1000,
        rawProviderResponse: { modelOutput: "raw output" },
        contentType: mockContentType,
    }));

    const mockUploadToStorage = spy(async (
        _dbClient: any, 
        _bucketName: string, 
        path: string, // Use the path argument to return it
        _body: any, 
        _options: any
    ): Promise<UploadStorageResult> => await Promise.resolve({ error: null, path }));

    const mockGetFileMetadata = spy(async (
        _dbClient: any, 
        _bucketName: string, 
        _path: string
    ): Promise<{ size?: number; mimeType?: string; error: Error | null; }> => await Promise.resolve(
        { 
            size: mockFileSize, 
            mimeType: "text/markdown", // Added mock mimeType
            error: null 
        }
    ));
    
    const mockDeleteFromStorage = spy(async (
        _dbClient: any, 
        _bucketName: string, 
        _paths: string[]
    ): Promise<DeleteStorageResult> => await Promise.resolve({ data: [], error: null }));

    const mockGetExtensionFromMimeType = spy((_mimeType: string): string => mockFileExtension);
    
    const mockRandomUUID = spy(() => mockContributionId);


    try {
        const result = await generateStageContributions(
            mockDbClient as any,
            mockPayload,
            mockAuthToken,
            { // Pass mock dependencies
                callUnifiedAIModel: mockCallUnifiedAIModel,
                uploadToStorage: mockUploadToStorage,
                getFileMetadata: mockGetFileMetadata,
                deleteFromStorage: mockDeleteFromStorage,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                logger: logger, // Use the spied logger
                randomUUID: mockRandomUUID
            }
        );

        // Assertions
        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data?.sessionId, mockSessionId);
        assertEquals(result.data?.status, 'thesis_generation_complete');
        assertEquals(result.data?.contributions?.length, 1);
        
        // Ensure properties for DialecticContribution are asserted
        const expectedContribution: Partial<DialecticContribution> = {
            id: mockContributionId,
            session_id: mockSessionId,
            model_id: mockModelProviderId,
            model_name: mockModelName,
            stage: 'thesis',
            content_storage_path: mockContentStoragePath,
            raw_response_storage_path: mockRawResponseStoragePath,
            tokens_used_input: 10,
            tokens_used_output: 20,
            content_size_bytes: mockFileSize,
            processing_time_ms: 1000,
            content_mime_type: mockContentType,
        };
        assertObjectMatch(result.data?.contributions?.[0] as any, expectedContribution as any);

        assertEquals(result.error, undefined);

        // Verify mocks were called
        const fromSpy = mockDbClient.from as Stub;
        // Expected calls: 
        // 1. dialectic_sessions (fetch session)
        // 2. ai_providers (fetch model details for mockModelProviderId)
        // 3. dialectic_contributions (insert contribution)
        // 4. dialectic_sessions (update session status)
        assertEquals(fromSpy.calls.length, 4, "dbClient.from() was not called the expected number of times. Calls: " + fromSpy.calls.map(c => c.args[0]).join(', ')); 
        assertEquals(fromSpy.calls[0].args[0], 'dialectic_sessions', "First call to from() was not for 'dialectic_sessions'");
        assertEquals(fromSpy.calls[1].args[0], 'ai_providers', "Second call to from() was not for 'ai_providers'");
        assertEquals(fromSpy.calls[2].args[0], 'dialectic_contributions', "Third call to from() was not for 'dialectic_contributions'");
        assertEquals(fromSpy.calls[3].args[0], 'dialectic_sessions', "Fourth call to from() was not for 'dialectic_sessions'");

        // Assertions for the first call to dialectic_sessions (fetch)
        assertEquals(mockSessionSelectSpy.calls.length, 1);
        assertEquals(mockSessionSelectEqSpy.calls.length, 1);
        assertEquals(mockSessionSelectEqSingleSpy.calls.length, 1);
        if (mockSessionSelectEqSpy.calls.length > 0) { 
            const firstEqCall = mockSessionSelectEqSpy.calls[0];
            assertExists(firstEqCall, "First call to mockSessionSelectEqSpy should exist");
            // deno-lint-ignore no-explicit-any
            assertEquals(firstEqCall.args[0], 'id');
            // deno-lint-ignore no-explicit-any
            assertEquals(firstEqCall.args[1], mockSessionId);
        }

        assertEquals(mockCallUnifiedAIModel.calls.length, 1);
        assertEquals(mockCallUnifiedAIModel.calls[0].args[0], mockModelProviderId);
        assertEquals(mockCallUnifiedAIModel.calls[0].args[1], mockInitialPrompt);
        assertEquals(mockCallUnifiedAIModel.calls[0].args[2], mockChatId);
        assertEquals(mockCallUnifiedAIModel.calls[0].args[3], mockAuthToken);

        assertEquals(mockRandomUUID.calls.length, 1);
        assertEquals(mockGetExtensionFromMimeType.calls.length, 1);
        assertEquals(mockGetExtensionFromMimeType.calls[0].args[0], mockContentType);


        assertEquals(mockUploadToStorage.calls.length, 2); // Content and raw response
        assertEquals(mockUploadToStorage.calls[0].args[1], 'dialectic-contributions');
        assertEquals(mockUploadToStorage.calls[0].args[2], mockContentStoragePath);
        assertEquals(mockUploadToStorage.calls[0].args[3], mockContent);
        assertEquals(mockUploadToStorage.calls[1].args[2], mockRawResponseStoragePath);


        assertEquals(mockGetFileMetadata.calls.length, 1);
        assertEquals(mockGetFileMetadata.calls[0].args[1], 'dialectic-contributions');
        assertEquals(mockGetFileMetadata.calls[0].args[2], mockContentStoragePath);

        // Assertions for the call to ai_providers (fetch model details)
        assertEquals(mockAiProvidersSelectSpy.calls.length, 1, "ai_providers.select was not called once");
        assertEquals(mockAiProvidersSelectEqSpy.calls.length, 1, "ai_providers.select().eq() was not called once");
        assertEquals(mockAiProvidersSelectEqSpy.calls[0].args[0], 'id', "ai_providers.select().eq() was not called with 'id'");
        assertEquals(mockAiProvidersSelectEqSpy.calls[0].args[1], mockModelProviderId, `ai_providers.select().eq() was not called with ${mockModelProviderId}`);
        assertEquals(mockAiProvidersSelectEqSingleSpy.calls.length, 1, "ai_providers.select().eq().single() was not called once");

        // Assertions for dialectic_contributions (insert)
        assertEquals(mockContributionInsertSpy.calls.length, 1);
        assertEquals(mockContributionInsertSelectSpy.calls.length, 1); // Called by mockContributionInsertSpy
        assertEquals(mockContributionInsertSelectSingleSpy.calls.length, 1); // Called by mockContributionInsertSelectSpy
        
        // Check the actual argument passed to the insert spy
        const actualInsertArg = mockContributionInsertSpy.calls[0].args[0];
        assertExists(actualInsertArg, "capturedInsertArg should exist after insert call"); // Ensure it exists
        assertObjectMatch(actualInsertArg as object, {
            session_id: mockSessionId,
            model_id: mockModelProviderId,
            model_name: mockModelName,
            stage: 'thesis',
            content_storage_bucket: 'dialectic-contributions',
            content_storage_path: mockContentStoragePath,
            raw_response_storage_path: mockRawResponseStoragePath,
            tokens_used_input: 10,
            tokens_used_output: 20,
            content_size_bytes: mockFileSize,
            processing_time_ms: 1000,
            content_mime_type: mockContentType,
        });

        // Assertions for the second call to dialectic_sessions (update)
        assertEquals(mockSessionUpdateSpy.calls.length, 1);
        assertEquals(mockSessionUpdateEqSpy.calls.length, 1);
        if (mockSessionUpdateSpy.calls.length > 0 && mockSessionUpdateEqSpy.calls.length > 0) { 
            const firstUpdateCall = mockSessionUpdateSpy.calls[0];
            const firstUpdateEqCall = mockSessionUpdateEqSpy.calls[0];
            assertExists(firstUpdateCall, "First call to mockSessionUpdateSpy should exist");
            assertExists(firstUpdateEqCall, "First call to mockSessionUpdateEqSpy should exist");
            assertExists(firstUpdateCall.args[0], "Arguments for the first update call should exist");
            // deno-lint-ignore no-explicit-any
            assertEquals((firstUpdateCall.args[0] as {status: string}).status, 'thesis_generation_complete');
            // deno-lint-ignore no-explicit-any
            assertEquals(firstUpdateEqCall.args[0], 'id');
            // deno-lint-ignore no-explicit-any
            assertEquals(firstUpdateEqCall.args[1], mockSessionId);
        }

        // More robust check for the specific two-argument log call
        const expectedLogMessage = `[generateStageContributions] Finished processing all models for session ${mockSessionId}`;
        
        const matchingLogCall = localLoggerInfo.calls.find((call, index) => {
            if (call.args.length === 2 && typeof call.args[0] === 'string') {
                const actualLogMessageTrimmed = call.args[0].trim();
                const stringMatch = actualLogMessageTrimmed === expectedLogMessage.trim();
                const arg1 = call.args[1] as Record<string, unknown> | null;
                const objMatch = typeof arg1 === 'object' && arg1 !== null &&
                                 arg1.successful === 1 &&
                                 arg1.failed === 0;

                // More detailed logging if it's the one we are targeting by content
                if (actualLogMessageTrimmed.includes("Finished processing all models for session test-session-id")) {
                    console.log("---------------------------------------------------------");
                    console.log(`DEBUG (INSIDE FIND): Checking specific call. Arg0: "${actualLogMessageTrimmed}"`);
                    console.log(`DEBUG (INSIDE FIND): Expected Arg0: "${expectedLogMessage.trim()}"`);
                    console.log(`DEBUG (INSIDE FIND): String comparison (actual === expected): ${stringMatch}`);
                    console.log(`DEBUG (INSIDE FIND): Arg1 actual: ${JSON.stringify(arg1)}`);
                    console.log(`DEBUG (INSIDE FIND): Arg1 expected: ${JSON.stringify({ successful: 1, failed: 0 })}`);
                    console.log(`DEBUG (INSIDE FIND): Obj successful match: ${arg1?.successful === 1}`);
                    console.log(`DEBUG (INSIDE FIND): Obj failed match: ${arg1?.failed === 0}`);
                    console.log(`DEBUG (INSIDE FIND): Overall objMatch for this call: ${objMatch}`);
                    console.log("---------------------------------------------------------");
                }
                return stringMatch && objMatch;
            }
            return false;
        });
        assertExists(matchingLogCall, `Log call for '${expectedLogMessage}' with payload { successful: 1, failed: 0 } not found`);

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].trim() === (`[generateStageContributions] Updating session ${mockSessionId} status to: thesis_generation_complete`).trim()));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Session ${mockSessionId} status updated to thesis_generation_complete`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Successfully completed for session ${mockSessionId}. Status: thesis_generation_complete`)));
        assertEquals(localLoggerError.calls.length, 0);
        assertEquals(localLoggerWarn.calls.length, 0);

    } finally {
        // Restore local logger spies
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        // mockDbClientFromSpy.restore(); // This spy uses returnsNext and cannot/should not be restored.
        // mockCallUnifiedAIModel, mockUploadToStorage, etc., are now spies on new functions, not stubs on modules.
        // No restore needed for them, nor for mockRandomUUID (spy on a new function).
    }
});

Deno.test("generateStageContributions - Multiple Models (some success, some fail)", async () => {
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

    const mockFileExtension = ".md"; // Assume same extension for simplicity

    const mockPayload: GenerateStageContributionsPayload = {
        sessionId: mockSessionId,
        stage: 'thesis',
    };

    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: 'pending_thesis',
        associated_chat_id: mockChatId,
        selected_model_catalog_ids: [mockModelProviderId1, mockModelProviderId2, mockModelProviderId3], // Key change
        dialectic_projects: {
            initial_user_prompt: mockInitialPrompt,
            selected_domain_tag: null,
        },
    };

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({ data: mockSessionData, error: null }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: any) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    // Mock for ai_providers table - using returnsNext for different models
    const mockAiProvidersSelectEqSingleSpy = spy(returnsNext([ // Changed from stub to spy
        Promise.resolve({ // Model 1 - Success
            data: { id: mockModelProviderId1, provider: mockProviderName1, name: mockModelName1, api_identifier: mockApiIdentifier1 },
            error: null,
        }),
        Promise.resolve({ // Model 2 - AI Call Fails
            data: { id: mockModelProviderId2, provider: mockProviderName2, name: mockModelName2, api_identifier: mockApiIdentifier2 },
            error: null,
        }),
        Promise.resolve({ // Model 3 - Upload Fails
            data: { id: mockModelProviderId3, provider: mockProviderName3, name: mockModelName3, api_identifier: mockApiIdentifier3 },
            error: null,
        }),
    ]));
    const mockAiProvidersSelectEqSpy = spy((_column: string, _value: any) => ({ single: mockAiProvidersSelectEqSingleSpy as any })); // Cast because stub type is complex
    const mockAiProvidersSelectSpy = spy(() => ({ eq: mockAiProvidersSelectEqSpy }));


    const capturedInsertArgs: any[] = []; // Array to capture multiple inserts
    const mockContributionInsertSelectSingleSpyImpl = async () => {
        const lastArg = capturedInsertArgs[capturedInsertArgs.length -1];
        assertExists(lastArg);
        return await Promise.resolve({ // Simulate successful DB insert for model 1 and model 3 (before its upload fails)
            data: {
                id: lastArg.model_id === mockModelProviderId1 ? mockContributionId1 : mockContributionId3,
                session_id: lastArg.session_id,
                model_id: lastArg.model_id,
                model_name: lastArg.model_name,
                stage: lastArg.stage,
                content_storage_bucket: lastArg.content_storage_bucket,
                content_storage_path: lastArg.content_storage_path,
                raw_response_storage_path: lastArg.raw_response_storage_path,
                tokens_used_input: lastArg.tokens_used_input,
                tokens_used_output: lastArg.tokens_used_output,
                content_size_bytes: lastArg.content_size_bytes,
                processing_time_ms: lastArg.processing_time_ms,
                content_mime_type: lastArg.content_mime_type,
            },
            error: null,
        });
    };
    // Spy on the implementation for assertion, stub for control.
    const spiedMockContributionInsertSelectSingle = spy(mockContributionInsertSelectSingleSpyImpl);
    const mockContributionInsertSelectSpy = spy(() => ({ single: spiedMockContributionInsertSelectSingle as any }));
    const mockContributionInsertSpy = spy((data: any) => {
        capturedInsertArgs.push(data);
        return { select: mockContributionInsertSelectSpy };
    });

    const mockSessionUpdateEqSpy = spy(async (_column: string, _value: any) => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy((_values: Partial<Database['public']['Tables']['dialectic_sessions']['Update']>) => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy(returnsNext([
            // 1. dialectic_sessions (fetch session)
            { select: mockSessionSelectSpy },
            // 2. ai_providers (fetch model 1 details)
            { select: mockAiProvidersSelectSpy },
            // 3. dialectic_contributions (insert contribution for model 1)
            { insert: mockContributionInsertSpy },
            // 4. ai_providers (fetch model 2 details)
            { select: mockAiProvidersSelectSpy },
            // 5. ai_providers (fetch model 3 details)
            { select: mockAiProvidersSelectSpy },
            // 6. dialectic_sessions (update session status because at least one model succeeded)
            { update: mockSessionUpdateSpy },
        ])),
    };
    
    // Mock callUnifiedAIModel to simulate different outcomes
    const mockCallUnifiedAIModel = spy(returnsNext([ // Changed from stub to spy
        Promise.resolve({ // Model 1 - Success
            content: mockContent1, error: null, inputTokens: 10, outputTokens: 20, processingTimeMs: 100, contentType: "text/markdown", rawProviderResponse: {}
        }),
        Promise.resolve({ // Model 2 - AI Call Fails
            content: null, error: "AI failed", errorCode: "AI_CALL_FAILED", inputTokens: 5, outputTokens: 0, processingTimeMs: 50, rawProviderResponse: {}
        }),
        Promise.resolve({ // Model 3 - AI Call Success (but upload will fail)
            content: mockContent3, error: null, inputTokens: 15, outputTokens: 25, processingTimeMs: 120, contentType: "text/markdown", rawProviderResponse: {}
        }),
    ]));

    // Mock uploadToStorage for different outcomes
    const mockUploadToStorage = spy(returnsNext([ // Changed from stub to spy
        Promise.resolve({ error: null, path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId1}/thesis${mockFileExtension}` }), // Model 1 - Content Upload Success
        Promise.resolve({ error: null, path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId1}/raw_thesis_response.json` }), // Model 1 - Raw Response Upload Success
        // Model 2 doesn't reach upload
        Promise.resolve({ error: { name: "StorageError", message: "Failed to upload for Model 3" }, path: null }), // Model 3 - Content Upload Fails
        // Model 3 raw response upload is skipped due to content upload failure.
    ]));

    const mockGetFileMetadata = spy(async (_dbClient: any, _bucketName: string, path: string)
        : Promise<{ size?: number; mimeType?: string; error: Error | null; }> => {
        if (path.includes(mockContributionId1)) return await Promise.resolve({ size: 50, mimeType: "text/markdown", error: null });
        // For model 3, this might be called before upload failure is known by main func, or not at all. Let's assume it's not called if upload fails.
        return await Promise.resolve({ size: 0, error: new Error("File not found for metadata in test") }); 
    });
    
    const mockDeleteFromStorage = spy(async (_dbClient: any, _bucketName: string, _paths: string[]): Promise<DeleteStorageResult> => await Promise.resolve({ data: [], error: null }));
    const mockGetExtensionFromMimeType = spy((_mimeType: string): string => mockFileExtension);
    const mockRandomUUID = spy(returnsNext([mockContributionId1, mockContributionId3])); // Changed from stub to spy; UUIDs for successful attempt and the one that fails at upload


    try {
        const result = await generateStageContributions(
            mockDbClient as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel as any,
                uploadToStorage: mockUploadToStorage as any,
                getFileMetadata: mockGetFileMetadata,
                deleteFromStorage: mockDeleteFromStorage,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                logger: logger,
                randomUUID: mockRandomUUID as any,
            }
        );

        assertEquals(result.success, true); // Still true because one succeeded
        assertExists(result.data);
        assertEquals(result.data?.sessionId, mockSessionId);
        assertEquals(result.data?.status, 'thesis_generation_partial');
        assertEquals(result.data?.contributions?.length, 1);
        
        const firstContribution = result.data?.contributions?.[0];
        assertObjectMatch(firstContribution as any, {
            id: mockContributionId1,
            session_id: mockSessionId,
            model_id: mockModelProviderId1,
            model_name: mockModelName1,
            stage: 'thesis',
            content_storage_path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId1}/thesis${mockFileExtension}`,
            content_mime_type: "text/markdown",
            tokens_used_input: 10,
            tokens_used_output: 20,
            processing_time_ms: 100,
            content_size_bytes: 50,
        });

        assertExists(result.data?.errors);
        assertEquals(result.data?.errors?.length, 2);

        const errorForModel2 = result.data?.errors?.find(e => e.modelId === mockModelProviderId2);
        assertExists(errorForModel2);
        assertObjectMatch(errorForModel2, {
            modelId: mockModelProviderId2,
            modelName: mockModelName2,
            providerName: mockProviderName2,
            message: "AI failed",
            details: "Code: AI_CALL_FAILED, Details: AI_CALL_FAILED, Input Tokens: 5, Output Tokens: 0, Processing Time: 50ms"
        });

        const errorForModel3 = result.data?.errors?.find(e => e.modelId === mockModelProviderId3);
        assertExists(errorForModel3);
        assertObjectMatch(errorForModel3, { // This assumes the error is captured as STORAGE_UPLOAD_ERROR
            modelId: mockModelProviderId3,
            modelName: mockModelName3,
            providerName: mockProviderName3,
            message: "Failed to upload contribution content.",
            details: "Code: STORAGE_UPLOAD_ERROR, Details: Failed to upload for Model 3"
        });
        
        const fromSpy = mockDbClient.from as Stub<any[], any>;
        assertEquals(fromSpy.calls.length, 6, "dbClient.from() calls mismatch. Expected 6."); 
        assertEquals(fromSpy.calls[0].args[0], 'dialectic_sessions', "Call 0: Expected dialectic_sessions (session fetch)");
        assertEquals(fromSpy.calls[1].args[0], 'ai_providers', "Call 1: Expected ai_providers (Model 1 details)");
        assertEquals(fromSpy.calls[2].args[0], 'dialectic_contributions', "Call 2: Expected dialectic_contributions (Model 1 insert)");
        assertEquals(fromSpy.calls[3].args[0], 'ai_providers', "Call 3: Expected ai_providers (Model 2 details)");
        assertEquals(fromSpy.calls[4].args[0], 'ai_providers', "Call 4: Expected ai_providers (Model 3 details)");
        assertEquals(fromSpy.calls[5].args[0], 'dialectic_sessions', "Call 5: Expected dialectic_sessions (session update)");

        assertEquals(mockSessionSelectSpy.calls.length, 1);
        assertEquals(mockAiProvidersSelectSpy.calls.length, 3); // Called for each model
        assertEquals(mockContributionInsertSpy.calls.length, 1); // Only for successful model 1
        assertEquals(mockSessionUpdateSpy.calls.length, 1);

        assertEquals(mockCallUnifiedAIModel.calls.length, 3); // Called for all 3 models initially
        // Model 1: content upload, raw response upload
        // Model 3: content upload (fails)
        assertEquals(mockUploadToStorage.calls.length, 3, "uploadToStorage calls mismatch"); // M1_content, M1_raw, M3_content_fail

        // Check cleanup for Model 3's failed upload
        const deleteCalls = mockDeleteFromStorage.calls;
        // CORRECTING ASSERTION: Model 3 fails at upload, so no DB insert is attempted, thus no storage cleanup via deleteFromStorage is triggered for it.
        assertEquals(deleteCalls.length, 0, "deleteFromStorage should be 0 because Model 3 fails before DB insert.");
        // The following lines assume deleteCalls[0] exists, which it shouldn't in this scenario.
        // assert(deleteCalls[0].args[2].some((p: string) => p.includes(mockContributionId3) && p.includes("thesis")), "Cleanup for Model 3 content not called");
        // assert(deleteCalls[0].args[2].some((p: string) => p.includes(mockContributionId3) && p.includes("raw_thesis_response.json")), "Cleanup for Model 3 raw response not called");


    } finally {
        // Restore spies that were attached to objects or had complex setups
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        // The following spies are standalone wrappers of returnsNext and do not need/support .restore()
        // mockAiProvidersSelectEqSingleSpy.restore(); 
        // mockCallUnifiedAIModel.restore();           
        // mockUploadToStorage.restore();              
        // mockRandomUUID.restore();                   
        // if (spiedMockContributionInsertSelectSingle && typeof spiedMockContributionInsertSelectSingle.restore === 'function') { 
        //     spiedMockContributionInsertSelectSingle.restore(); // This line was causing MockError
        // }
    }
});

Deno.test("generateStageContributions - All Models Fail (e.g., AI errors for all)", async () => {
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockAuthToken = "test-auth-token-all-fail";
    const mockSessionId = "test-session-id-all-fail";
    const mockProjectId = "test-project-id-all-fail";
    const mockChatId = "test-chat-id-all-fail";
    const mockInitialPrompt = "Test initial prompt for all models to fail";

    // Model 1: AI Success, Uploads Success, DB Insert Fails
    const mockModelProviderId1 = "model-id-1-db-fail";
    const mockProviderName1 = "Provider1";
    const mockModelName1 = "Model1-DB-Fail";
    const mockApiIdentifier1 = "api-1-db-fail";
    const mockContributionId1 = "contrib-uuid-1-db-fail";
    const mockContentForModel1 = "AI Content for Model 1 (DB Fail)";

    // Model 2: AI Call Fails
    const mockModelProviderId2 = "model-id-2-ai-fail";
    const mockProviderName2 = "Provider2";
    const mockModelName2 = "Model2-AI-Fail";
    const mockApiIdentifier2 = "api-2-ai-fail";
    
    // Model 3: AI Success, Upload Fails
    const mockModelProviderId3 = "model-id-3-upload-fail";
    const mockProviderName3 = "Provider3";
    const mockModelName3 = "Model3-Upload-Fail";
    const mockApiIdentifier3 = "api-3-upload-fail";
    const mockContentForModel3 = "AI Content for Model 3 (Upload Fail)";
    const mockContributionIdForM3 = "contrib-uuid-3-upload-fail"; 

    const mockFileExtension = ".md";

    const mockPayload: GenerateStageContributionsPayload = {
        sessionId: mockSessionId,
        stage: 'thesis',
    };

    const mockSessionData = {
        id: mockSessionId,
        project_id: mockProjectId,
        status: 'pending_thesis',
        associated_chat_id: mockChatId,
        selected_model_catalog_ids: [mockModelProviderId1, mockModelProviderId2, mockModelProviderId3],
        dialectic_projects: {
            initial_user_prompt: mockInitialPrompt,
            selected_domain_tag: null,
        },
    };

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({ data: mockSessionData, error: null }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: any) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockAiProvidersSelectEqSingleSpy = spy(returnsNext([
        Promise.resolve({ data: { id: mockModelProviderId1, provider: mockProviderName1, name: mockModelName1, api_identifier: mockApiIdentifier1 }, error: null }),
        Promise.resolve({ data: { id: mockModelProviderId2, provider: mockProviderName2, name: mockModelName2, api_identifier: mockApiIdentifier2 }, error: null }),
        Promise.resolve({ data: { id: mockModelProviderId3, provider: mockProviderName3, name: mockModelName3, api_identifier: mockApiIdentifier3 }, error: null }),
    ]));
    const mockAiProvidersSelectEqSpy = spy((_column: string, _value: any) => ({ single: mockAiProvidersSelectEqSingleSpy as any }));
    const mockAiProvidersSelectSpy = spy(() => ({ eq: mockAiProvidersSelectEqSpy }));

    let capturedInsertArgForModel1: any = null; 
    const mockContributionInsertSelectSingleSpyImpl = async () => {
        assertExists(capturedInsertArgForModel1, "capturedInsertArgForModel1 should be set for Model 1's insert attempt");
        assertEquals(capturedInsertArgForModel1.model_id, mockModelProviderId1);
        return await Promise.resolve({
            data: null, // DB insert fails
            error: { message: "DB insert failed for Model 1", code: "DB_INSERT_ERROR_M1" },
        });
    };
    const spiedMockContributionInsertSelectSingle = spy(mockContributionInsertSelectSingleSpyImpl);
    const mockContributionInsertSelectSpy = spy(() => ({ single: spiedMockContributionInsertSelectSingle as any }));
    const mockContributionInsertSpy = spy((data: any) => {
        if (data.model_id === mockModelProviderId1) {
            capturedInsertArgForModel1 = data;
        }
        return { select: mockContributionInsertSelectSpy };
    });

    const mockSessionUpdateEqSpy = spy(async (_column: string, _value: any) => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy((_values: Partial<Database['public']['Tables']['dialectic_sessions']['Update']>) => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy(returnsNext([
             // 1. dialectic_sessions (fetch session)
            { select: mockSessionSelectSpy },
             // 2. ai_providers (fetch model 1 details)
            { select: mockAiProvidersSelectSpy },
             // 3. dialectic_contributions (insert contribution for model 1 - mocked to fail)
            { insert: mockContributionInsertSpy }, // This will be called, then error out
             // 4. ai_providers (fetch model 2 details)
            { select: mockAiProvidersSelectSpy },
             // 5. ai_providers (fetch model 3 details)
            { select: mockAiProvidersSelectSpy },
             // No session update should occur as all models fail
        ])),
    };
    
    const mockCallUnifiedAIModel = spy(returnsNext([
        Promise.resolve({ // Model 1 - AI Success (DB fail)
            content: mockContentForModel1, error: null, inputTokens: 10, outputTokens: 20, processingTimeMs: 100, contentType: "text/markdown", rawProviderResponse: {}
        }),
        Promise.resolve({ // Model 2 - AI Fail
            content: null, error: "AI failed for Model 2", errorCode: "AI_CALL_FAILED_M2", inputTokens: 5, outputTokens: 0, processingTimeMs: 50, rawProviderResponse: {}
        }),
        Promise.resolve({ // Model 3 - AI Success (Upload fail)
            content: mockContentForModel3, error: null, inputTokens: 15, outputTokens: 25, processingTimeMs: 120, contentType: "text/markdown", rawProviderResponse: {}
        }),
    ]));

    const mockUploadToStorage = spy(returnsNext([
        // Model 1 (DB fail) - uploads succeed
        Promise.resolve({ error: null, path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId1}/thesis${mockFileExtension}` }), 
        Promise.resolve({ error: null, path: `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId1}/raw_thesis_response.json` }), 
        // Model 2 (AI fail) - does not reach upload
        // Model 3 (Upload fail) - content upload fails
        Promise.resolve({ error: { name: "UploadErrorM3", message: "Upload failed for Model 3 content" }, path: null }), 
    ]));

    const mockGetFileMetadata = spy(async (_dbClient: any, _bucketName: string, path: string)
        : Promise<{ size?: number; mimeType?: string; error: Error | null; }> => {
        if (path.includes(mockContributionId1)) return await Promise.resolve({ size: 50, mimeType: "text/markdown", error: null }); // For Model 1
        return await Promise.resolve({ size: 0, error: new Error("File not found for metadata in AllFailTest") }); 
    });
    
    const mockDeleteFromStorage = spy(async (_dbClient: any, _bucketName: string, _paths: string[]): Promise<DeleteStorageResult> => await Promise.resolve({ data: [], error: null }));
    const mockGetExtensionFromMimeType = spy((_mimeType: string): string => mockFileExtension);
    const mockRandomUUID = spy(returnsNext([mockContributionId1, mockContributionIdForM3]));

    try {
        const result = await generateStageContributions(
            mockDbClient as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel as any,
                uploadToStorage: mockUploadToStorage as any,
                getFileMetadata: mockGetFileMetadata,
                deleteFromStorage: mockDeleteFromStorage,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                logger: logger,
                randomUUID: mockRandomUUID as any,
            }
        );

        assertEquals(result.success, false);
        assertEquals(result.data, undefined); 
        assertExists(result.error);
        assertEquals(result.error.message, "All models failed to generate stage contributions.");
        assertEquals(result.error.status, 500);
        assertExists(result.error.details, "Error details string should exist");

        const errorDetailsString = result.error.details;
        
        // For Model 1 (DB Insert Fail)
        const model1ErrorString = `Model (ID ${mockModelProviderId1}, Name: ${mockModelName1}): Failed to insert contribution into database. (DB insert failed for Model 1)`;
        assert(
            errorDetailsString.includes(model1ErrorString),
            `Error details for Model 1 (DB fail) incorrect. Expected to include: '${model1ErrorString}', Got: ${errorDetailsString}`
        );

        // For Model 2 (AI Fail)
        const model2ErrorString = `Model (ID ${mockModelProviderId2}, Name: ${mockModelName2}): AI failed for Model 2 (AI_CALL_FAILED_M2)`;
        assert(
            errorDetailsString.includes(model2ErrorString),
            `Error details for Model 2 (AI fail) incorrect. Expected to include: '${model2ErrorString}', Got: ${errorDetailsString}`
        );
        
        // For Model 3 (Upload Fail)
        const model3ErrorString = `Model (ID ${mockModelProviderId3}, Name: ${mockModelName3}): Failed to upload contribution content. (Upload failed for Model 3 content)`;
        assert(
            errorDetailsString.includes(model3ErrorString),
            `Error details for Model 3 (upload fail) incorrect. Expected to include: '${model3ErrorString}', Got: ${errorDetailsString}`
        );

        const fromSpy = mockDbClient.from as Stub<any[], any>;
        assertEquals(fromSpy.calls.length, 5, "dbClient.from() calls mismatch. Expected 5 for all-fail scenario."); 
        assertEquals(fromSpy.calls[0].args[0], 'dialectic_sessions', "Call 0: Expected dialectic_sessions (session fetch)");
        assertEquals(fromSpy.calls[1].args[0], 'ai_providers', "Call 1: Expected ai_providers (Model 1 details)");
        assertEquals(fromSpy.calls[2].args[0], 'dialectic_contributions', "Call 2: Expected dialectic_contributions (Model 1 insert)");
        assertEquals(fromSpy.calls[3].args[0], 'ai_providers', "Call 3: Expected ai_providers (Model 2 details)");
        assertEquals(fromSpy.calls[4].args[0], 'ai_providers', "Call 4: Expected ai_providers (Model 3 details)");
        
        // Verify that the mockSessionUpdateSpy (and thus mockSessionUpdateEqSpy) was not called,
        // indicating no attempt was made to update the session status.
        assertEquals(mockSessionUpdateSpy.calls.length, 0, "Session status should not be updated when all models fail.");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        // mockAiProvidersSelectEqSingleSpy.restore(); 
        // mockCallUnifiedAIModel.restore();           
        // mockUploadToStorage.restore();              
        // mockRandomUUID.restore();                   
        // if (spiedMockContributionInsertSelectSingle && typeof spiedMockContributionInsertSelectSingle.restore === 'function') { 
        //    spiedMockContributionInsertSelectSingle.restore(); // Commented out
        // }
    }
});



