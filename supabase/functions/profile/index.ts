// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { 
    SupabaseClient, 
    AuthError, 
    User,
    PostgrestSingleResponse // Used by select().single() and select().maybeSingle()
} from "@supabase/supabase-js";
import { 
  handleCorsPreflightRequest as actualHandleCorsPreflightRequest, 
  createErrorResponse as actualCreateErrorResponse, 
  createSuccessResponse as actualCreateSuccessResponse 
} from '../_shared/cors-headers.ts';
import { 
  createSupabaseClient as actualCreateSupabaseClient, 
  verifyApiKey as actualVerifyApiKey,
  createUnauthorizedResponse as actualCreateUnauthorizedResponse
} from '../_shared/auth.ts';

// Define dependencies
export interface ProfileHandlerDeps {
    handleCorsPreflightRequest: typeof actualHandleCorsPreflightRequest;
    verifyApiKey: typeof actualVerifyApiKey;
    createUnauthorizedResponse: typeof actualCreateUnauthorizedResponse;
    createErrorResponse: typeof actualCreateErrorResponse;
    createSuccessResponse: typeof actualCreateSuccessResponse;
    createSupabaseClient: typeof actualCreateSupabaseClient;
    getPathname: (req: Request) => string;
}

// Default dependencies
const defaultDeps: ProfileHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateSupabaseClient,
    getPathname: (req) => new URL(req.url).pathname,
};

// Export the handler
export async function handleProfileRequest(
    req: Request,
    deps: ProfileHandlerDeps = defaultDeps
): Promise<Response> {
  const { 
      handleCorsPreflightRequest,
      verifyApiKey,
      createUnauthorizedResponse,
      createErrorResponse,
      createSuccessResponse,
      createSupabaseClient,
      getPathname
  } = deps;

  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key
  const isValidApiKey = verifyApiKey(req);
  if (!isValidApiKey) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    // Create client using injected factory
    const supabase = createSupabaseClient(req);
    
    // Get the current user (to ensure the request is authenticated)
    const { data: { user: requestingUser }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !requestingUser) {
      console.error("Profile Auth error or no user:", userError);
      return createUnauthorizedResponse("Not authenticated");
    }
    
    // --- Routing and Parameter Extraction ---
    const path = getPathname(req);
    const profileMatch = path.match(/^\/profile\/([^\/]+)$/); // Match /profile/<userId>
    
    if (!profileMatch) {
        console.warn(`[profile] Invalid path accessed: ${path}`);
        return createErrorResponse("Not Found", 404);
    }
    
    const targetUserId = profileMatch[1];
    console.log(`[profile] Requesting user ${requestingUser.id} fetching profile for user ${targetUserId}`);

    // Handle different HTTP methods - Only GET is allowed now
    switch (req.method) {
      case 'GET': {
        let profile = null;
        let profileError = null;
        try {
            // Fetch the profile using the userId from the path
            const { data, error } = await supabase
              .from('user_profiles')
              .select('id, first_name, last_name, created_at') // Select only public fields
              .eq('id', targetUserId) // Use targetUserId from path
              .maybeSingle(); 
            profile = data;
            profileError = error;
        } catch (fetchErr) {
            console.error(`[profile] Exception fetching profile for ${targetUserId}:`, fetchErr);
            return createErrorResponse("Error fetching profile data", 500);
        }

        if (profileError) {
          console.error(`[profile] Error fetching profile for ${targetUserId}:`, profileError);
          // Don't expose detailed DB errors
          return createErrorResponse("Failed to fetch profile", 500); 
        }
        
        if (!profile) {
            // If maybeSingle returns null, the profile wasn't found
            return createErrorResponse("Profile not found", 404);
        }

        // Return only the fetched profile data
        return createSuccessResponse(profile);
      }

      default:
        // Return Method Not Allowed for anything other than GET
        return createErrorResponse(`Method ${req.method} not allowed`, 405);
    }
  } catch (err) {
    console.error("[profile] Unexpected error:", err);
    return createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred",
      500
    );
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve((req) => handleProfileRequest(req, defaultDeps)); // Pass default deps
} 