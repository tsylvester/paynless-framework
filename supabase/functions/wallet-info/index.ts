import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createSupabaseClient } from "../_shared/auth.ts";
import { UserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.ts";
import { IUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts";
import {
    handleCorsPreflightRequest,
    createErrorResponse,
    createSuccessResponse
} from "../_shared/cors-headers.ts";
import { logger } from "../_shared/logger.ts";
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from "../types_db.ts";
import type { ILogger } from "../_shared/types.ts";

// Define Dependencies Interface
export interface WalletInfoHandlerDeps {
  createSupabaseClient: (req: Request) => SupabaseClient;
  createUserTokenWalletService: (
    userClient: SupabaseClient<Database>,
  ) => IUserTokenWalletService;
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createErrorResponse: typeof createErrorResponse;
  createSuccessResponse: typeof createSuccessResponse;
  logger: ILogger;
}

export const defaultDeps: WalletInfoHandlerDeps = {
  createSupabaseClient: createSupabaseClient,
  createUserTokenWalletService: (
    userClient: SupabaseClient<Database>,
  ): IUserTokenWalletService => {
    return new UserTokenWalletService(userClient);
  },
  handleCorsPreflightRequest: handleCorsPreflightRequest,
  createErrorResponse: createErrorResponse,
  createSuccessResponse: createSuccessResponse,
  logger: logger,
};

export async function walletInfoRequestHandler(req: Request, deps: WalletInfoHandlerDeps = defaultDeps): Promise<Response> {
  const {
    handleCorsPreflightRequest,
    createSupabaseClient,
    createUserTokenWalletService,
    createErrorResponse,
    createSuccessResponse,
    logger,
  } = deps;

  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) {
    return corsPreflightResponse;
  }

  try {
    const supabaseUserClient: SupabaseClient<Database> = createSupabaseClient(req) as SupabaseClient<Database>;
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
      logger.error("Authentication error in /wallet-info", { error: authError });
      return createErrorResponse("Unauthorized", 401, req, authError as Error);
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId") || undefined;
    const userId = user.id;

    logger.info(`[WalletInfoHandler INFO] Fetching wallet info for user: ${userId}, org: ${organizationId}`);

    if (!createUserTokenWalletService) {
      logger.error("Token wallet service factory is not provided");
      return createErrorResponse("Internal server error", 500, req, new Error("Token wallet service factory is not provided"));
    }
    const tokenWalletService: IUserTokenWalletService = createUserTokenWalletService(
      supabaseUserClient,
    );

    const wallet = await tokenWalletService.getWalletForContext(userId, organizationId);
    logger.info(`[WalletInfoHandler INFO] Wallet data returned by tokenWalletService.getWalletForContext: ${JSON.stringify(wallet)}`);
    logger.info(`[WalletInfoHandler INFO] Sending wallet directly as response body: ${JSON.stringify(wallet)}`);
    
    return createSuccessResponse(wallet, 200, req);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in /wallet-info function", { error: err.message, stack: err.stack });
    return createErrorResponse(err.message || "An unexpected error occurred", 500, req, err);
  }
}

serve((req) => walletInfoRequestHandler(req, defaultDeps)); 