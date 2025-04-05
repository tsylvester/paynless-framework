import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as actualCreateClient } from "npm:@supabase/supabase-js";
import type { 
    SupabaseClient, 
    AuthResponse, 
    SupabaseClientOptions, 
    AuthError, 
    User, 
    Session, // Needed for refresh response
    PostgrestSingleResponse // For profile fetch return type
} from "@supabase/supabase-js";
import { 
  createErrorResponse as actualCreateErrorResponse, 
  createSuccessResponse as actualCreateSuccessResponse,
  handleCorsPreflightRequest as actualHandleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";

// Define dependencies
export interface SessionHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    createErrorResponse: (message: string, status?: number) => Response;
    createSuccessResponse: (data: unknown, status?: number) => Response;
    createSupabaseClient: (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;
    // Specific client methods for testing complex interactions
    // getUser?: (client: SupabaseClient<any>, token: string) => Promise<{ data: { user: User | null }, error: AuthError | null }>;
    // refreshSession?: (client: SupabaseClient<any>, args: { refresh_token: string }) => Promise<AuthResponse>;
    // fetchProfile?: (client: SupabaseClient<any>, userId: string) => Promise<PostgrestSingleResponse<any>>;
}

// Default dependencies
const defaultDeps: SessionHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateClient
};

// Export the handler, accepting dependencies
export async function handleSessionRequest(
    req: Request,
    deps: SessionHandlerDeps = defaultDeps
): Promise<Response> {
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Unlike register/login, this function expects a body but doesn't check method?
  // Consider adding a POST check if appropriate.
  // Original code allowed any method if CORS passed.

  try {
    const { access_token, refresh_token } = await req.json();

    if (!access_token || !refresh_token) {
        return deps.createErrorResponse("Access token and refresh token are required", 400);
    }

    const supabaseClient = deps.createSupabaseClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Check if the access token is valid
    const { data: getUserData, error: accessError } = await supabaseClient.auth.getUser(access_token);

    if (accessError) {
      // If the access token is invalid, try to refresh it
      console.log("Access token invalid or expired, attempting refresh...");
      const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession({ refresh_token });

      if (refreshError) {
        console.error("Refresh error:", refreshError);
        return deps.createErrorResponse(refreshError.message, 401); // Refresh failed -> Unauthorized
      }

      // Ensure refresh response is valid
      if (!refreshData || !refreshData.user || !refreshData.session) {
          console.error("Refresh succeeded but user/session data missing:", refreshData);
          return deps.createErrorResponse("Session refresh failed.", 500);
      }

      console.log("Refresh successful, fetching profile...");
      let profile = null;
      try {
          const { data: profileData, error: profileError } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', refreshData.user.id)
            .maybeSingle();
          if (profileError) {
            console.error("Profile fetch error (after refresh, non-critical):", profileError);
          } else {
            profile = profileData;
          }
      } catch (profileCatchError) {
        console.error("Unexpected error during profile fetch (after refresh):", profileCatchError);
      }

      // Return NEW session data after successful refresh
      return deps.createSuccessResponse({
        user: refreshData.user,
        session: refreshData.session, // Return the whole new session
        profile: profile 
      });
    }
    
    // Access token was valid, ensure user data is present
    if (!getUserData || !getUserData.user) {
        console.error("getUser succeeded but user data missing:", getUserData);
        return deps.createErrorResponse("Failed to retrieve user data.", 500);
    }

    console.log("Access token valid, fetching profile...");
    const currentUser = getUserData.user; // User from valid access token
    let profile = null;
    try {
        const { data: profileData, error: profileError } = await supabaseClient
          .from('user_profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();
        if (profileError) {
            console.error("Profile fetch error (valid token, non-critical):", profileError);
        } else {
            profile = profileData;
        }
    } catch (profileCatchError) {
        console.error("Unexpected error during profile fetch (valid token):", profileCatchError);
    }
    
    // Return user and profile (NO session/token returned when access token was already valid)
    return deps.createSuccessResponse({
      user: currentUser,
      profile: profile
    });

  } catch (error) {
    // Catch errors like req.json() failing
    console.error("Error in session handler:", error);
    if (error instanceof SyntaxError) {
        return deps.createErrorResponse("Invalid JSON body", 400);
    }
    return deps.createErrorResponse("Internal server error", 500);
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve((req) => handleSessionRequest(req, defaultDeps)); 
} 