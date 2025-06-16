import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import type { 
    GenerateContributionsPayload, 
    UnifiedAIResponse,
    DialecticStage
} from "./dialectic.interface.ts";
import { logger } from "../_shared/logger.ts";

Deno.test("generateContributions - Session not in 'pending_stage' status", async () => {
    const mockAuthToken = "test-auth-token-status";
    const mockSessionId = "test-session-id-status";
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis', iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mock for DB client: stage and session fetch
    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: 'thesis', name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'completed', // Key for this test
            associated_chat_id: "any-chat-id",
            dialectic_projects: { initial_user_prompt: "any-prompt", selected_domain_id: null },
            dialectic_session_models: [{ /* minimal model data */
                id: "sm-id", model_id: "m-id", 
                ai_providers: { id: "m-id", provider_name: "p", model_name: "m", api_identifier: "api-id" }
            }],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') {
                return { select: mockSessionSelectSpy }; 
            }
            if (tableName === 'dialectic_stages') {
                return { select: mockStageSelectSpy };
            }
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };
    
    const mockCallUnifiedAIModel = spy(async () => await Promise.resolve({ content: "dummy" } as UnifiedAIResponse));
    const mockUploadToStorage = spy(async () => await Promise.resolve({ error: null, path: "dummy" }));
    const mockGetFileMetadata = spy(async () => await Promise.resolve({ size: 0, error: null }));
    const mockDeleteFromStorage = spy(async () => await Promise.resolve({ data: [], error: null }));
    const mockGetExtensionFromMimeType = spy(() => ".txt");
    const mockRandomUUID = spy(() => "dummy-uuid");

    try {
        const result = await generateContributions(
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

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, `Session is not in 'pending_thesis' status. Current status: completed`);
        assertEquals(result.error?.status, 400);

        const fromSpy = mockDbClient.from as Stub;
        assertEquals(fromSpy.calls.length, 2);
        assertEquals(fromSpy.calls[0].args[0], 'dialectic_stages');
        assertEquals(fromSpy.calls[1].args[0], 'dialectic_sessions');
        assertEquals(mockSessionSelectSpy.calls.length, 1);
        
        assertEquals(mockCallUnifiedAIModel.calls.length, 0);
        
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerWarn.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Session ${mockSessionId} is not in 'pending_thesis' status. Current status: completed`)));
        assertEquals(localLoggerError.calls.length, 0);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - Project details (dialectic_projects) not found", async () => {
    const mockAuthToken = "test-auth-token-proj-details";
    const mockSessionId = "test-session-id-proj-details";
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis', iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: 'thesis', name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'pending_thesis',
            associated_chat_id: "any-chat-id",
            dialectic_projects: null, // Key for this test
            dialectic_session_models: [{ id: "sm-id", model_id: "m-id", ai_providers: { id: "m-id", provider_name: "p", model_name: "m", api_identifier: "api-id" }}],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy };
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };
    
    const mockDeps = {
        logger: logger,
        randomUUID: spy(() => "dummy-uuid"),
        callUnifiedAIModel: spy(async () => await Promise.resolve({ content: null, error: "mock error", errorCode: "MOCK_ERROR"} as UnifiedAIResponse)),
        uploadToStorage: spy(async () => await Promise.resolve({error: null, path: "dummy"})),
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
        getFileMetadata: spy(async () => await Promise.resolve({size: 0, error: null})),
        deleteFromStorage: spy(async () => await Promise.resolve({data:[], error: null})),
        getExtensionFromMimeType: spy(() => ".txt")
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "No models selected for this session.");
        assertEquals(result.error?.status, 400);

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`No models selected for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - Initial user prompt missing", async () => {
    const mockAuthToken = "test-auth-token-prompt-missing";
    const mockSessionId = "test-session-id-prompt-missing";
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis', iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: 'thesis', name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'pending_thesis',
            associated_chat_id: "any-chat-id",
            dialectic_projects: { initial_user_prompt: null, selected_domain_id: null }, // Key for this test
            dialectic_session_models: [{ id: "sm-id", model_id: "m-id", ai_providers: { id: "m-id", provider_name: "p", model_name: "m", api_identifier: "api-id" }}],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy };
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDeps = { 
        logger: logger, 
        randomUUID: spy(() => "dummy-uuid"), 
        callUnifiedAIModel: spy(async () => await Promise.resolve({ content: null, error: "mock error", errorCode: "MOCK_ERROR"} as UnifiedAIResponse)), 
        uploadToStorage: spy(async () => await Promise.resolve({error: null, path: "dummy"})),
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
        getFileMetadata: spy(async () => await Promise.resolve({size: 0, error: null})), 
        deleteFromStorage: spy(async () => await Promise.resolve({data:[], error: null})), 
        getExtensionFromMimeType: spy(() => ".txt")
    };


    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "No models selected for this session.");
        assertEquals(result.error?.status, 400);
        
        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`No models selected for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - Associated chat ID missing", async () => {
    const mockAuthToken = "test-auth-token-chatid-missing";
    const mockSessionId = "test-session-id-chatid-missing";
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis', iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: 'thesis', name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'pending_thesis',
            associated_chat_id: null, // Key for this test
            dialectic_projects: { initial_user_prompt: "Valid prompt", selected_domain_id: null },
            dialectic_session_models: [{ id: "sm-id", model_id: "m-id", ai_providers: { id: "m-id", provider_name: "p", model_name: "m", api_identifier: "api-id" }}],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy };
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };
    const mockDeps = { 
        logger: logger, 
        randomUUID: spy(() => "dummy-uuid"), 
        callUnifiedAIModel: spy(async () => await Promise.resolve({ content: null, error: "mock error", errorCode: "MOCK_ERROR"} as UnifiedAIResponse)), 
        uploadToStorage: spy(async () => await Promise.resolve({error: null, path: "dummy"})),
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
        getFileMetadata: spy(async () => await Promise.resolve({size: 0, error: null})), 
        deleteFromStorage: spy(async () => await Promise.resolve({data:[], error: null})), 
        getExtensionFromMimeType: spy(() => ".txt")
    };


    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "Associated chat ID is missing for session.");
        assertEquals(result.error?.status, 500);

        assert(localLoggerInfo.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Starting for session ID: ${mockSessionId}`)));
        assert(localLoggerError.calls.some(call => typeof call.args[0] === 'string' && call.args[0].includes(`Associated chat ID is missing for session ${mockSessionId}`)));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});
