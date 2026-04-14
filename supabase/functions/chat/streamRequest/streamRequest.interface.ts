import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { IAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts";
import { IUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts";
import { GetAiProviderAdapterFn, ILogger } from "../../_shared/types.ts";
import { CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import { DebitTokens } from "../../_shared/utils/debitTokens.interface.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { Database } from "../../types_db.ts";
import { ConstructMessageHistory } from "../constructMessageHistory/constructMessageHistory.interface.ts";
import { findOrCreateChat } from "../findOrCreateChat.ts";
import { PrepareChatContext } from "../prepareChatContext/prepareChatContext.interface.ts";
import { StreamChatFn } from "../streamChat/streamChat.interface.ts";
import { StreamRewind } from "../streamRewind/streamRewind.interface.ts";

export interface StreamRequestDeps {
  logger: ILogger;
  adminTokenWalletService: IAdminTokenWalletService;
  getAiProviderAdapter: GetAiProviderAdapterFn;
  prepareChatContext: PrepareChatContext;
  streamChat: StreamChatFn;
  streamRewind: StreamRewind;
  createErrorResponse: typeof createErrorResponse;
  countTokens: CountTokensFn;
  debitTokens: DebitTokens;
  getMaxOutputTokens: typeof getMaxOutputTokens;
  findOrCreateChat: typeof findOrCreateChat;
  constructMessageHistory: ConstructMessageHistory;
}

export interface StreamRequestParams {
  supabaseClient: SupabaseClient<Database>;
  userId: string;
  userTokenWalletService: IUserTokenWalletService;
}

export interface StreamRequestPayload {
  req: Request;
}

export type StreamRequestSuccess = Response;

export type StreamRequestError = Error;

export type StreamRequestReturn = StreamRequestSuccess | StreamRequestError;

export type StreamRequest = (
  deps: StreamRequestDeps,
  params: StreamRequestParams,
  payload: StreamRequestPayload,
) => Promise<StreamRequestReturn>;
