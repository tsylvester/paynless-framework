import { assertEquals, assertExists, assertObjectMatch, assertRejects, assert } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { spy, stub, type Stub, returnsNext } from "jsr:@std/testing@0.225.1/mock";
import { generateContributions } from "./generateContribution.ts";
import type { 
    UnifiedAIResponse,
    GenerateContributionsPayload,
    DialecticStage,
    FailedAttemptError
} from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";

Deno.test("generateContributions - Handles no selected models for session", async () => {
    const mockAuthToken = "auth-token-no-models";
    const mockSessionId = "session-id-no-models";
    const mockStageSlug = 'thesis';
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mock for DB client:
    // 1. Mock for stage fetch
    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    // 2. Mock for session fetch returns no models
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
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDeps = {
        logger: logger,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
        // Other deps won't be called if no models
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);
        
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

Deno.test("generateContributions - All selected AI models fail", async () => {
    const mockAuthToken = "auth-token-all-fail";
    const mockSessionId = "session-id-all-fail";
    const mockModelCatalogId1 = "mp-id1-all-fail";
    const mockModelCatalogId2 = "mp-id2-all-fail";
    const mockStageSlug = 'thesis';
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mocks for DB Client
    // 1. Mock for stage fetch
    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    // 2. Mock session fetch
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

    // 3. Mock AI provider fetch to return two different providers
    const mockProviderSingle1 = spy(async () => await Promise.resolve({ data: { id: mockModelCatalogId1, provider: "P1", name: "M1", api_identifier: "api1" }, error: null }));
    const mockProviderSingle2 = spy(async () => await Promise.resolve({ data: { id: mockModelCatalogId2, provider: "P2", name: "M2", api_identifier: "api2" }, error: null }));
    const mockProviderEqSpy = spy(returnsNext([
        { single: mockProviderSingle1 },
        { single: mockProviderSingle2 }
    ]));
    const mockProviderSelectSpy = spy(() => ({ eq: mockProviderEqSpy }));

    // 4. Mock session status update
    const mockSessionUpdateEqSpy = spy(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy(() => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockProviderSelectSpy };
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
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
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps);
        
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


Deno.test("generateContributions - AI Provider details fetch fails", async () => {
    const mockAuthToken = "auth-token-provider-missing";
    const mockSessionId = "session-id-provider-missing";
    const mockModelCatalogId = "mp-id-1";
    const mockStageSlug = 'thesis';
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mocks for DB Client
    // 1. Mock for stage fetch
    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    // 2. Mock session fetch
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

    // 3. Mock AI provider fetch to return an error
    const mockProviderSelectEqSingleSpy = spy(async () => await Promise.resolve({ data: null, error: { message: "Simulated DB error", code: "DB_ERROR" } }));
    const mockProviderSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockProviderSelectEqSingleSpy }));
    const mockProviderSelectSpy = spy(() => ({ eq: mockProviderSelectEqSpy }));

    // 4. Mock session status update
    const mockSessionUpdateEqSpy = spy(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy(() => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockProviderSelectSpy };
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockDeps = {
        logger: logger,
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), error: null })),
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
        assertEquals(details[0].error, "Failed to fetch AI Provider details from database.");
        assertEquals(details[0].details, "Simulated DB error");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});

Deno.test("generateContributions - AI model returns no content", async () => {
    const mockAuthToken = "auth-token-no-content";
    const mockSessionId = "session-id-no-content";
    const mockModelCatalogId = "mp-id-no-content";
    const mockStageSlug = 'thesis';
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: 1 };

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mocks for DB Client
    // 1. Mock for stage fetch
    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    // 2. Mock session fetch
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

    // 3. Mock AI provider fetch
    const mockProviderSelectEqSingleSpy = spy(async () => await Promise.resolve({ data: { id: mockModelCatalogId, provider: "P1", name: "M-NoContent", api_identifier: "api-no-content" }, error: null }));
    const mockProviderSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockProviderSelectEqSingleSpy }));
    const mockProviderSelectSpy = spy(() => ({ eq: mockProviderSelectEqSpy }));

    // 4. Mock session status update
    const mockSessionUpdateEqSpy = spy(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy(() => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockProviderSelectSpy };
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
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
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);

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

