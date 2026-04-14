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
import { Database } from "../../types_db.ts";

export interface StreamRewindDeps {
  logger: ILogger;
  adminTokenWalletService: IAdminTokenWalletService;
  countTokens: CountTokensFn;
  debitTokens: DebitTokens;
  getMaxOutputTokens: typeof getMaxOutputTokens;
  createErrorResponse: typeof createErrorResponse;
}

export interface StreamRewindParams {
  supabaseClient: SupabaseClient<Database>;
  userId: string;
  wallet: TokenWallet;
  aiProviderAdapter: AiProviderAdapterInstance;
  modelConfig: AiModelExtendedConfig;
  actualSystemPromptText: string | null;
  finalSystemPromptIdForDb: string | null;
}

export interface StreamRewindPayload {
  requestBody: ChatApiRequest;
  req: Request;
}

export type StreamRewindReturn =
  | StreamRewindSuccessResponse
  | StreamRewindErrorResponse;

export type StreamRewindSuccessResponse = Response;

export type StreamRewindErrorResponse = Error;

export type StreamRewind = (
  deps: StreamRewindDeps,
  params: StreamRewindParams,
  payload: StreamRewindPayload,
) => Promise<StreamRewindReturn>;
