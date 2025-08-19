import {
    assertEquals,
    assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, assertSpyCall } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { createMockSupabaseClient, MockSupabaseClientSetup } from "../_shared/supabase.mock.ts";
import { logger } from "../_shared/logger.ts";
import { createMockTokenWalletService, MockTokenWalletService } from "../_shared/services/tokenWalletService.mock.ts";
import { AiModelExtendedConfig, ChatApiRequest } from "../_shared/types.ts";
import { prepareChatContext, PrepareChatContextDeps, ChatContext } from "./prepareChatContext.ts";
import { getMockAiProviderAdapter } from "../_shared/ai_service/ai_provider.mock.ts";
import { Database } from "../types_db.ts";
import { SupabaseClient } from "@supabase/supabase-js";
import { DummyAdapter } from "../_shared/ai_service/dummy_adapter.ts";

const getValidProviderConfig = (): AiModelExtendedConfig => ({
    api_identifier: 'test-model',
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
    input_token_cost_rate: 0.0001,
    output_token_cost_rate: 0.0002,
});

Deno.test("prepareChatContext: successful context preparation", async () => {
    // Arrange
    const providerId = crypto.randomUUID();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: providerId, provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
            system_prompts: {
                select: { data: [{ prompt_text: "You are a helpful assistant.", is_active: true }], error: null },
            },
        },
    });

    const mockTokenWalletService: MockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => {
            const now = new Date();
            return Promise.resolve({
                walletId: `dummy-wallet-ctx-test-user-id`,
                userId: 'test-user-id',
                organizationId: undefined,
                balance: '2000',
                currency: 'AI_TOKEN',
                createdAt: now,
                updatedAt: now,
            });
        },
    });
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");

    const mockAdapter = getMockAiProviderAdapter(logger, getValidProviderConfig()).instance;

    const deps: PrepareChatContextDeps = {
        logger,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => mockAdapter),
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        countTokensForMessages: spy(() => 10),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };

    const requestBody: ChatApiRequest = {
        message: "Hello",
        providerId,
        promptId: crypto.randomUUID(),
    };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert(!('error' in result));
    assertEquals(result.modelConfig.api_identifier, 'test-model');
    assertEquals(result.actualSystemPromptText, "You are a helpful assistant.");
    assert(result.wallet);
    assert(result.aiProviderAdapter);
    Deno.env.delete("TEST_PROVIDER_API_KEY");
});

Deno.test("prepareChatContext: provider not found", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: null, error: { message: "Not found", name: "Not found" } },
            },
        },
    });
    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: createMockTokenWalletService().instance,
        getAiProviderAdapter: spy(),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId: "non-existent", promptId: crypto.randomUUID() };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 404);
});

Deno.test("prepareChatContext: wallet not found", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: "test", provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
        },
    });
    const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.resolve(null),
    });
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const mockAdapter = getMockAiProviderAdapter(logger, getValidProviderConfig()).instance;

    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => mockAdapter),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId: "test", promptId: crypto.randomUUID() };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 402); 
    Deno.env.delete("TEST_PROVIDER_API_KEY");
});

Deno.test("prepareChatContext: inactive provider", async () => {
    // Arrange
    const providerId = crypto.randomUUID();
    const providerName = "Inactive Test Provider";
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: providerId, provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: false, name: providerName }], error: null },
            },
        },
    });
    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: createMockTokenWalletService().instance,
        getAiProviderAdapter: spy(),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId, promptId: crypto.randomUUID() };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 400);
    assertEquals(result.error.message, `Provider '${providerName}' is currently inactive.`);
});

Deno.test("prepareChatContext: invalid promptId returns null prompt", async () => {
    // Arrange
    const providerId = crypto.randomUUID();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: providerId, provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
            system_prompts: {
                select: { data: null, error: { message: "Not found", name: "Not found" } },
            },
        },
    });
    const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.resolve({ walletId: 'wallet-1', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: 'test-user-id' }),
    });
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const mockAdapter = getMockAiProviderAdapter(logger, getValidProviderConfig()).instance;
    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => mockAdapter),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId, promptId: "non-existent" };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert(!('error' in result));
    assertEquals(result.actualSystemPromptText, null);
    Deno.env.delete("TEST_PROVIDER_API_KEY");
});

Deno.test("prepareChatContext: inactive prompt returns null prompt", async () => {
    // Arrange
    const providerId = crypto.randomUUID();
    const promptId = crypto.randomUUID();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: providerId, provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
            system_prompts: {
                select: { data: [{ id: promptId, prompt_text: "Inactive", is_active: false }], error: null },
            },
        },
    });
     const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.resolve({ walletId: 'wallet-1', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: 'test-user-id' }),
    });
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const mockAdapter = getMockAiProviderAdapter(logger, getValidProviderConfig()).instance;
    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => mockAdapter),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId, promptId };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert(!('error' in result));
    assertEquals(result.actualSystemPromptText, null);
    Deno.env.delete("TEST_PROVIDER_API_KEY");
});

