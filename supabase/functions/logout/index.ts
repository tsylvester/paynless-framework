import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient as actualCreateClient } from "npm:@supabase/supabase-js";
import type { SupabaseClient, AuthResponse, SupabaseClientOptions, AuthError } from "@supabase/supabase-js";
import { 
  createErrorResponse as actualCreateErrorResponse, 
  createSuccessResponse as actualCreateSuccessResponse,
  handleCorsPreflightRequest as actualHandleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { 
    createSupabaseClient as actualCreateSupabaseClient, 
    verifyApiKey as actualVerifyApiKey, 
    createUnauthorizedResponse as actualCreateUnauthorizedResponse 
} from "../_shared/auth.ts";

// Define dependencies
export interface LogoutHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    verifyApiKey: typeof actualVerifyApiKey;
    createUnauthorizedResponse: typeof actualCreateUnauthorizedResponse;
    createErrorResponse: (message: string, status?: number) => Response;
    createSuccessResponse: (data: unknown, status?: number) => Response;
    createSupabaseClient: typeof actualCreateSupabaseClient;
    signOut?: (client: SupabaseClient<any>) => Promise<{ error: AuthError | null }>;
}

// Default dependencies
const defaultDeps: LogoutHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateSupabaseClient,
    signOut: (client) => client.auth.signOut(),
};

// Export the handler, accepting dependencies
export async function handleLogoutRequest(
    req: Request,
    deps: LogoutHandlerDeps = defaultDeps
): Promise<Response> {
  // Use injected dependencies
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key first
  if (!deps.verifyApiKey(req)) {
      return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }

  if (req.method !== 'POST') {
      return deps.createErrorResponse('Method Not Allowed', 405);
  }

  try {
    // Use client factory that reads Authorization header
    console.log("[logout/index.ts] Creating client from request auth header...");
    const supabaseClient = deps.createSupabaseClient(req);
    console.log("[logout/index.ts] Client created. Calling signOut...");
    
    // Sign out the user associated with the token used by the client
    const signOutImpl = deps.signOut || defaultDeps.signOut!;
    const { error } = await signOutImpl(supabaseClient);
    console.log(`[logout/index.ts] signOut result: error=${error?.message}`);
    
    if (error) {
      console.error("[logout/index.ts] Logout error:", error);
      return deps.createErrorResponse(error.message, error.status === 401 ? 401 : 500);
    }

    console.log("[logout/index.ts] SignOut successful.");
    return deps.createSuccessResponse({ message: "Successfully signed out" });

  } catch (error) {
    console.error("[logout/index.ts] Error in logout handler:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof Error && error.message?.includes("Unauthorized") ? 401 : 500;
    return deps.createErrorResponse(message, status);
  }
}

if (import.meta.main) {
    serve((req) => handleLogoutRequest(req, defaultDeps));
} 