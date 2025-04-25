// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Import types
import type { 
    SupabaseClient, 
    AuthError, 
    User,
    PostgrestSingleResponse
} from "@supabase/supabase-js";
// Import dependencies and rename
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

// Define dependencies interface (Restoring)
export interface MeHandlerDeps {
    handleCorsPreflightRequest: typeof actualHandleCorsPreflightRequest;
    verifyApiKey: typeof actualVerifyApiKey;
    createUnauthorizedResponse: typeof actualCreateUnauthorizedResponse;
    createErrorResponse: typeof actualCreateErrorResponse;
    createSuccessResponse: typeof actualCreateSuccessResponse;
    createSupabaseClient: typeof actualCreateSupabaseClient;
}

// Default dependencies (Restoring)
const defaultDeps: MeHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateSupabaseClient,
};

// Export the handler with deps parameter (Restoring)
export async function handleMeRequest(
    req: Request,
    deps: MeHandlerDeps = defaultDeps // Restore default parameter
): Promise<Response> {
  console.log("[me/index.ts] Handling request:", req.method, req.url);
  // Use deps again
  const corsResponse = deps.handleCorsPreflightRequest(req); 
  if (corsResponse) return corsResponse;

  console.log("[me/index.ts] Verifying API key...");
  // Use deps again
  const isValidApiKey = deps.verifyApiKey(req); 
  if (!isValidApiKey) {
    console.log("[me/index.ts] API key verification failed.");
    // Use deps again - createUnauthorizedResponse only takes message
    return deps.createUnauthorizedResponse("Invalid or missing apikey"); 
  }
  console.log("[me/index.ts] API key verified.");

  try {
    console.log("[me/index.ts] Creating Supabase client...");
    // Use deps again
    const supabase = deps.createSupabaseClient(req); 
    console.log("[me/index.ts] Supabase client created.");
    
    console.log("[me/index.ts] Calling supabase.auth.getUser()...");
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log(`[me/index.ts] supabase.auth.getUser() result: user=${!!user}, error=${userError?.message}`);

    if (userError || !user) {
      console.error("[me/index.ts] Auth error or no user:", userError);
      // Use deps again - createUnauthorizedResponse only takes message
      return deps.createUnauthorizedResponse("Not authenticated"); 
    }
    console.log(`[me/index.ts] User authenticated: ${user.id}`);

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        console.log(`[me/index.ts] Handling GET for user ${user.id}`);
        let profileData = null;
        let profileError = null;
        try {
            console.log(`[me/index.ts] Fetching profile for user ${user.id}...`);
            const { data, error } = await supabase // supabase client is fine
              .from('user_profiles')
              .select('*')
              .eq('id', user.id)
              .single();
            profileData = data;
            profileError = error;
             console.log(`[me/index.ts] Profile fetch result: data=${!!profileData}, error=${profileError?.message}`);
        } catch (fetchErr) {
            console.error('[me/index.ts] Exception during profile fetch:', fetchErr);
            // Revert: Remove fetchErr argument
            return deps.createErrorResponse("Error fetching profile data", 500, req); 
        }

        if (profileError) {
          console.error('[me/index.ts] Error fetching profile:', profileError);
           // Revert: Remove profileError argument
          return deps.createErrorResponse("Failed to fetch profile", 500, req); 
        }

        console.log(`[me/index.ts] Profile fetch successful for user ${user.id}. Returning combined data.`);
        const responseData = {
            user: user,
            profile: profileData || null
        };
        // Add req argument
        return deps.createSuccessResponse(responseData, 200, req);
      }

      case 'PUT': {
        console.log(`[me/index.ts] Handling PUT for user ${user.id}`);
        let updates: any;
        try {
            updates = await req.json();
        } catch (jsonError) {
            console.error("Failed to parse PUT body:", jsonError);
            // Revert: Remove jsonError argument
            return deps.createErrorResponse("Invalid JSON body for update", 400, req); 
        }
        
        let updatedProfile = null;
        let updateError = null;
        try {
            const { data, error } = await supabase // supabase client is fine
              .from('user_profiles')
              .update(updates)
              .eq('id', user.id)
              .select()
              .single();
            updatedProfile = data;
            updateError = error;
        } catch (updateCatchErr) {
            console.error('Exception during profile update:', updateCatchErr);
             // Revert: Remove updateCatchErr argument
            return deps.createErrorResponse("Error updating profile data", 500, req); 
        }

        if (updateError) {
          console.error('Error updating profile:', updateError);
          // Revert: Remove updateError argument
          return deps.createErrorResponse("Failed to update profile", 500, req); 
        }
        // Add req argument
        return deps.createSuccessResponse(updatedProfile, 200, req);
      }

      default:
        console.log(`[me/index.ts] Method ${req.method} not allowed.`);
        // Revert: Remove req argument (It was already correct here, just ensuring consistency)
        return deps.createErrorResponse("Method not allowed", 405, req); 
    }
  } catch (err) {
    console.error("[me/index.ts] FATAL UNEXPECTED ERROR in handler:", err);
    // Add instanceof check for err before accessing properties
    if (err instanceof Error) {
        console.error("Error Name:", err.name);
        console.error("Error Message:", err.message);
        console.error("Error Stack:", err.stack);
    }
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
     // Use deps again
    return deps.createErrorResponse(
      errorMessage,
      500,
      req, // Add req argument
      err // Pass original error
    );
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    // Update serve call to explicitly pass defaultDeps
    serve((req) => handleMeRequest(req, defaultDeps));
} 