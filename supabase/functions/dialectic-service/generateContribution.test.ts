import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateThesisContributions } from "./generateContribution.ts";
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
    const mockSessionModelId = "test-session-model-id"; // This is dialectic_session_models.id
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
            dialectic_projects: { 
                initial_user_prompt: mockInitialPrompt,
                selected_domain_tag: null,
            },
            dialectic_session_models: [
                {
                    id: mockSessionModelId,
                    model_id: mockModelProviderId, 
                    ai_providers: { 
                        id: mockModelProviderId,
                        provider_name: mockProviderName,
                        model_name: mockModelName,
                        api_identifier: mockApiIdentifier,
                    },
                },
            ],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    let capturedInsertArg: any = null; // Keep this to capture the argument for assertion

    const mockContributionInsertSelectSingleSpy = spy(async () => { // No longer takes an arg
        // This spy will now form its response using the capturedInsertArg
        assertExists(capturedInsertArg, "capturedInsertArg must be set by mockContributionInsertSpy before select().single() is called");
        return await Promise.resolve({
            data: {
                id: mockContributionId, // Keep mock ID for predictability in tests
                session_id: capturedInsertArg.session_id || mockSessionId, // Use captured or default
                session_model_id: capturedInsertArg.session_model_id || mockSessionModelId,
                stage: capturedInsertArg.stage || 'thesis',
                content_storage_bucket: capturedInsertArg.content_storage_bucket,
                content_storage_path: capturedInsertArg.content_storage_path || mockContentStoragePath,
                raw_response_storage_path: capturedInsertArg.raw_response_storage_path || mockRawResponseStoragePath,
                tokens_used_input: capturedInsertArg.tokens_used_input,
                tokens_used_output: capturedInsertArg.tokens_used_output,
                cost_usd: capturedInsertArg.cost_usd,
                content_size_bytes: capturedInsertArg.content_size_bytes,
                processing_time_ms: capturedInsertArg.processing_time_ms,
                // Include any other fields that are part of the insert and expected in the select
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


    const mockSessionUpdateEqSpy = spy<[string, string], Promise<{error: Error | null}>>(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy<[Partial<Database['public']['Tables']['dialectic_sessions']['Update']>] , { eq: Stub }>(() => ({ eq: mockSessionUpdateEqSpy as Stub }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') {
                // For the initial fetch of session details
                // And for the final update of session status
                // We need a way to differentiate or make the spies return different things based on call order or context
                // For now, assuming the first call is select, second is update for simplicity in this structure
                // This is fragile. A better mock would inspect the query type (select/update)
                if (mockSessionSelectSpy.calls.length === 0) { // Crude way to distinguish select from update
                    return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy }; // Provide both for first call context
                } else {
                    return { update: mockSessionUpdateSpy, select: mockSessionSelectSpy }; // And for subsequent
                }
            } else if (tableName === 'dialectic_contributions') {
                return {
                    insert: mockContributionInsertSpy, // Use the refined insert spy
                };
            }
            // Fallback for unexpected table name
            console.warn(`Mock DBClient called with unexpected table: ${tableName}`);
            return { // Provide all methods to avoid crashing if code unexpectedly calls something else
                select: spy(() => ({ eq: spy(() => ({ single: spy(async () => await Promise.resolve({ data: null, error: { message: `Unexpected select on ${tableName}` } })) })) })),
                insert: spy(() => ({ select: spy(() => ({ single: spy(async () => await Promise.resolve({ data: null, error: { message: `Unexpected insert on ${tableName}` } })) })) })),
                update: spy(() => ({ eq: spy(async () => await Promise.resolve({ error: { message: `Unexpected update on ${tableName}` } })) })),
            };
        }),
    };


    const mockCallUnifiedAIModel = spy(async (
        _modelId: string, 
        _prompt: string, 
        _chatId: string, 
        _authToken: string, 
        _options?: CallUnifiedAIModelOptions
    ): Promise<UnifiedAIResponse> => await Promise.resolve({
        content: mockContent,
        inputTokens: 10,
        outputTokens: 20,
        cost: 0.001,
        processingTimeMs: 1000,
        error: null,
        errorCode: null,
        rawProviderResponse: { modelOutput: "raw output" },
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
        const result = await generateThesisContributions(
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
        assertObjectMatch(result.data?.contributions?.[0] as any, {
            id: mockContributionId,
            session_id: mockSessionId,
            session_model_id: mockSessionModelId,
            stage: 'thesis',
            content_storage_path: mockContentStoragePath,
            raw_response_storage_path: mockRawResponseStoragePath,
            tokens_used_input: 10,
            tokens_used_output: 20,
            cost_usd: 0.001,
            content_size_bytes: mockFileSize,
            processing_time_ms: 1000,
        });
        assertEquals(result.error, undefined);

        // Verify mocks were called
        const fromSpy = mockDbClient.from as Stub;
        // Expected calls: 
        // 1. dialectic_sessions (fetch session)
        // 2. dialectic_contributions (insert contribution)
        // 3. dialectic_sessions (update session status)
        assertEquals(fromSpy.calls.length, 3); 
        assertEquals(fromSpy.calls[0].args[0], 'dialectic_sessions');
        assertEquals(fromSpy.calls[1].args[0], 'dialectic_contributions');
        assertEquals(fromSpy.calls[2].args[0], 'dialectic_sessions');

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

        // Assertions for the call to dialectic_contributions (insert)
        assertEquals(mockContributionInsertSpy.calls.length, 1);
        assertEquals(mockContributionInsertSelectSpy.calls.length, 1); // Called by mockContributionInsertSpy
        assertEquals(mockContributionInsertSelectSingleSpy.calls.length, 1); // Called by mockContributionInsertSelectSpy
        
        // Check the actual argument passed to the insert spy
        const actualInsertArg = capturedInsertArg;
        assertExists(actualInsertArg, "capturedInsertArg should exist after insert call"); // Ensure it exists
        assertObjectMatch(actualInsertArg as object, {
            session_id: mockSessionId,
            session_model_id: mockSessionModelId,
            stage: 'thesis',
            content_storage_bucket: 'dialectic-contributions',
            content_storage_path: mockContentStoragePath,
            raw_response_storage_path: mockRawResponseStoragePath,
            tokens_used_input: 10,
            tokens_used_output: 20,
            cost_usd: 0.001,
            content_size_bytes: mockFileSize,
            processing_time_ms: 1000,
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


        // Check logger calls (basic checks)
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Fetched session details for ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Processing model: ${mockProviderName} - ${mockModelName}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`AI response received from ${mockProviderName} - ${mockModelName}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Uploading content for ${mockProviderName} - ${mockModelName} to: ${mockContentStoragePath}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Content uploaded successfully for ${mockProviderName} - ${mockModelName}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Uploading raw response for ${mockProviderName} - ${mockModelName} to: ${mockRawResponseStoragePath}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Raw response uploaded successfully for ${mockProviderName} - ${mockModelName}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Fetched metadata for ${mockContentStoragePath}, size: ${mockFileSize}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Inserting contribution to DB for ${mockProviderName} - ${mockModelName}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Contribution inserted to DB successfully for ${mockProviderName} - ${mockModelName}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Finished processing all models for session ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Updating session ${mockSessionId} status to: thesis_generation_complete`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Session ${mockSessionId} status updated to thesis_generation_complete`)));
        assert(localLoggerInfo.calls.some(call => call.args[0].includes(`Successfully completed for session ${mockSessionId}. Status: thesis_generation_complete`)));
        assertEquals(localLoggerError.calls.length, 0);
        assertEquals(localLoggerWarn.calls.length, 0);

    } finally {
        // Restore local logger spies
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
        // mockCallUnifiedAIModel, mockUploadToStorage, etc., are now spies on new functions, not stubs on modules.
        // No restore needed for them, nor for mockRandomUUID (spy on a new function).
        // mockDbClient spies are also from jsr, no restore needed for its `from` spy as it's on a new object.
    }
});

Deno.test("generateStageContributions - Multiple Models (some success, some fail)", async () => {
    const mockAuthToken = "test-auth-token-multi";
    const mockSessionId = "test-session-id-multi";
    const mockProjectId = "test-project-id-multi";
    const mockChatId = "test-chat-id-multi";
    const mockInitialPrompt = "Test initial prompt for multiple models";

    const mockModelProviderId1 = "ai-provider-id-1";
    const mockSessionModelId1 = "session-model-id-1";
    const mockApiIdentifier1 = "api-identifier-1";
    const mockProviderName1 = "ProviderOne";
    const mockModelName1 = "ModelOne";
    const mockContributionId1 = "contrib-uuid-1";
    const mockContent1 = "Generated content from model 1.";

    const mockModelProviderId2 = "ai-provider-id-2";
    const mockSessionModelId2 = "session-model-id-2";
    const mockApiIdentifier2 = "api-identifier-2";
    const mockProviderName2 = "ProviderTwo";
    const mockModelName2 = "ModelTwo";
    // No contribution ID or content for model 2 as it will fail

    const mockContentType = "text/markdown";
    const mockFileExtension = ".md";
    const mockContentStoragePath1 = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId1}/thesis${mockFileExtension}`;
    const mockRawResponseStoragePath1 = `projects/${mockProjectId}/sessions/${mockSessionId}/contributions/${mockContributionId1}/raw_thesis_response.json`;
    const mockFileSize = 50;

    const mockPayload: GenerateStageContributionsPayload = {
        sessionId: mockSessionId,
        stage: 'thesis',
    };

    // --- Spies for DB client --- 
    let capturedInsertArg1: any = null;
    const mockContributionInsertSelectSingleSpy = spy(async () => {
        assertExists(capturedInsertArg1, "capturedInsertArg1 must be set by mockContributionInsertSpy");
        return await Promise.resolve({
            data: {
                id: mockContributionId1,
                ...capturedInsertArg1 
            },
            error: null,
        });
    });
    const mockContributionInsertSelectSpy = spy(() => ({ single: mockContributionInsertSelectSingleSpy }));
    const mockContributionInsertSpy = spy((data: any) => {
        capturedInsertArg1 = data;
        return { select: mockContributionInsertSelectSpy };
    });

    const mockSessionUpdateEqSpy = spy<[string, string], Promise<{error: Error | null}>>(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy<[Partial<Database['public']['Tables']['dialectic_sessions']['Update']>] , { eq: Stub }>(() => ({ eq: mockSessionUpdateEqSpy as Stub }));

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: mockProjectId,
            status: 'pending_thesis',
            associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                {
                    id: mockSessionModelId1,
                    model_id: mockModelProviderId1,
                    ai_providers: { id: mockModelProviderId1, provider_name: mockProviderName1, model_name: mockModelName1, api_identifier: mockApiIdentifier1 },
                },
                {
                    id: mockSessionModelId2,
                    model_id: mockModelProviderId2,
                    ai_providers: { id: mockModelProviderId2, provider_name: mockProviderName2, model_name: mockModelName2, api_identifier: mockApiIdentifier2 },
                },
            ],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClientFromSpy = spy((tableName: string) => {
        if (tableName === 'dialectic_sessions') {
            return (mockSessionSelectSpy.calls.length === 0) ? 
                   { select: mockSessionSelectSpy, update: mockSessionUpdateSpy } : 
                   { update: mockSessionUpdateSpy, select: mockSessionSelectSpy }; 
        } else if (tableName === 'dialectic_contributions') {
            return { insert: mockContributionInsertSpy };
        }
        console.warn(`Mock DBClient (multi-test) called with unexpected table: ${tableName}`);
        return { select: spy(), insert: spy(), update: spy() }; // Basic fallback
    });
    const mockDbClient: any = { from: mockDbClientFromSpy };    

    // --- Spies for dependencies --- 
    const mockCallUnifiedAIModel = spy(returnsNext([
        Promise.resolve({ // Success for model 1
            content: mockContent1,
            inputTokens: 10, outputTokens: 20, cost: 0.001, processingTimeMs: 100,
            error: null, errorCode: null, rawProviderResponse: { raw: "model1_raw" },
        }),
        Promise.resolve({ // Failure for model 2
            content: null,
            error: "AI model call failed for model 2", errorCode: "AI_CALL_FAILED",
            inputTokens: 5, outputTokens: 0, cost: 0.0001, processingTimeMs: 50,
            rawProviderResponse: { raw_error: "model2_error_details" },
        }),
    ]));

    const mockUploadToStorage = spy(async (_db: any, _bkt: string, path: string, _cnt: any, _opt: any): Promise<UploadStorageResult> => await Promise.resolve({ error: null, path }));
    const mockGetFileMetadata = spy(async (): Promise<{ size?: number; mimeType?: string; error: Error | null; }> => await Promise.resolve({ size: mockFileSize, mimeType: mockContentType, error: null }));
    const mockDeleteFromStorage = spy(async (): Promise<DeleteStorageResult> => await Promise.resolve({ data: [], error: null }));
    const mockGetExtensionFromMimeType = spy((_mimeType: string): string => mockFileExtension);
    const mockRandomUUID = spy(returnsNext([mockContributionId1])); // Only one success, so one UUID needed

    // Spies for logger - re-initialize for this test
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    try {
        const result = await generateThesisContributions(
            mockDbClient as any,
            mockPayload,
            mockAuthToken,
            {
                callUnifiedAIModel: mockCallUnifiedAIModel,
                uploadToStorage: mockUploadToStorage,
                getFileMetadata: mockGetFileMetadata,
                deleteFromStorage: mockDeleteFromStorage,
                getExtensionFromMimeType: mockGetExtensionFromMimeType,
                logger: logger, 
                randomUUID: mockRandomUUID
            }
        );

        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data?.sessionId, mockSessionId);
        assertEquals(result.data?.status, 'thesis_generation_partial');
        assertEquals(result.data?.contributions?.length, 1);
        assertEquals(result.data?.errors?.length, 1);

        // Assertions for successful contribution (model 1)
        const successfulContribution = result.data?.contributions?.[0];
        assertExists(successfulContribution);
        assertObjectMatch(successfulContribution as any, {
            id: mockContributionId1,
            session_id: mockSessionId,
            session_model_id: mockSessionModelId1,
            stage: 'thesis',
            content_storage_path: mockContentStoragePath1,
            raw_response_storage_path: mockRawResponseStoragePath1,
            tokens_used_input: 10,
            tokens_used_output: 20,
            cost_usd: 0.001,
            content_size_bytes: mockFileSize,
            processing_time_ms: 100,
        });

        // Assertions for failed contribution (model 2)
        const failedAttempt = result.data?.errors?.[0];
        assertExists(failedAttempt);
        assertEquals(failedAttempt?.modelId, mockModelProviderId2);
        assertEquals(failedAttempt?.message, "AI model call failed for model 2");
        assertExists(failedAttempt?.details, "Details string should exist for failed attempt");
        assert(typeof failedAttempt?.details === 'string', "Details should be a string");
        // deno-lint-ignore-next-line
        assert((failedAttempt?.details as string).includes("Code: AI_CALL_FAILED"), "Details string should include error code");

        // Verify mock calls
        assertEquals(mockDbClientFromSpy.calls.length, 3);
        assertEquals(mockSessionSelectSpy.calls.length, 1);
        assertEquals(mockContributionInsertSpy.calls.length, 1); // Only 1 insert for the successful model
        assertEquals(mockSessionUpdateSpy.calls.length, 1);
        
        assertEquals(mockCallUnifiedAIModel.calls.length, 2); // Called for both models
        if (mockCallUnifiedAIModel.calls.length === 2) { // Guard for linter
            const firstCall = mockCallUnifiedAIModel.calls[0];
            const secondCall = mockCallUnifiedAIModel.calls[1];
            assertExists(firstCall?.args, "Args for first AI call should exist");
            assertExists(secondCall?.args, "Args for second AI call should exist");
            // deno-lint-ignore no-explicit-any
            assertEquals(firstCall.args[0], mockModelProviderId1);
            // deno-lint-ignore no-explicit-any
            assertEquals(secondCall.args[0], mockModelProviderId2);
        }

        assertEquals(mockRandomUUID.calls.length, 1); // Called once for the successful contribution
        assertEquals(mockUploadToStorage.calls.length, 2); // Content + raw for the successful one
        assertEquals(mockGetFileMetadata.calls.length, 1); // For the successful one

        // Check logger calls (simplified checks)
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Processing model: ${mockProviderName1}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Processing model: ${mockProviderName2}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Error from callUnifiedAIModel for ${mockProviderName2}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Finished processing all models for session ${mockSessionId}`)));
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Updating session ${mockSessionId} status to: thesis_generation_partial`)));

    } finally {
        // Restore any test-specific stubs or spies if they were not global with afterEach/restoreAll setup
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});



