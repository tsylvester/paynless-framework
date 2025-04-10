// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/ or @paynless/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as actualCreateClient } from "npm:@supabase/supabase-js";
import type { 
    SupabaseClient, 
    AuthResponse, 
    SupabaseClientOptions, 
    AuthError, 
    User, 
    Session,
    PostgrestSingleResponse
} from "@supabase/supabase-js";
import { 
  createErrorResponse as actualCreateErrorResponse, 
  createSuccessResponse as actualCreateSuccessResponse,
  handleCorsPreflightRequest as actualHandleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { 
    verifyApiKey as actualVerifyApiKey, 
    createUnauthorizedResponse as actualCreateUnauthorizedResponse 
} from "../_shared/auth.ts";

/**
 * NOTE: Edge functions don't return console logs to us in production environments.
 * Avoid using console.log/error/warn/info for debugging as they won't be visible
 * and can affect function execution.
 */

// Define dependencies
export interface RefreshHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    verifyApiKey: (req: Request) => boolean;
    createUnauthorizedResponse: (message: string) => Response;
    createErrorResponse: (message: string, status?: number) => Response;
    createSuccessResponse: (data: unknown, status?: number) => Response;
    createSupabaseClient: (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;
    // Optional finer-grained mocks if needed
    // refreshSession?: (client: SupabaseClient<any>, args: { refresh_token: string }) => Promise<AuthResponse>;
    // fetchProfile?: (client: SupabaseClient<any>, userId: string) => Promise<PostgrestSingleResponse<any>>;
}

// Default dependencies
const defaultDeps: RefreshHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateClient
};

// Export the handler, accepting dependencies
export async function handleRefreshRequest(
    req: Request,
    deps: RefreshHandlerDeps = defaultDeps
): Promise<Response> {
  // Handle CORS preflight request first
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all non-OPTIONS requests
  const isValidApiKey = deps.verifyApiKey(req);
  if (!isValidApiKey) {
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    // Get refresh token from Authorization header
    const authHeader = req.headers.get('Authorization');
    const refreshToken = authHeader?.replace('Bearer ', '');
    
    if (!refreshToken) {
      return deps.createErrorResponse("Refresh token is required in Authorization header", 400);
    }
    
    // Initialize Supabase client using injected factory
    const supabaseClient = deps.createSupabaseClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      // Pass any specific options if needed, e.g., for auth persistence
      // Original didn't specify, so we omit for now
    );

    // Refresh the session using the refresh token
    const { data, error: refreshError } = await supabaseClient.auth.refreshSession({ 
      refresh_token: refreshToken 
    });

    if (refreshError) {
      console.error("Refresh error:", refreshError);
      return deps.createErrorResponse(refreshError.message || "Failed to refresh token", 401);
    }

    // Check if session and user data are present after refresh
    if (!data || !data.session || !data.user) {
      console.error("No session or user data returned after successful refresh");
      return deps.createErrorResponse("Failed to refresh session: Incomplete data", 500);
    }

    const { session, user }: { session: Session, user: User } = data;

    // Get the user's profile using the (implicitly) authenticated client
    let userProfile = null; 
    try {
      const { data: profile, error: profileError } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profileError) {
        console.error("Profile fetch error after refresh (non-critical):", profileError);
      } else {
        userProfile = profile;
      }
    } catch (profileCatchError) {
       console.error("Exception during profile fetch after refresh (non-critical):", profileCatchError);
    }

    // Return user, formatted session, and profile
    return deps.createSuccessResponse({
      user: user,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expiresIn: session.expires_in,
        expiresAt: session.expires_at,
        token_type: session.token_type
      },
      profile: userProfile
    });

  } catch (error) {
    // Catch unexpected errors (e.g., client creation failure, though unlikely here)
    console.error("Error in refresh handler:", error);
    return deps.createErrorResponse("Internal server error", 500);
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve((req) => handleRefreshRequest(req, defaultDeps));
}