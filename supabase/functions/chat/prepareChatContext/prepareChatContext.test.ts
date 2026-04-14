import { assertEquals } from "jsr:@std/assert@0.225.3";
import {
  assertSpyCalls,
  spy,
} from "jsr:@std/testing@0.225.1/mock";
import {
  buildExtendedModelConfig,
  getMockAiProviderAdapter,
} from "../../_shared/ai_service/ai_provider.mock.ts";
import { logger } from "../../_shared/logger.ts";
import { asSupabaseAdminClientForTests } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import {
  createMockSupabaseClient,
  MockSupabaseClientSetup,
} from "../../_shared/supabase.mock.ts";
import { ChatApiRequest } from "../../_shared/types.ts";
import {
  PrepareChatContextDeps,
  PrepareChatContextParams,
  PrepareChatContextPayload,
} from "./prepareChatContext.interface.ts";
import { prepareChatContext } from "./prepareChatContext.ts";
import {
  isPrepareChatContextError,
  isPrepareChatContextSuccess,
} from "./prepareChatContext.guard.ts";
import { buildContractPrepareChatContextDeps } from "./prepareChatContext.mock.ts";

Deno.test(
  "prepareChatContext: with walletId calls userTokenWalletService.getWalletByIdAndUser and returns success",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-user-wallet-by-id";
    const walletId: string = crypto.randomUUID();
    const providerId: string = crypto.randomUUID();
    const promptId: string = crypto.randomUUID();
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService({
      getWalletByIdAndUser: (wid: string, uid: string) => {
        const now: Date = new Date();
        return Promise.resolve({
          walletId: wid,
          userId: uid,
          balance: "2000",
          currency: "AI_TOKEN",
          createdAt: now,
          updatedAt: now,
        });
      },
    });
    const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(() => adapter),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "Hello",
        providerId,
        promptId,
        walletId,
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextSuccess(result)) {
      assertEquals(true, false, "expected PrepareChatContextSuccess");
    } else {
      assertSpyCalls(mockWallet.stubs.getWalletByIdAndUser, 1);
      assertSpyCalls(mockWallet.stubs.getWalletForContext, 0);
    }
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  },
);

Deno.test(
  "prepareChatContext: without walletId calls userTokenWalletService.getWalletForContext and returns success",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-user-context-wallet";
    const providerId: string = crypto.randomUUID();
    const promptId: string = crypto.randomUUID();
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService({
      getWalletForContext: (uid?: string, _orgId?: string) => {
        const now: Date = new Date();
        return Promise.resolve({
          walletId: "ctx-wallet-id",
          userId: uid,
          balance: "2000",
          currency: "AI_TOKEN",
          createdAt: now,
          updatedAt: now,
        });
      },
    });
    const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(() => adapter),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const requestBody: ChatApiRequest = {
      message: "Hello",
      providerId,
      promptId,
    };
    const payload: PrepareChatContextPayload = { requestBody };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextSuccess(result)) {
      assertEquals(true, false, "expected PrepareChatContextSuccess");
    } else {
      assertSpyCalls(mockWallet.stubs.getWalletForContext, 1);
      assertSpyCalls(mockWallet.stubs.getWalletByIdAndUser, 0);
    }
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  },
);

Deno.test(
  "prepareChatContext: provider not found returns error status 404",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-404";
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: null,
              error: { message: "Not found", name: "Not found" },
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService();
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "test",
        providerId: "non-existent-provider-id",
        promptId: crypto.randomUUID(),
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextError(result)) {
      assertEquals(true, false, "expected PrepareChatContextError");
    } else {
      assertEquals(result.error.status, 404);
    }
  },
);

Deno.test(
  "prepareChatContext: inactive provider returns error status 400",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-inactive";
    const providerId: string = crypto.randomUUID();
    const providerName: string = "Inactive Test Provider";
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: false,
                name: providerName,
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService();
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "test",
        providerId,
        promptId: crypto.randomUUID(),
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextError(result)) {
      assertEquals(true, false, "expected PrepareChatContextError");
    } else {
      assertEquals(result.error.status, 400);
      assertEquals(
        result.error.message,
        `Provider '${providerName}' is currently inactive.`,
      );
    }
  },
);

Deno.test(
  "prepareChatContext: invalid model config returns error status 500",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-bad-config";
    const providerId: string = crypto.randomUUID();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: {},
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService();
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "test",
        providerId,
        promptId: crypto.randomUUID(),
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextError(result)) {
      assertEquals(true, false, "expected PrepareChatContextError");
    } else {
      assertEquals(result.error.status, 500);
      assertEquals(
        result.error.message,
        `Invalid configuration for provider ID '${providerId}'.`,
      );
    }
  },
);

Deno.test(
  "prepareChatContext: missing API key returns error status 500",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-no-api-key";
    const providerId: string = crypto.randomUUID();
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService();
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "test",
        providerId,
        promptId: crypto.randomUUID(),
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextError(result)) {
      assertEquals(true, false, "expected PrepareChatContextError");
    } else {
      assertEquals(result.error.status, 500);
      assertEquals(
        result.error.message,
        "API key for TEST_PROVIDER is not configured.",
      );
    }
  },
);

