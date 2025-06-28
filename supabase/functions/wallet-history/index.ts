import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { TokenWalletService } from "../_shared/services/tokenWalletService.ts";
import {
    handleCorsPreflightRequest,
    createErrorResponse,
    createSuccessResponse
} from "../_shared/cors-headers.ts";
import { createSupabaseClient } from "../_shared/auth.ts";
import { logger } from "../_shared/logger.ts";
import type { PaginatedTransactions, GetTransactionHistoryParams } from "../_shared/types/tokenWallet.types.ts";

// Define Dependencies Interface
export interface WalletHistoryHandlerDeps {
  createSupabaseClient: (req: Request) => SupabaseClient;
  tokenWalletServiceInstance?: TokenWalletService;
  NewTokenWalletService: typeof TokenWalletService;
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createErrorResponse: typeof createErrorResponse;
  createSuccessResponse: typeof createSuccessResponse;
  logger: typeof logger;
}

// Create Default Dependencies
export const defaultDeps: WalletHistoryHandlerDeps = {
  createSupabaseClient: createSupabaseClient,
  NewTokenWalletService: TokenWalletService,
  handleCorsPreflightRequest: handleCorsPreflightRequest,
  createErrorResponse: createErrorResponse,
  createSuccessResponse: createSuccessResponse,
  logger: logger,
};

export async function walletHistoryRequestHandler(req: Request, deps: WalletHistoryHandlerDeps): Promise<Response> {
  const corsPreflightResponse = deps.handleCorsPreflightRequest(req);
  if (corsPreflightResponse) {
    return corsPreflightResponse;
  }

  try {
    const supabaseUserClient = deps.createSupabaseClient(req);
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
      deps.logger.error("Authentication error in /wallet-history", { error: authError });
      return deps.createErrorResponse("Unauthorized", 401, req, authError as Error);
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId") || undefined;
    
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const fetchAllParam = url.searchParams.get("fetchAll");

    const serviceParams: GetTransactionHistoryParams = {};
    if (limitParam) serviceParams.limit = parseInt(limitParam, 10);
    if (offsetParam) serviceParams.offset = parseInt(offsetParam, 10);
    if (fetchAllParam === "true") serviceParams.fetchAll = true;

    // Validate limit and offset if provided and not fetching all
    if (!serviceParams.fetchAll) {
      if (serviceParams.limit !== undefined && (isNaN(serviceParams.limit) || serviceParams.limit < 0)) {
        deps.logger.error("Invalid limit parameter", { limit: serviceParams.limit });
        return deps.createErrorResponse("Invalid limit parameter", 400, req);
      }
      if (serviceParams.offset !== undefined && (isNaN(serviceParams.offset) || serviceParams.offset < 0)) {
        deps.logger.error("Invalid offset parameter", { offset: serviceParams.offset });
        return deps.createErrorResponse("Invalid offset parameter", 400, req);
      }
    }

    deps.logger.info(`Fetching wallet history for user: ${user.id}, org: ${organizationId}`, 
      { params: serviceParams });

    const tokenWalletService = deps.tokenWalletServiceInstance || new deps.NewTokenWalletService(supabaseUserClient);
    const contextWallet = await tokenWalletService.getWalletForContext(user.id, organizationId);

    if (!contextWallet) {
      deps.logger.info("No wallet found for context, returning empty history", { userId: user.id, organizationId });
      return deps.createSuccessResponse({ transactions: [], totalCount: 0 } as PaginatedTransactions, 200, req);
    }

    // Pass the params object to the service method
    const paginatedHistory = await tokenWalletService.getTransactionHistory(contextWallet.walletId, serviceParams);

    return deps.createSuccessResponse(paginatedHistory, 200, req);

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    deps.logger.error("Error in /wallet-history function", { error: err.message, stack: err.stack });
    return deps.createErrorResponse(err.message || "An unexpected error occurred", 500, req, err);
  }
}

serve((req) => walletHistoryRequestHandler(req, defaultDeps)); 