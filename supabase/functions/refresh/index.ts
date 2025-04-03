import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, Session, User } from "jsr:@supabase/supabase-js@2";
import { 
  createErrorResponse, 
  createSuccessResponse,
  handleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";

/**
 * NOTE: Edge functions don't return console logs to us in production environments.
 * Avoid using console.log/error/warn/info for debugging as they won't be visible
 * and can affect function execution.
 */

serve(async (req) => {
  // Handle CORS preflight request first
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all non-OPTIONS requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    // Initialize Supabase client with anon key. Auth state will be managed internally.
    // The apikey header check already verified the caller.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    // Get refresh token from Authorization header
    const authHeader = req.headers.get('Authorization');
    const refreshToken = authHeader?.replace('Bearer ', '');
    
    if (!refreshToken) {
      return createErrorResponse("Refresh token is required in Authorization header", 400);
    }

    // Refresh the session using the refresh token
    // Pass it as an object { refresh_token: ... }
    const { data, error: refreshError } = await supabaseClient.auth.refreshSession({ 
      refresh_token: refreshToken 
    });

    if (refreshError) {
      console.error("Refresh error:", refreshError);
      // Provide a more specific error message if possible
      return createErrorResponse(refreshError.message || "Failed to refresh token", 401);
    }

    // Check if session and user data are present after refresh
    if (!data || !data.session || !data.user) {
      console.error("No session or user data returned after successful refresh");
      return createErrorResponse("Failed to refresh session: Incomplete data", 500);
    }

    // Destructure after checks
    const { session, user }: { session: Session, user: User } = data;

    // Get the user's profile using the now-authenticated client
    let userProfile = null; // Default to null
    try {
      const { data: profile, error: profileError } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (profileError) {
        console.error("Profile fetch error after refresh:", profileError);
        // Log the error but proceed without profile data
      } else {
        userProfile = profile;
      }
    } catch (profileCatchError) {
       console.error("Exception during profile fetch after refresh:", profileCatchError);
       // Log the error but proceed without profile data
    }

    // Return user, formatted session, and profile
    return createSuccessResponse({
      user: user,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expiresIn: session.expires_in, // Keep original key
        expiresAt: session.expires_at, // Keep original key
        token_type: session.token_type // Keep original key
      },
      profile: userProfile // Send fetched profile or null
    });
  } catch (error) {
    console.error("Error in refresh handler:", error);
    return createErrorResponse("Internal server error", 500);
  }
});