Deno.test(
  "prepareChatContext: wallet not found by ID returns error status 403",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-403";
    const walletId: string = crypto.randomUUID();
    const providerId: string = crypto.randomUUID();
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService({
      getWalletByIdAndUser: () => Promise.resolve(null),
    });
    const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(() => adapter),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "test",
        providerId,
        promptId: crypto.randomUUID(),
        walletId,
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextError(result)) {
      assertEquals(true, false, "expected PrepareChatContextError");
    } else {
      assertEquals(result.error.status, 403);
      assertEquals(
        result.error.message,
        `Token wallet with ID ${walletId} not found or access denied.`,
      );
    }
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  },
);

Deno.test(
  "prepareChatContext: wallet not found by context returns error status 402",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-402";
    const providerId: string = crypto.randomUUID();
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService({
      getWalletForContext: () => Promise.resolve(null),
    });
    const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(() => adapter),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "test",
        providerId,
        promptId: crypto.randomUUID(),
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextError(result)) {
      assertEquals(true, false, "expected PrepareChatContextError");
    } else {
      assertEquals(result.error.status, 402);
      assertEquals(
        result.error.message,
        "Token wallet not found for your context. Please set up or fund your wallet.",
      );
    }
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  },
);

Deno.test(
  "prepareChatContext: wallet service throws returns error status 500",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-wallet-throw";
    const providerId: string = crypto.randomUUID();
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService({
      getWalletForContext: () =>
        Promise.reject(new Error("Simulated wallet service failure")),
    });
    const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(() => adapter),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "test",
        providerId,
        promptId: crypto.randomUUID(),
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextError(result)) {
      assertEquals(true, false, "expected PrepareChatContextError");
    } else {
      assertEquals(result.error.status, 500);
      assertEquals(result.error.message, "Server error during wallet check.");
    }
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  },
);

Deno.test(
  "prepareChatContext: valid promptId loads actualSystemPromptText",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-prompt";
    const providerId: string = crypto.randomUUID();
    const promptId: string = crypto.randomUUID();
    const promptText: string = "You are a helpful assistant.";
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
          system_prompts: {
            select: {
              data: [{
                id: promptId,
                prompt_text: promptText,
                is_active: true,
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService({
      getWalletForContext: () => {
        const now: Date = new Date();
        return Promise.resolve({
          walletId: "w",
          userId,
          balance: "1000",
          currency: "AI_TOKEN",
          createdAt: now,
          updatedAt: now,
        });
      },
    });
    const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(() => adapter),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "Hi",
        providerId,
        promptId,
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextSuccess(result)) {
      assertEquals(true, false, "expected PrepareChatContextSuccess");
    } else {
      assertEquals(result.actualSystemPromptText, promptText);
      assertEquals(result.finalSystemPromptIdForDb, promptId);
    }
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  },
);

Deno.test(
  "prepareChatContext: promptId __none__ yields null actualSystemPromptText",
  async () => {
    const contract = buildContractPrepareChatContextDeps();
    const userId: string = "prepare-chat-context-unit-none-prompt";
    const providerId: string = crypto.randomUUID();
    const modelConfig = buildExtendedModelConfig();
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(
      userId,
      {
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{
                id: providerId,
                provider: "TEST_PROVIDER",
                api_identifier: "test-model",
                config: modelConfig,
                is_active: true,
                name: "Test Provider",
              }],
              error: null,
            },
          },
        },
      },
    );
    const mockWallet = createMockUserTokenWalletService({
      getWalletForContext: () => {
        const now: Date = new Date();
        return Promise.resolve({
          walletId: "w",
          userId,
          balance: "1000",
          currency: "AI_TOKEN",
          createdAt: now,
          updatedAt: now,
        });
      },
    });
    const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
    Deno.env.set("TEST_PROVIDER_API_KEY", "test-key");
    const deps: PrepareChatContextDeps = {
      logger: contract.logger,
      userTokenWalletService: mockWallet.instance,
      getAiProviderAdapter: spy(() => adapter),
      supabaseClient: asSupabaseAdminClientForTests(mockSupabase.client),
    };
    const params: PrepareChatContextParams = { userId };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "Hi",
        providerId,
        promptId: "__none__",
      },
    };

    const result = await prepareChatContext(deps, params, payload);

    if (!isPrepareChatContextSuccess(result)) {
      assertEquals(true, false, "expected PrepareChatContextSuccess");
    } else {
      assertEquals(result.actualSystemPromptText, null);
      assertEquals(result.finalSystemPromptIdForDb, null);
    }
    const selectSpy = mockSupabase.spies.getLatestQueryBuilderSpies(
      "system_prompts",
    )?.select;
    assertEquals(selectSpy, undefined);
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  },
);
