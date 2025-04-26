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

// --- Service Abstraction ---
// Interface defining the specific Supabase interactions needed by the handler
export interface RefreshService {
  refreshSession(refreshToken: string): Promise<AuthResponse>;
  fetchProfile(userId: string): Promise<PostgrestSingleResponse<any>>;
}

// Default implementation using the real Supabase client
export class SupabaseRefreshService implements RefreshService {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async refreshSession(refreshToken: string): Promise<AuthResponse> {
    console.log("[SupabaseRefreshService] Calling refreshSession...");
    return await this.supabase.auth.refreshSession({ refresh_token: refreshToken });
  }

  async fetchProfile(userId: string): Promise<PostgrestSingleResponse<any>> {
    console.log(`[SupabaseRefreshService] Fetching profile for user: ${userId}`);
    return await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
  }
}

// Define dependencies, now including the RefreshService
export interface RefreshHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    verifyApiKey: (req: Request) => boolean;
    createUnauthorizedResponse: (message: string) => Response;
    createErrorResponse: (message: string, status: number, request: Request, error?: unknown) => Response;
    createSuccessResponse: (data: unknown, status: number, request: Request) => Response;
    // Replace createSupabaseClient with the service instance
    refreshService: RefreshService; 
}

// Default dependencies - now includes creating the service instance
const createDefaultDeps = (): RefreshHandlerDeps => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY environment variables are not set.");
    }
    const supabaseClient = actualCreateClient(supabaseUrl, supabaseAnonKey);
    const refreshServiceInstance = new SupabaseRefreshService(supabaseClient);

    return {
        handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
        verifyApiKey: actualVerifyApiKey,
        createUnauthorizedResponse: actualCreateUnauthorizedResponse,
        createErrorResponse: actualCreateErrorResponse,
        createSuccessResponse: actualCreateSuccessResponse,
        refreshService: refreshServiceInstance, // Provide the service instance
    };
};

// Export the handler, accepting dependencies
export async function handleRefreshRequest(
    req: Request,
    // Initialize deps using the factory function
    deps: RefreshHandlerDeps = createDefaultDeps() 
): Promise<Response> {
  // Handle CORS preflight request first
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all non-OPTIONS requests
  const isValidApiKey = deps.verifyApiKey(req);
  if (!isValidApiKey) {
    // Note: createUnauthorizedResponse doesn't need the request object per its definition in auth.ts
    return deps.createUnauthorizedResponse("Invalid or missing apikey"); 
  }

  try {
    // Get refresh token from Authorization header
    const authHeader = req.headers.get('Authorization');
    const refreshToken = authHeader?.replace('Bearer ', '');
    
    if (!refreshToken) {
      return deps.createErrorResponse("Refresh token is required in Authorization header", 400, req);
    }
    
    // Use the injected service to refresh the session
    const { data, error: refreshError } = await deps.refreshService.refreshSession(refreshToken);

    if (refreshError) {
      console.error("Refresh error:", refreshError);
      // Pass request and error to createErrorResponse
      return deps.createErrorResponse(refreshError.message || "Failed to refresh token", 401, req, refreshError); 
    }

    // Check if session and user data are present after refresh
    if (!data || !data.session || !data.user) {
      console.error("No session or user data returned after successful refresh");
      // Pass request to createErrorResponse
      return deps.createErrorResponse("Failed to refresh session: Incomplete data", 500, req); 
    }

    // Use non-null assertions as we've already checked for nulls above
    const { session, user }: { session: Session, user: User } = { session: data.session!, user: data.user! };

    // Get the user's profile using the injected service
    let userProfile = null; 
    try {
      // Use the service to fetch the profile
      const { data: profile, error: profileError } = await deps.refreshService.fetchProfile(user.id);
      
      if (profileError) {
        console.error("Profile fetch error after refresh (non-critical):", profileError);
        // Decide if you want to return an error or just proceed without profile
        // For now, we proceed and return null profile
      } else {
        userProfile = profile;
      }
    } catch (profileCatchError) {
       console.error("Exception during profile fetch after refresh (non-critical):", profileCatchError);
       // Proceed with null profile
    }

    // Return user, formatted session, and profile using the success response creator
    // Pass request to createSuccessResponse
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
    }, 200, req); 

  } catch (error) {
    // Catch unexpected errors (e.g., service creation failure in defaultDeps)
    console.error("Error in refresh handler:", error);
    // Pass request and error to createErrorResponse
    return deps.createErrorResponse("Internal server error", 500, req, error); 
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    // Ensure serve uses the default dependencies factory
    serve((req) => handleRefreshRequest(req, createDefaultDeps())); 
}