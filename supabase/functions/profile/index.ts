import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

// Define an interface for the upsert data structure
interface UserProfileUpsertData {
  id: string;
  updated_at: string;
  first_name?: string;
  last_name?: string;
  role?: string;       
}

// Define dependencies
export interface ProfileHandlerDeps {
    handleCorsPreflightRequest: typeof actualHandleCorsPreflightRequest;
    verifyApiKey: typeof actualVerifyApiKey;
    createUnauthorizedResponse: typeof actualCreateUnauthorizedResponse;
    createErrorResponse: typeof actualCreateErrorResponse;
    createSuccessResponse: typeof actualCreateSuccessResponse;
    createSupabaseClient: typeof actualCreateSupabaseClient;
    // Optional finer-grained mocks 
    // getUser?: (client: SupabaseClient) => Promise<{ data: { user: User | null }, error: AuthError | null }>;
    // fetchProfileMaybe?: (client: SupabaseClient, userId: string) => Promise<PostgrestSingleResponse<any>>;
    // upsertProfile?: (client: SupabaseClient, data: UserProfileUpsertData) => Promise<PostgrestSingleResponse<any>>;
}

// Default dependencies
const defaultDeps: ProfileHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateSupabaseClient,
};

// Export the handler
export async function handleProfileRequest(
    req: Request,
    deps: ProfileHandlerDeps = defaultDeps
): Promise<Response> {
  // Handle CORS preflight requests
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key
  const isValidApiKey = deps.verifyApiKey(req);
  if (!isValidApiKey) {
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    // Create client using injected factory
    const supabase = deps.createSupabaseClient(req);
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error("Auth error or no user:", userError);
      return deps.createUnauthorizedResponse("Not authenticated");
    }

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        let profile = null;
        let profileError = null;
        try {
            const { data, error } = await supabase
              .from('user_profiles')
              .select('*') 
              .eq('id', user.id)
              .maybeSingle(); 
            profile = data;
            profileError = error;
        } catch (fetchErr) {
            console.error('Exception fetching profile:', fetchErr);
            return deps.createErrorResponse("Error fetching profile data", 500);
        }

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          return deps.createErrorResponse(`Failed to fetch profile: ${profileError.message}`, 500);
        }

        const responseData = { user, profile };
        return deps.createSuccessResponse(responseData);
      }

      case 'PUT': {
        let profileData: any;
        try {
            profileData = await req.json();
        } catch (parseError) {
            console.error('Error parsing PUT body:', parseError);
            return deps.createErrorResponse("Invalid request body", 400);
        }
        
        const upsertObject: UserProfileUpsertData = {
            id: user.id,
            updated_at: new Date().toISOString(), 
            // Conditionally add fields
            ...(profileData.first_name !== undefined && { first_name: profileData.first_name }),
            ...(profileData.last_name !== undefined && { last_name: profileData.last_name }),
            ...(profileData.role !== undefined && { role: profileData.role }), 
        };

        console.log('Upserting profile data:', JSON.stringify(upsertObject));

        let updatedProfile = null;
        let updateError = null;
        try {
            const { data, error } = await supabase
              .from('user_profiles')
              .upsert(upsertObject) 
              .select()
              .single(); // select().single() after upsert is common
            updatedProfile = data;
            updateError = error;
        } catch (upsertErr) {
            console.error('Exception during profile upsert:', upsertErr);
            return deps.createErrorResponse("Error saving profile data", 500);
        }

        if (updateError) {
          console.error('Error updating profile:', updateError); 
          return deps.createErrorResponse(`Failed to update profile: ${updateError.message}`, 500);
        }

        return deps.createSuccessResponse(updatedProfile); 
      }

      default:
        return deps.createErrorResponse("Method not allowed", 405);
    }
  } catch (err) {
    console.error("Unexpected error in /profile handler:", err);
    return deps.createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred",
      500
    );
  }
}

// Only run serve if the module is executed directly
if (import.meta.main) {
    serve(handleProfileRequest);
} 