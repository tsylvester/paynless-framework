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
import type { TokenWalletTransaction } from "../_shared/types/tokenWallet.types.ts";

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

interface WalletHistoryResponse {
  data: TokenWalletTransaction[] | null;
  error?: { message: string; code?: string };
}

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
    // Ensure consistent default parsing for limit and offset
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");

    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    if (isNaN(limit) || limit < 0 || isNaN(offset) || offset < 0) {
        deps.logger.error("Invalid limit or offset", { limit, offset });
        return deps.createErrorResponse("Invalid limit or offset parameters", 400, req);
    }

    deps.logger.info(`Fetching wallet history for user: ${user.id}, org: ${organizationId}, limit: ${limit}, offset: ${offset}`);

    const tokenWalletService = deps.tokenWalletServiceInstance || new deps.NewTokenWalletService(supabaseUserClient);

    const contextWallet = await tokenWalletService.getWalletForContext(user.id, organizationId);

    if (!contextWallet) {
      deps.logger.info("No wallet found for context, returning empty history", { userId: user.id, organizationId });
      return deps.createSuccessResponse({ data: [] }, 200, req); 
    }

    const transactions = await tokenWalletService.getTransactionHistory(contextWallet.walletId, limit, offset);

    const responseBody: WalletHistoryResponse = { data: transactions };
    return deps.createSuccessResponse(responseBody, 200, req);

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    deps.logger.error("Error in /wallet-history function", { error: err.message, stack: err.stack });
    return deps.createErrorResponse(err.message || "An unexpected error occurred", 500, req, err);
  }
}

serve((req) => walletHistoryRequestHandler(req, defaultDeps)); 