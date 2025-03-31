import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { 
  createErrorResponse, 
  createSuccessResponse,
  handleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";

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
    const { refresh_token } = await req.json();

    if (!refresh_token) {
      return createErrorResponse("Refresh token is required", 400);
    }

    // Initialize Supabase client
    // Unlike login/register, here we DO need the Authorization header
    // We'll use the API Key for this refresh request
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Try to refresh the session
    const { data, error } = await supabaseClient.auth.refreshSession({ 
      refresh_token 
    });

    if (error) {
      console.error("Refresh error:", error);
      return createErrorResponse(error.message, 401);
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
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at
      },
      profile: profile || null
    });
  } catch (error) {
    console.error("Error in refresh handler:", error);
    return createErrorResponse("Internal server error", 500);
  }
});