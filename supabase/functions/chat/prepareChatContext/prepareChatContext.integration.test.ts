import { assertEquals } from "jsr:@std/assert@0.225.3";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildExtendedModelConfig,
  getMockAiProviderAdapter,
} from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { asSupabaseAdminClientForTests } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  AiModelExtendedConfig,
  ChatApiRequest,
  GetAiProviderAdapterFn,
} from "../../_shared/types.ts";
import { Database } from "../../types_db.ts";
import {
  PrepareChatContextDeps,
  PrepareChatContextParams,
  PrepareChatContextPayload,
} from "./prepareChatContext.interface.ts";
import {
  isPrepareChatContextError,
  isPrepareChatContextSuccess,
} from "./prepareChatContext.guard.ts";
import { prepareChatContext } from "./prepareChatContext.ts";

Deno.test({
  name:
    "integration: prepareChatContext with mocked Supabase and IUserTokenWalletService returns SuccessfulChatContext",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const userId: string = "prepare-chat-context-integration-user-1";
  const providerId: string = crypto.randomUUID();
  const promptId: string = "__none__";
  const walletId: string = crypto.randomUUID();
  const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient(userId, {
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
    });
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const walletMock = createMockUserTokenWalletService({
    getWalletByIdAndUser: (wid: string, uid: string) => {
      const now: Date = new Date();
      return Promise.resolve({
        walletId: wid,
        userId: uid,
        balance: "5000",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      });
    },
  });
  const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
  const getAiProviderAdapter: GetAiProviderAdapterFn = () => adapter;
  const deps: PrepareChatContextDeps = {
    logger,
    userTokenWalletService: walletMock.instance,
    getAiProviderAdapter,
    supabaseClient,
  };
  const params: PrepareChatContextParams = { userId };
  const requestBody: ChatApiRequest = {
    message: "integration prepare context",
    providerId,
    promptId,
    walletId,
  };
  const payload: PrepareChatContextPayload = { requestBody };
  Deno.env.set("TEST_PROVIDER_API_KEY", "integration-test-api-key");
  try {
    const result = await prepareChatContext(deps, params, payload);
    assertEquals(isPrepareChatContextSuccess(result), true);
    if (!isPrepareChatContextSuccess(result)) {
      return;
    }
    assertEquals(result.wallet.walletId, walletId);
    assertEquals(result.wallet.userId, userId);
    assertEquals(result.apiKey, "integration-test-api-key");
    assertEquals(result.actualSystemPromptText, null);
    assertEquals(result.finalSystemPromptIdForDb, null);
  } finally {
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  }
});

Deno.test({
  name:
    "integration: prepareChatContext with provider not found returns ErrorChatContext",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const userId: string = "prepare-chat-context-integration-user-404";
  const providerId: string = crypto.randomUUID();
  const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient(userId, {
      genericMockResults: {
        ai_providers: {
          select: {
            data: null,
            error: { message: "Not found", name: "Not found" },
          },
        },
      },
    });
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const walletMock = createMockUserTokenWalletService();
  const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
  const getAiProviderAdapter: GetAiProviderAdapterFn = () => adapter;
  const deps: PrepareChatContextDeps = {
    logger,
    userTokenWalletService: walletMock.instance,
    getAiProviderAdapter,
    supabaseClient,
  };
  const params: PrepareChatContextParams = { userId };
  const payload: PrepareChatContextPayload = {
    requestBody: {
      message: "integration error path",
      providerId,
      promptId: "__none__",
      walletId: crypto.randomUUID(),
    },
  };
  const result = await prepareChatContext(deps, params, payload);
  assertEquals(isPrepareChatContextError(result), true);
  if (!isPrepareChatContextError(result)) {
    return;
  }
  assertEquals(result.error.status, 404);
});

Deno.test({
  name:
    "integration: consumer-shaped PrepareChatContextDeps (StreamRequest-style wiring) invokes real prepareChatContext",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const userId: string = "prepare-chat-context-integration-streamrequest-shaped";
  const providerId: string = crypto.randomUUID();
  const promptId: string = "__none__";
  const organizationId: string = crypto.randomUUID();
  const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient(userId, {
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
    });
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const walletMock = createMockUserTokenWalletService({
    getWalletForContext: (uid: string | undefined, _orgId: string | undefined) => {
      const now: Date = new Date();
      return Promise.resolve({
        walletId: "integration-context-wallet",
        userId: uid,
        balance: "3000",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      });
    },
  });
  const adapter = getMockAiProviderAdapter(logger, modelConfig).instance;
  const getAiProviderAdapter: GetAiProviderAdapterFn = () => adapter;
  const prepareChatContextDeps: PrepareChatContextDeps = {
    logger,
    userTokenWalletService: walletMock.instance,
    getAiProviderAdapter,
    supabaseClient,
  };
  const prepareChatContextParams: PrepareChatContextParams = { userId };
  const requestBody: ChatApiRequest = {
    message: "stream-request-shaped call",
    providerId,
    promptId,
    organizationId,
  };
  const prepareChatContextPayload: PrepareChatContextPayload = {
    requestBody,
  };
  Deno.env.set("TEST_PROVIDER_API_KEY", "stream-request-shaped-key");
  try {
    const result = await prepareChatContext(
      prepareChatContextDeps,
      prepareChatContextParams,
      prepareChatContextPayload,
    );
    assertEquals(isPrepareChatContextSuccess(result), true);
    if (!isPrepareChatContextSuccess(result)) {
      return;
    }
    assertEquals(result.providerApiIdentifier, "test-model");
    assertEquals(result.wallet.walletId, "integration-context-wallet");
  } finally {
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  }
});
