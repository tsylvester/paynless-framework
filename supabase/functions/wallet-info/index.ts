import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createSupabaseClient } from "../_shared/auth.ts";
import { TokenWalletService } from "../_shared/services/tokenWalletService.ts";
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse 
} from "../_shared/cors-headers.ts";
import type { TokenWallet } from "../_shared/types/tokenWallet.types.ts";
import { logger } from "../_shared/logger.ts";
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Define Dependencies Interface
export interface WalletInfoHandlerDeps {
  createSupabaseClient: (req: Request) => SupabaseClient;
  tokenWalletServiceInstance?: TokenWalletService;
  NewTokenWalletService: typeof TokenWalletService;
  handleCorsPreflightRequest: typeof handleCorsPreflightRequest;
  createErrorResponse: typeof createErrorResponse;
  createSuccessResponse: typeof createSuccessResponse;
  logger: typeof logger;
}

// Create Default Dependencies
const supabaseUrlForDefault = Deno.env.get("SUPABASE_URL");
const serviceRoleKeyForDefault = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Note: Default TokenWalletService instantiation might be complex if it needs an async-created client.
// For now, we'll rely on it being created inside the handler if not provided, using the client from deps.
export const defaultDeps: WalletInfoHandlerDeps = {
  createSupabaseClient: createSupabaseClient,
  NewTokenWalletService: TokenWalletService,
  handleCorsPreflightRequest: handleCorsPreflightRequest,
  createErrorResponse: createErrorResponse,
  createSuccessResponse: createSuccessResponse,
  logger: logger,
};

interface WalletInfoResponse {
  data: TokenWallet | null;
  error?: { message: string; code?: string };
}

export async function walletInfoRequestHandler(req: Request, deps: WalletInfoHandlerDeps = defaultDeps): Promise<Response> {
  const {
    handleCorsPreflightRequest,
    createSupabaseClient,
    NewTokenWalletService,
    tokenWalletServiceInstance,
    createErrorResponse,
    createSuccessResponse,
    logger,
  } = deps;

  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) {
    return corsPreflightResponse;
  }

  try {
    const supabaseUserClient = createSupabaseClient(req);
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
      logger.error("Authentication error in /wallet-info", { error: authError });
      return createErrorResponse("Unauthorized", 401, req, authError as Error);
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId") || undefined;
    const userId = user.id;

    logger.info(`[WalletInfoHandler INFO] Fetching wallet info for user: ${userId}, org: ${organizationId}`);

    const tokenWalletService = tokenWalletServiceInstance || new NewTokenWalletService(supabaseUserClient);

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