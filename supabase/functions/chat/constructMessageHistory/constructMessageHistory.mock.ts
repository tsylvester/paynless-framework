import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { asSupabaseAdminClientForTests } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { logger } from "../../_shared/logger.ts";
import { Database } from "../../types_db.ts";
import {
  ConstructMessageHistory,
  ConstructMessageHistoryDeps,
  ConstructMessageHistoryParams,
  ConstructMessageHistoryReturn,
  ConstructMessageHistorySuccess,
} from "./constructMessageHistory.interface.ts";

const contractUserId: string = "construct-message-history-contract";

export function buildContractConstructMessageHistoryDeps(): ConstructMessageHistoryDeps {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient(contractUserId, {});
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const deps: ConstructMessageHistoryDeps = {
    logger,
    supabaseClient,
  };
  return deps;
}

export function buildContractConstructMessageHistoryParams(): ConstructMessageHistoryParams {
  const params: ConstructMessageHistoryParams = {
    existingChatId: "construct-message-history-contract-chat",
    system_prompt_text: "construct message history contract system prompt",
    rewindFromMessageId: null,
  };
  return params;
}

export function buildConstructMessageHistoryTestContext(
  userId: string,
  config: Parameters<typeof createMockSupabaseClient>[1] = {},
): {
  deps: ConstructMessageHistoryDeps;
  mockSetup: ReturnType<typeof createMockSupabaseClient>;
} {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient(userId, config);
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const deps: ConstructMessageHistoryDeps = {
    logger,
    supabaseClient,
  };
  return { deps, mockSetup };
}

export function createMockConstructMessageHistory(config: {
  returnValue?: ConstructMessageHistoryReturn;
} = {}): ConstructMessageHistory {
  const fn: ConstructMessageHistory = async (
    _deps,
    _params,
    _payload,
  ): Promise<ConstructMessageHistoryReturn> => {
    if (config.returnValue !== undefined) {
      return config.returnValue;
    }
    const success: ConstructMessageHistorySuccess = {
      history: [{ role: "user", content: "mock-construct-message-history" }],
    };
    return success;
  };
  return fn;
}
