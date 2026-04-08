import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { IAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts";
import {
  AiModelExtendedConfig,
  AiProviderAdapterInstance,
  ChatApiRequest,
  ILogger,
} from "../../_shared/types.ts";
import { CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import { DebitTokens } from "../../_shared/utils/debitTokens.interface.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { ConstructMessageHistory } from "../constructMessageHistory/constructMessageHistory.interface.ts";
import { findOrCreateChat } from "../findOrCreateChat.ts";
import { Database } from "../../types_db.ts";

export interface StreamChatDeps {
  logger: ILogger;
  adminTokenWalletService: IAdminTokenWalletService;
  countTokens: CountTokensFn;
  debitTokens: DebitTokens;
  createErrorResponse: typeof createErrorResponse;
  findOrCreateChat: typeof findOrCreateChat;
  constructMessageHistory: ConstructMessageHistory;
  getMaxOutputTokens: typeof getMaxOutputTokens;
}

export interface StreamChatParams {
  supabaseClient: SupabaseClient<Database>;
  userId: string;
  wallet: TokenWallet;
  aiProviderAdapter: AiProviderAdapterInstance;
  modelConfig: AiModelExtendedConfig;
  actualSystemPromptText: string | null;
  finalSystemPromptIdForDb: string | null;
  apiKey: string;
  providerApiIdentifier: string;
}

export interface StreamChatPayload {
  requestBody: ChatApiRequest;
  req: Request;
}

export type StreamChatReturn = StreamChatSuccess | StreamChatError;

export type StreamChatSuccess = Response;

export type StreamChatError = Error;

export type StreamChatFn = (
  deps: StreamChatDeps,
  params: StreamChatParams,
  payload: StreamChatPayload,
) => Promise<StreamChatReturn>;
