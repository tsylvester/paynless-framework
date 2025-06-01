import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateStageContributions } from "./generateContribution.ts";
import type { 
    UnifiedAIResponse,
    GenerateStageContributionsPayload
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";

Deno.test("generateStageContributions - Session has no AI models", async () => {
    const mockAuthToken = "auth-token-no-models";
    const mockSessionId = "session-id-no-models";
    const mockProjectId = "project-id-no-models";
    const mockChatId = "chat-id-no-models";
    const mockInitialPrompt = "Prompt for no models";

    const mockPayload: GenerateThesisContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [], // Key: No models
        }, error: null
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockSessionUpdateEqSpy = spy<[string, string], Promise<{error: Error | null}>>(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy<[Partial<Database['public']['Tables']['dialectic_sessions']['Update']>] , { eq: Stub }>(() => ({ eq: mockSessionUpdateEqSpy as Stub }));

    const mockDbClientFromSpy = spy((tableName: string) => {
        if (tableName === 'dialectic_sessions') {
             if (mockSessionUpdateSpy.calls.length === 0) { 
                return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy }; 
            }
            return { update: mockSessionUpdateSpy, select: mockSessionSelectSpy }; 
        }
        return { select: spy(), insert: spy(), update: spy() };
    });
    const mockDbClient: any = { from: mockDbClientFromSpy };

    const mockDeps = {
        callUnifiedAIModel: spy(async () => await Promise.resolve({} as UnifiedAIResponse)), // Should not be called
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy" })),
        getFileMetadata: spy(async () => await Promise.resolve({ size: 0, error: null })),
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".txt"),
        logger: logger,
        randomUUID: spy(() => "dummy-uuid")
    };

    try {
        const result = await generateThesisContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        // If no models, it behaves like all models failed because successfulContributions will be empty.
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate thesis contributions.");
        assertEquals(result.error?.status, 500);
        // Details might be empty or indicate no models were processed.
        // The current code would have an empty `failedContributionAttempts` leading to an empty `errorDetails`.
        assertEquals(result.error?.details, ""); 

        assertEquals(mockDeps.callUnifiedAIModel.calls.length, 0);
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Finished processing all models for session")));
        assert(localLoggerInfo.calls.some(call => typeof call.args[1] === 'object' && (call.args[1] as any).successful === 0 && (call.args[1] as any).failed === 0));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`All models failed to generate contributions for session ${mockSessionId}`)));
        
        // Check that the session status update was NOT called to set to 'complete' or 'partial'
        // because the function should return early.
        assertEquals(mockSessionUpdateSpy.calls.length, 0);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - All selected AI models fail", async () => {
    // ... (similar setup to multi-model test, but all AI calls fail) ...
    const mockAuthToken = "auth-token-all-fail";
    const mockSessionId = "session-id-all-fail";
    const mockProjectId = "project-id-all-fail";
    const mockChatId = "chat-id-all-fail";
    const mockInitialPrompt = "Prompt for all fail";
    const mockModelProviderId1 = "mp-id1-all-fail";
    const mockSessionModelId1 = "sm-id1-all-fail";
    const mockModelProviderId2 = "mp-id2-all-fail";
    const mockSessionModelId2 = "sm-id2-all-fail";

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId, project_id: mockProjectId, status: 'pending_thesis', associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                { id: mockSessionModelId1, model_id: mockModelProviderId1, ai_providers: { id: mockModelProviderId1, provider_name: "P1", model_name: "M1", api_identifier: "api1" } },
                { id: mockSessionModelId2, model_id: mockModelProviderId2, ai_providers: { id: mockModelProviderId2, provider_name: "P2", model_name: "M2", api_identifier: "api2" } }
            ]
        }, error: null
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    // No contribution insert or session update mocks needed if all fail before that
    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: spy(() => ({ eq: spy(async () => Promise.resolve({error: null })) })) }; // Update will be called for session status
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: null, error: "Simulated AI fail", errorCode: "AI_FAIL" }));

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy" })),
        getFileMetadata: spy(async () => await Promise.resolve({ size: 0, error: null })),
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".txt"),
        logger: logger,
        randomUUID: spy(() => "dummy-uuid") // Won't be called if AI fails
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);
        assert(result.error?.details?.includes("Simulated AI fail"));

        assertEquals(mockDeps.callUnifiedAIModel.calls.length, 2); // Called for both models
        assertEquals(mockDeps.uploadToStorage.calls.length, 0);
        assertEquals(mockDbClient.from.calls.find((call:any) => call.args[0] === 'dialectic_contributions'), undefined); // No DB insert attempted
        
        const sessionUpdateCall = mockDbClient.from.calls.findLast((call:any) => call.args[0] === 'dialectic_sessions');
        // This is tricky: if ALL models fail, the session status update *should not* happen. 
        // The current code updates to pending_thesis -> all_failed if no successes. Let's test this implicit update does not happen.
        // If it *did* update, it would be to 'thesis_generation_complete' or 'thesis_generation_partial' *if* there were successes.
        // Since there are no successes, the function should return early, before the final status update for success cases.
        // The session status update to 'failed' status for the session itself, if any, is outside the scope of *this function's direct responsibility*
        // if the contract is to only update on success/partial success of *contribution generation*.
        // However, the code *does* update session to pending_thesis -> (thesis_generation_partial or thesis_generation_complete) or *if all fail, returns before this update*.
        // Let's ensure no session update to 'complete' or 'partial' occurs.
        // The final status update to 'complete' or 'partial' should only happen if there's at least one success.
        // Here, there are no successes, so that update shouldn't occur. The function returns early.
        const updateSpyForSessions = mockDbClient.from.calls.find((c:any) => c.args[0] === 'dialectic_sessions').returnValue.update;
        assertExists(updateSpyForSessions);
        assertEquals(updateSpyForSessions.calls.length, 1); // This is the final status update after the loop.
                                                        // If all fail, it updates status before returning the overall failure.
        // The code sets `finalStatus` and then updates. If successfulContributions.length is 0, it returns early.
        // No, wait. If successfulContributions.length is 0, it returns an error and does NOT proceed to the final status update block.
        // So, the updateSpyForSessions should NOT have been called for the final status update.
        // The only .from('dialectic_sessions') call should be the initial select.
        assertEquals(mockDbClient.from.calls.filter((c:any) => c.args[0] === 'dialectic_sessions').length, 1);

        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`All models failed to generate contributions for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - AI Provider details missing for a model", async () => {
    const mockAuthToken = "auth-token-provider-missing";
    const mockSessionId = "session-id-provider-missing";
    const mockProjectId = "project-id-provider-missing";
    const mockChatId = "chat-id-provider-missing";
    const mockInitialPrompt = "Initial prompt here";
    const mockSessionModelId = "sm-id-1";
    const mockModelProviderId = "mp-id-1";

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: mockProjectId,
            status: 'pending_thesis',
            associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                {
                    id: mockSessionModelId,
                    model_id: mockModelProviderId, 
                    ai_providers: null, // Key for this test: provider details are null
                },
            ],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy<[string, string], { single: Stub }>(() => ({ single: mockSessionSelectEqSingleSpy as Stub }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: spy(() => ({eq: spy(async () => Promise.resolve({error: null}))})) }; // update is for session status at end
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDeps = {
        callUnifiedAIModel: spy(async () => await Promise.resolve({} as UnifiedAIResponse)), // Should not be called
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy" })),
        getFileMetadata: spy(async () => await Promise.resolve({ size: 0, error: null })),
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".txt"),
        logger: logger,
        randomUUID: spy(() => "dummy-uuid")
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);
        assertExists(result.error?.details);
        assert(typeof result.error.details === 'string' && result.error.details.includes("AI Provider details (expected as direct object from joined 'ai_providers' table) missing, null, or not an object."));
        
        assertEquals(mockDeps.callUnifiedAIModel.calls.length, 0);
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("AI Provider details (expected as direct object) missing or not an object for sessionModel")));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`All models failed to generate contributions for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - callUnifiedAIModel returns no content (but no error object)", async () => {
    const mockAuthToken = "auth-token-no-content";
    const mockSessionId = "session-id-no-content";
    // ... other necessary mock constants like projectId, chatId, initialPrompt ...
    const mockProjectId = "project-id-no-content";
    const mockChatId = "chat-id-no-content";
    const mockInitialPrompt = "Prompt for no content";
    const mockModelProviderId = "mp-id-no-content";
    const mockSessionModelId = "sm-id-no-content";
    const mockApiIdentifier = "api-id-no-content";
    const mockProviderName = "ProvNoContent";
    const mockModelName = "ModNoContent";

    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: mockProjectId,
            status: 'pending_thesis',
            associated_chat_id: mockChatId,
            dialectic_projects: { initial_user_prompt: mockInitialPrompt, selected_domain_tag: null },
            dialectic_session_models: [
                {
                    id: mockSessionModelId,
                    model_id: mockModelProviderId, 
                    ai_providers: { id: mockModelProviderId, provider_name: mockProviderName, model_name: mockModelName, api_identifier: mockApiIdentifier },
                },
            ],
        },
        error: null,
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
        content: null, // Key: No content
        error: null, // Key: No error object
        errorCode: "NO_CONTENT_RETURNED",
        inputTokens: 5, outputTokens: 0, cost: 0.0001, processingTimeMs: 50,
    }));

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy" })),
        getFileMetadata: spy(async () => await Promise.resolve({ size: 0, error: null })),
        deleteFromStorage: spy(async () => await Promise.resolve({ data: [], error: null })),
        getExtensionFromMimeType: spy(() => ".txt"),
        logger: logger,
        randomUUID: spy(() => "dummy-uuid")
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assert(result.error?.details?.includes("AI model returned no content."));

        assertEquals(mockDeps.callUnifiedAIModel.calls.length, 1);
        assertEquals(mockDeps.uploadToStorage.calls.length, 0); // Should not attempt upload
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes("Error from callUnifiedAIModel")));
        assert(localLoggerError.calls.some(call => typeof call.args[1] === 'object' && (call.args[1] as any)?.error === "AI model returned no content."));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});
