import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  AiModelExtendedConfig,
  AiProviderAdapterInstance,
  ChatApiRequest,
  GetAiProviderAdapterFn,
  ILogger,
} from "../../_shared/types.ts";
import { IUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts";
import { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import { Database } from "../../types_db.ts";

export interface PrepareChatContextDeps {
  logger: ILogger;
  userTokenWalletService: IUserTokenWalletService;
  getAiProviderAdapter: GetAiProviderAdapterFn;
  supabaseClient: SupabaseClient<Database>;
}

export interface PrepareChatContextParams {
  userId: string;
}

export interface PrepareChatContextPayload {
  requestBody: ChatApiRequest;
}

export interface SuccessfulChatContext {
  wallet: TokenWallet;
  aiProviderAdapter: AiProviderAdapterInstance;
  modelConfig: AiModelExtendedConfig;
  actualSystemPromptText: string | null;
  finalSystemPromptIdForDb: string | null;
  apiKey: string;
  providerApiIdentifier: string;
}

export interface ErrorChatContext {
  error: {
    message: string;
    status: number;
  };
}

export type PrepareChatContextSuccess = SuccessfulChatContext;

export type PrepareChatContextError = ErrorChatContext;

export type PrepareChatContextReturn =
  | PrepareChatContextSuccess
  | PrepareChatContextError;

export type PrepareChatContext = (
  deps: PrepareChatContextDeps,
  params: PrepareChatContextParams,
  payload: PrepareChatContextPayload,
) => Promise<PrepareChatContextReturn>;