Deno.test("generateContributions - Successfully generates one contribution", async () => {
    const mockAuthToken = "auth-token-success";
    const mockSessionId = "session-id-success";
    const mockModelCatalogId = "mp-id-success";
    const mockStageSlug = 'thesis';
    const mockPayload: GenerateContributionsPayload = { sessionId: mockSessionId, stageSlug: mockStageSlug, iterationNumber: 1 };
    const mockContributionId = "contribution-id-1";
    const mockProjectId = "project-id-1";
    const mockChatId = "chat-id-1";

    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');
    const localLoggerWarn = spy(logger, 'warn');

    // Mocks for DB Client
    const mockStageSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: 'stage-id-1', slug: mockStageSlug, name: "Thesis" },
        error: null,
    }));
    const mockStageSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockStageSelectEqSingleSpy }));
    const mockStageSelectSpy = spy(() => ({ eq: mockStageSelectEqSpy }));

    const mockSessionSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: {
            id: mockSessionId,
            project_id: mockProjectId,
            status: 'pending_thesis',
            associated_chat_id: mockChatId,
            selected_model_catalog_ids: [mockModelCatalogId],
        },
        error: null,
    }));
    const mockSessionSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockSessionSelectEqSingleSpy }));
    const mockSessionSelectSpy = spy(() => ({ eq: mockSessionSelectEqSpy }));

    const mockProviderSelectEqSingleSpy = spy(async () => await Promise.resolve({
        data: { id: mockModelCatalogId, provider: "P-Success", name: "M-Success", api_identifier: "api-success" },
        error: null
    }));
    const mockProviderSelectEqSpy = spy((_column: string, _value: unknown) => ({ single: mockProviderSelectEqSingleSpy }));
    const mockProviderSelectSpy = spy(() => ({ eq: mockProviderSelectEqSpy }));

    const mockContributionInsertSelectSpy = spy(async () => await Promise.resolve({
        data: { id: mockContributionId, session_id: mockSessionId, model_id: mockModelCatalogId, stage: mockStageSlug },
        error: null
    }));
    const mockContributionInsertSpy = spy(() => ({ select: () => ({ single: mockContributionInsertSelectSpy }) }));

    const mockSessionUpdateEqSpy = spy(async () => await Promise.resolve({ error: null }));
    const mockSessionUpdateSpy = spy(() => ({ eq: mockSessionUpdateEqSpy }));

    const mockDbClient: any = {
        from: spy((tableName: string) => {
            if (tableName === 'dialectic_sessions') return { select: mockSessionSelectSpy, update: mockSessionUpdateSpy };
            if (tableName === 'ai_providers') return { select: mockProviderSelectSpy };
            if (tableName === 'dialectic_stages') return { select: mockStageSelectSpy };
            if (tableName === 'dialectic_contributions') return { insert: mockContributionInsertSpy };
            return { select: spy(), insert: spy(), update: spy() };
        }),
    };

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => await Promise.resolve({ content: "Successful contribution content", error: null }));

    const mockDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        uploadToStorage: spy(async () => await Promise.resolve({ error: null, path: "dummy/path" })),
        downloadFromStorage: spy(async () => await Promise.resolve({ data: new TextEncoder().encode("prompt"), error: null })),
        getFileMetadata: spy(async () => await Promise.resolve({ size: 123, error: null })),
        getExtensionFromMimeType: spy(() => ".md"),
        logger: logger,
        randomUUID: spy(() => mockContributionId)
    };

    try {
        const result = await generateContributions(mockDbClient as any, mockPayload, mockAuthToken, mockDeps as any);

        assertEquals(result.success, true);
        assertExists(result.data);
        assertEquals(result.data?.contributions.length, 1);
        assertEquals(result.data?.contributions[0].id, mockContributionId);
        assertEquals(result.data?.status, "thesis_generation_complete");

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        localLoggerWarn.restore();
    }
});
