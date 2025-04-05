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
  // getUserIdFromClient and isAuthenticatedWithClient are not directly used here
} from '../_shared/auth.ts';

// Define dependencies
export interface MeHandlerDeps {
    handleCorsPreflightRequest: typeof actualHandleCorsPreflightRequest;
    verifyApiKey: typeof actualVerifyApiKey;
    createUnauthorizedResponse: typeof actualCreateUnauthorizedResponse;
    createErrorResponse: typeof actualCreateErrorResponse;
    createSuccessResponse: typeof actualCreateSuccessResponse;
    createSupabaseClient: typeof actualCreateSupabaseClient;
    // Optional finer-grained mocks if needed
    // getUser?: (client: SupabaseClient) => Promise<{ data: { user: User | null }, error: AuthError | null }>;
    // fetchProfile?: (client: SupabaseClient, userId: string) => Promise<PostgrestSingleResponse<any>>;
    // updateProfile?: (client: SupabaseClient, userId: string, updates: any) => Promise<PostgrestSingleResponse<any>>;
}

// Default dependencies
const defaultDeps: MeHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateSupabaseClient,
};

// Export the handler
export async function handleMeRequest(
    req: Request,
    deps: MeHandlerDeps = defaultDeps
): Promise<Response> {
  // Handle CORS preflight requests
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all non-OPTIONS requests
  const isValidApiKey = deps.verifyApiKey(req);
  if (!isValidApiKey) {
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    // Create client using injected factory (relies on Authorization header)
    const supabase = deps.createSupabaseClient(req); 
    
    // Get the current user using injected client
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error("Auth error or no user:", userError);
      return deps.createUnauthorizedResponse("Not authenticated");
    }

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        let profileData = null;
        let profileError = null;
        try {
            const { data, error } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', user.id)
              .single();
            profileData = data;
            profileError = error;
        } catch (fetchErr) {
            console.error('Exception during profile fetch:', fetchErr);
            return deps.createErrorResponse("Error fetching profile data", 500);
        }

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          return deps.createErrorResponse("Failed to fetch profile", 500);
        }

        return deps.createSuccessResponse(profileData || null);
      }

      case 'PUT': {
        let updates: any;
        try {
            updates = await req.json();
        } catch (jsonError) {
            console.error("Failed to parse PUT body:", jsonError);
            return deps.createErrorResponse("Invalid JSON body for update", 400);
        }
        
        let updatedProfile = null;
        let updateError = null;
        try {
            const { data, error } = await supabase
              .from('user_profiles')
              .update(updates)
              .eq('id', user.id)
              .select()
              .single();
            updatedProfile = data;
            updateError = error;
        } catch (updateCatchErr) {
            console.error('Exception during profile update:', updateCatchErr);
            return deps.createErrorResponse("Error updating profile data", 500);
        }

        if (updateError) {
          console.error('Error updating profile:', updateError);
          return deps.createErrorResponse("Failed to update profile", 500);
        }

        return deps.createSuccessResponse(updatedProfile);
      }

      default:
         // Use deps for response creation
        return deps.createErrorResponse("Method not allowed", 405);
    }
  } catch (err) {
    // Catch errors from createSupabaseClient or unexpected issues
    console.error("Unexpected error in /me handler:", err);
    return deps.createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred",
      500
    );
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve(handleMeRequest);
} 