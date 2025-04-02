import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
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
    // Initialize Supabase client with Authorization header in global config
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get token from Authorization header
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return createErrorResponse("Refresh token is required", 400);
    }

    // Refresh the session using the token
    const { data, error } = await supabaseClient.auth.refreshSession(token);

    if (error) {
      console.error("Refresh error:", error);
      return createErrorResponse(error.message, 401);
    }

    if (!data || !data.session) {
      console.error("No session data returned after successful refresh");
      return createErrorResponse("Failed to refresh session", 500);
    }

    const { session, user } = data;

    // Get the user's profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      // Don't fail if profile fetch fails
    }

    return createSuccessResponse({
      user,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expiresAt: session.expires_at
      },
      profile: profile || null
    });
  } catch (error) {
    console.error("Error in refresh handler:", error);
    return createErrorResponse("Internal server error", 500);
  }
});