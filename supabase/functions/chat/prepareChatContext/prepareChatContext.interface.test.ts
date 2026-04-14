import { assertEquals } from "jsr:@std/assert@0.225.3";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildExtendedModelConfig,
  getMockAiProviderAdapter,
} from "../../_shared/ai_service/ai_provider.mock.ts";
import { logger } from "../../_shared/logger.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import {
  AiModelExtendedConfig,
  AiProviderAdapterInstance,
  GetAiProviderAdapterFn,
} from "../../_shared/types.ts";
import { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import { Database } from "../../types_db.ts";
import {
  buildContractPrepareChatContextDeps,
  buildContractPrepareChatContextParams,
  buildContractPrepareChatContextPayload,
} from "./prepareChatContext.mock.ts";
import {
  PrepareChatContext,
  PrepareChatContextDeps,
  PrepareChatContextError,
  PrepareChatContextParams,
  PrepareChatContextPayload,
  PrepareChatContextReturn,
  PrepareChatContextSuccess,
} from "./prepareChatContext.interface.ts";

Deno.test(
  "Contract: PrepareChatContextDeps has logger, userTokenWalletService, getAiProviderAdapter, supabaseClient shapes",
  () => {
    const deps: PrepareChatContextDeps = buildContractPrepareChatContextDeps();

    assertEquals(typeof deps.logger.info, "function");
    assertEquals(typeof deps.logger.warn, "function");
    assertEquals(typeof deps.logger.error, "function");
    assertEquals(typeof deps.userTokenWalletService.getWalletByIdAndUser, "function");
    assertEquals(typeof deps.userTokenWalletService.getWalletForContext, "function");
    assertEquals(typeof deps.getAiProviderAdapter, "function");
    assertEquals(typeof deps.supabaseClient.from, "function");
  },
);

Deno.test("Contract: PrepareChatContextParams has userId as string", () => {
  const params: PrepareChatContextParams =
    buildContractPrepareChatContextParams();

  assertEquals(typeof params.userId, "string");
});

Deno.test(
  "Contract: PrepareChatContextPayload has requestBody with message, providerId, promptId, walletId, organizationId",
  () => {
    const payload: PrepareChatContextPayload = {
      requestBody: buildContractPrepareChatContextPayload(),
    };

    assertEquals(typeof payload.requestBody.message, "string");
    assertEquals(typeof payload.requestBody.providerId, "string");
    assertEquals(typeof payload.requestBody.promptId, "string");
    assertEquals(typeof payload.requestBody.walletId, "string");
    assertEquals(typeof payload.requestBody.organizationId, "string");
  },
);

Deno.test(
  "Contract: PrepareChatContextSuccess has wallet, adapter, modelConfig, prompt fields, apiKey, providerApiIdentifier",
  () => {
    const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
    const now: Date = new Date();
    const wallet: TokenWallet = {
      walletId: "prepare-chat-context-success-wallet",
      userId: "prepare-chat-context-success-user",
      balance: "1000",
      currency: "AI_TOKEN",
      createdAt: now,
      updatedAt: now,
    };
    const aiProviderAdapter: AiProviderAdapterInstance =
      getMockAiProviderAdapter(logger, modelConfig).instance;
    const value: PrepareChatContextSuccess = {
      wallet,
      aiProviderAdapter,
      modelConfig,
      actualSystemPromptText: "contract system prompt",
      finalSystemPromptIdForDb: crypto.randomUUID(),
      apiKey: "prepare-chat-context-contract-api-key",
      providerApiIdentifier: "prepare-chat-context-contract-provider-api-id",
    };

    assertEquals(typeof value.wallet.walletId, "string");
    assertEquals(typeof value.aiProviderAdapter.sendMessage, "function");
    assertEquals(typeof value.modelConfig.api_identifier, "string");
    assertEquals(value.actualSystemPromptText, "contract system prompt");
    assertEquals(typeof value.finalSystemPromptIdForDb, "string");
    assertEquals(typeof value.apiKey, "string");
    assertEquals(typeof value.providerApiIdentifier, "string");
  },
);

Deno.test(
  "Contract: PrepareChatContextError has error with message string and status number",
  () => {
    const value: PrepareChatContextError = {
      error: {
        message: "contract error message",
        status: 400,
      },
    };

    assertEquals(typeof value.error.message, "string");
    assertEquals(typeof value.error.status, "number");
  },
);

Deno.test(
  "Contract: PrepareChatContextReturn accepts PrepareChatContextSuccess",
  () => {
    const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
    const now: Date = new Date();
    const wallet: TokenWallet = {
      walletId: "prepare-chat-context-return-success-wallet",
      userId: "prepare-chat-context-return-success-user",
      balance: "1000",
      currency: "AI_TOKEN",
      createdAt: now,
      updatedAt: now,
    };
    const aiProviderAdapter: AiProviderAdapterInstance =
      getMockAiProviderAdapter(logger, modelConfig).instance;
    const value: PrepareChatContextReturn = {
      wallet,
      aiProviderAdapter,
      modelConfig,
      actualSystemPromptText: null,
      finalSystemPromptIdForDb: null,
      apiKey: "k",
      providerApiIdentifier: "id",
    };

    assertEquals("error" in value, false);
    assertEquals("wallet" in value, true);
  },
);

Deno.test(
  "Contract: PrepareChatContextReturn accepts PrepareChatContextError",
  () => {
    const value: PrepareChatContextReturn = {
      error: {
        message: "contract return error",
        status: 500,
      },
    };

    assertEquals("error" in value, true);
    assertEquals(typeof value.error.message, "string");
    assertEquals(typeof value.error.status, "number");
  },
);

Deno.test(
  "Contract: PrepareChatContext matches (deps, params, payload) => Promise<PrepareChatContextReturn>",
  async () => {
    const impl: PrepareChatContext = async (
      _deps: PrepareChatContextDeps,
      _params: PrepareChatContextParams,
      _payload: PrepareChatContextPayload,
    ) => {
      const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
      const now: Date = new Date();
      const wallet: TokenWallet = {
        walletId: "prepare-chat-context-fn-wallet",
        userId: "prepare-chat-context-fn-user",
        balance: "1000",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      };
      const aiProviderAdapter: AiProviderAdapterInstance =
        getMockAiProviderAdapter(logger, modelConfig).instance;
      const out: PrepareChatContextSuccess = {
        wallet,
        aiProviderAdapter,
        modelConfig,
        actualSystemPromptText: null,
        finalSystemPromptIdForDb: null,
        apiKey: "fn-key",
        providerApiIdentifier: "fn-id",
      };
      return out;
    };

    const mockSupabase: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("prepare-chat-context-fn", {});
    const mockUserWallet: ReturnType<typeof createMockUserTokenWalletService> =
      createMockUserTokenWalletService();
    const modelConfigForFactory: AiModelExtendedConfig =
      buildExtendedModelConfig();
    const getAiProviderAdapter: GetAiProviderAdapterFn = () => {
      return getMockAiProviderAdapter(logger, modelConfigForFactory).instance;
    };
    const deps: PrepareChatContextDeps = {
      logger,
      userTokenWalletService: mockUserWallet.instance,
      getAiProviderAdapter,
      supabaseClient: mockSupabase.client as unknown as SupabaseClient<Database>,
    };
    const params: PrepareChatContextParams = { userId: "u" };
    const payload: PrepareChatContextPayload = {
      requestBody: {
        message: "m",
        providerId: crypto.randomUUID(),
        promptId: crypto.randomUUID(),
      },
    };

    const result: PrepareChatContextReturn = await impl(deps, params, payload);

    assertEquals("error" in result, false);
    assertEquals("wallet" in result, true);
  },
);
