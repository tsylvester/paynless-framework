import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildExtendedModelConfig,
  getMockAiProviderAdapter,
} from "../../_shared/ai_service/ai_provider.mock.ts";
import { logger } from "../../_shared/logger.ts";
import { asSupabaseAdminClientForTests } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  AiModelExtendedConfig,
  ChatApiRequest,
  GetAiProviderAdapterFn,
} from "../../_shared/types.ts";
import { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import { Database } from "../../types_db.ts";
import {
  PrepareChatContextDeps,
  PrepareChatContextParams,
  PrepareChatContextPayload,
  PrepareChatContextReturn,
  PrepareChatContextSuccess,
  PrepareChatContext,
} from "./prepareChatContext.interface.ts";

const contractUserId: string = "prepare-chat-context-contract";

export function buildContractPrepareChatContextDeps(): PrepareChatContextDeps {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient(contractUserId, {});
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const mockUserWallet: ReturnType<typeof createMockUserTokenWalletService> =
    createMockUserTokenWalletService();
  const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
  const getAiProviderAdapter: GetAiProviderAdapterFn = () => {
    return getMockAiProviderAdapter(logger, modelConfig).instance;
  };
  const deps: PrepareChatContextDeps = {
    logger,
    userTokenWalletService: mockUserWallet.instance,
    getAiProviderAdapter,
    supabaseClient,
  };
  return deps;
}

export function buildContractPrepareChatContextParams(): PrepareChatContextParams {
  const params: PrepareChatContextParams = {
    userId: "prepare-chat-context-contract-user-id",
  };
  return params;
}

export function buildContractPrepareChatContextPayload(): ChatApiRequest {
  const walletId: string = crypto.randomUUID();
  const organizationId: string = crypto.randomUUID();
  const providerId: string = crypto.randomUUID();
  const promptId: string = crypto.randomUUID();
  const requestBody: ChatApiRequest = {
    message: "prepare-chat-context-contract-message",
    providerId,
    promptId,
    walletId,
    organizationId,
  };
  return requestBody;
}

export function buildContractPrepareChatContextSuccess(): PrepareChatContextSuccess {
  const modelConfig: AiModelExtendedConfig = buildExtendedModelConfig();
  const now: Date = new Date();
  const wallet: TokenWallet = {
    walletId: "prepare-chat-context-guard-success-wallet",
    userId: "prepare-chat-context-guard-success-user",
    balance: "1000",
    currency: "AI_TOKEN",
    createdAt: now,
    updatedAt: now,
  };
  const aiProviderAdapter = getMockAiProviderAdapter(logger, modelConfig).instance;
  const success: PrepareChatContextSuccess = {
    wallet,
    aiProviderAdapter,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: "prepare-chat-context-guard-api-key",
    providerApiIdentifier: "prepare-chat-context-guard-provider-api-id",
  };
  return success;
}

export function createMockPrepareChatContext(config: {
  returnValue?: PrepareChatContextReturn;
} = {}): PrepareChatContext {
  const fn: PrepareChatContext = async (
    _deps: PrepareChatContextDeps,
    _params: PrepareChatContextParams,
    _payload: PrepareChatContextPayload,
  ): Promise<PrepareChatContextReturn> => {
    if (config.returnValue !== undefined) {
      return config.returnValue;
    }
    return buildContractPrepareChatContextSuccess();
  };
  return fn;
}