Deno.test("prepareChatContext: promptId '__none__' returns null prompt", async () => {
    // Arrange
    const providerId = crypto.randomUUID();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: providerId, provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
        },
    });
    const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.resolve({ walletId: 'wallet-1', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: 'test-user-id' }),
    });
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const mockAdapter = getMockAiProviderAdapter(logger, getValidProviderConfig()).instance;
    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => mockAdapter),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId, promptId: "__none__" };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert(!('error' in result));
    assertEquals(result.actualSystemPromptText, null);
    assertEquals(result.finalSystemPromptIdForDb, null);
    const selectSpy = mockSupabase.spies.getLatestQueryBuilderSpies('system_prompts')?.select;
    assertEquals(selectSpy, undefined); // Should not query DB for prompts
    Deno.env.delete("TEST_PROVIDER_API_KEY");
});

Deno.test("prepareChatContext: missing provider string in DB returns 500", async () => {
    // Arrange
    const providerId = crypto.randomUUID();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: providerId, provider: null, api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
        },
    });
    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: createMockTokenWalletService().instance,
        getAiProviderAdapter: spy(),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId, promptId: crypto.randomUUID() };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 500);
    assertEquals(result.error.message, `Configuration for provider ID '${providerId}' has an invalid provider name.`);
});

Deno.test("prepareChatContext: unsupported provider returns 400", async () => {
    // Arrange
    const providerId = crypto.randomUUID();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: providerId, provider: 'unsupported-provider', api_identifier: 'unsupported-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
        },
    });
    Deno.env.set("UNSUPPORTED-PROVIDER_API_KEY", "dummy-key-for-test");
     const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.resolve({ walletId: 'wallet-1', balance: '1000', currency: 'AI_TOKEN', createdAt: new Date(), updatedAt: new Date(), userId: 'test-user-id' }),
    });
    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => null), // Factory returns null for unsupported provider
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId, promptId: crypto.randomUUID() };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 400);
    assertEquals(result.error.message, `Unsupported or misconfigured AI provider: unsupported-model`);
});

Deno.test("prepareChatContext: returns 402 if getWalletForContext returns null", async () => {
    // Arrange
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: "test", provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
        },
    });
    const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.resolve(null),
    });
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const mockAdapter = getMockAiProviderAdapter(logger, getValidProviderConfig()).instance;

    const deps: PrepareChatContextDeps = {
        logger,
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => mockAdapter),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId: "test", promptId: crypto.randomUUID() };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 402);
    assertEquals(result.error.message, "Token wallet not found for your context. Please set up or fund your wallet.");
    Deno.env.delete("TEST_PROVIDER_API_KEY");
});

Deno.test("prepareChatContext: returns 500 if getWalletForContext throws an error", async () => {
    // Arrange
    const errorMessage = "Simulated DB error during getWalletForContext";
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient("test-user-id", {
        genericMockResults: {
            ai_providers: {
                select: { data: [{ id: "test", provider: 'TEST_PROVIDER', api_identifier: 'test-model', config: getValidProviderConfig(), is_active: true, name: 'Test Provider' }], error: null },
            },
        },
    });
    const mockTokenWalletService = createMockTokenWalletService({
        getWalletForContext: () => Promise.reject(new Error(errorMessage)),
    });
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const loggerErrorSpy = spy();
    const mockAdapter = getMockAiProviderAdapter(logger, getValidProviderConfig()).instance;
    const deps: PrepareChatContextDeps = {
        logger: { ...logger, error: loggerErrorSpy, debug: spy(), info: spy(), warn: spy() },
        supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        tokenWalletService: mockTokenWalletService.instance,
        getAiProviderAdapter: spy(() => mockAdapter),
        countTokensForMessages: spy(),
        createSupabaseClient: spy(),
        fetch: spy(),
        handleCorsPreflightRequest: spy(),
        createSuccessResponse: spy(),
        createErrorResponse: spy(),
        verifyApiKey: spy(),
        prepareChatContext: spy(),
        handleNormalPath: spy(),
        handleRewindPath: spy(),
        handleDialecticPath: spy(),
        debitTokens: spy(),
    };
    const requestBody: ChatApiRequest = { message: "test", providerId: "test", promptId: crypto.randomUUID() };

    // Act
    const result = await prepareChatContext(requestBody, "test-user-id", deps);

    // Assert
    assert('error' in result);
    assertEquals(result.error.status, 500);
    assertEquals(result.error.message, "Server error during wallet check.");
    assertEquals(loggerErrorSpy.calls.length, 1);
    Deno.env.delete("TEST_PROVIDER_API_KEY");
});