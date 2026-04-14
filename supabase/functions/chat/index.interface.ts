import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflightRequest,
} from "../_shared/cors-headers.ts";
import { IAdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts";
import { IUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts";
import {
  GetAiProviderAdapterFn,
  GetUserFn,
  ILogger,
} from "../_shared/types.ts";
import { CountTokensFn } from "../_shared/types/tokenizer.types.ts";
import { DebitTokens } from "../_shared/utils/debitTokens.interface.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";
import { Database } from "../types_db.ts";
import { ConstructMessageHistory } from "./constructMessageHistory/constructMessageHistory.interface.ts";
import { findOrCreateChat } from "./findOrCreateChat.ts";
import { PrepareChatContext } from "./prepareChatContext/prepareChatContext.interface.ts";
import { StreamRequest } from "./streamRequest/streamRequest.interface.ts";

export interface ChatDeps {
  logger: ILogger;
  adminTokenWalletService: IAdminTokenWalletService;
  userTokenWalletService: IUserTokenWalletService;
  streamRequest: StreamRequest;
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createSuccessResponse: typeof createSuccessResponse;
  createErrorResponse: typeof createErrorResponse;
  prepareChatContext: PrepareChatContext;
  countTokens: CountTokensFn;
  debitTokens: DebitTokens;
  getMaxOutputTokens: typeof getMaxOutputTokens;
  findOrCreateChat: typeof findOrCreateChat;
  constructMessageHistory: ConstructMessageHistory;
  getAiProviderAdapter: GetAiProviderAdapterFn;
}

export interface ChatParams {
  userClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
  getUserFn: GetUserFn;
}

export interface ChatPayload {
  req: Request;
}

export type ChatSuccess = Response;

export type ChatError = Error;

export type ChatReturn = ChatSuccess | ChatError;

export type ChatFn = (
  deps: ChatDeps,
  params: ChatParams,
  payload: ChatPayload,
) => Promise<ChatReturn>;
