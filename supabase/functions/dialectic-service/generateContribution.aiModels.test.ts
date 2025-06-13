import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateStageContributions } from "./generateContribution.ts";
import type { 
    UnifiedAIResponse,
    GenerateStageContributionsPayload,
    DialecticStage,
    FailedAttemptError
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";

Deno.test("generateStageContributions - Handles no selected models for session", async () => {
    const mockAuthToken = "auth-token-no-models";
    const mockSessionId = "session-id-no-models";
    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis' as DialecticStage, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mock for DB client: session fetch returns no models
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'pending_thesis',
            associated_chat_id: "any-chat-id",
            selected_model_catalog_ids: [], // Key for this test
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDeps = {
        logger: logger,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
        // Other deps won't be called if no models
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);
        
        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "No models selected for this session.");
        assertEquals(result.error?.status, 400);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - All selected AI models fail", async () => {
    const mockAuthToken = "auth-token-all-fail";
    const mockSessionId = "session-id-all-fail";
    const mockModelCatalogId1 = "mp-id1-all-fail";
    const mockModelCatalogId2 = "mp-id2-all-fail";
    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis' as DialecticStage, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mock session fetch
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'pending_thesis',
            associated_chat_id: "any-chat-id",
            selected_model_catalog_ids: [mockModelCatalogId1, mockModelCatalogId2],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    // Mock AI provider fetch to return two different providers
    const mockProviderSingle1 = spy(async () => await Promise.resolve({ data: { id: mockModelCatalogId1, provider: "P1", name: "M1", api_identifier: "api1" }, error: null }));
    const mockProviderSingle2 = spy(async () => await Promise.resolve({ data: { id: mockModelCatalogId2, provider: "P2", name: "M2", api_identifier: "api2" }, error: null }));
    const mockProviderEqSpy = spy(returnsNext([
        { single: mockProviderSingle1 },
        { single: mockProviderSingle2 }
    ]));
    const mockProviderSelectSpy = spy(() => ({ eq: mockProviderEqSpy }));

    // Mock session status update
    const mockSessionUpdateEqSpy = spy(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy(() => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockProviderSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: null, error: "Simulated AI fail", errorCode: "AI_FAIL" }));

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy" })),
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
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
        
        const details = result.error?.details as FailedAttemptError[];
        assertExists(details);
        assertEquals(details.length, 2);
        assert(details.some(d => d.error === "Simulated AI fail" && d.modelId === mockModelCatalogId1));
        assert(details.some(d => d.error === "Simulated AI fail" && d.modelId === mockModelCatalogId2));

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});


Deno.test("generateStageContributions - AI Provider details fetch fails", async () => {
    const mockAuthToken = "auth-token-provider-missing";
    const mockSessionId = "session-id-provider-missing";
    const mockModelCatalogId = "mp-id-1";
    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis' as DialecticStage, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mock session fetch
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'pending_thesis',
            associated_chat_id: "any-chat-id",
            selected_model_catalog_ids: [mockModelCatalogId],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    // Mock AI provider fetch to return an error
    const mockProviderSelectEqSingleSpy = spy(async () => await Promise.resolve({ data: null, error: { message: "Simulated DB error", code: "DB_ERROR" } }));
    const mockProviderSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockProviderSelectEqSingleSpy }));
    const mockProviderSelectSpy = spy(() => ({ eq: mockProviderSelectEqSpy }));

    const mockSessionUpdateEqSpy = spy(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy(() => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockProviderSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDeps = {
        logger: logger,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);
        
        const details = result.error?.details as FailedAttemptError[];
        assertExists(details);
        assertEquals(details.length, 1);
        assertEquals(details[0].error, "Failed to fetch AI Provider details from database.");
        assertEquals(details[0].details, "Simulated DB error");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateStageContributions - AI model returns no content", async () => {
    const mockAuthToken = "auth-token-no-content";
    const mockSessionId = "session-id-no-content";
    const mockModelCatalogId = "mp-id-no-content";
    const mockPayload: GenerateStageContributionsPayload = { sessionId: mockSessionId, stageSlug: 'thesis' as DialecticStage, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mock session fetch
    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: "any-project-id",
            status: 'pending_thesis',
            associated_chat_id: "any-chat-id",
            selected_model_catalog_ids: [mockModelCatalogId],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    // Mock AI provider fetch
    const mockProviderSelectEqSingleSpy = spy(async () => await Promise.resolve({ data: { id: mockModelCatalogId, provider: "P1", name: "M-NoContent", api_identifier: "api-no-content" }, error: null }));
    const mockProviderSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockProviderSelectEqSingleSpy }));
    const mockProviderSelectSpy = spy(() => ({ eq: mockProviderSelectEqSpy }));


    const mockSessionUpdateEqSpy = spy(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy(() => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockProviderSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    // Mock AI call to return no content
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: null, error: null }));

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
        logger: logger,
    };

    try {
        const result = await generateStageContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);

        assertEquals(result.success, false);
        assertExists(result.error);
        assertEquals(result.error?.message, "All models failed to generate stage contributions.");
        assertEquals(result.error?.status, 500);

        const details = result.error?.details as FailedAttemptError[];
        assertExists(details);
        assertEquals(details.length, 1);
        assertEquals(details[0].error, "AI model returned no content.");
        assertEquals(details[0].modelId, mockModelCatalogId);

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});
