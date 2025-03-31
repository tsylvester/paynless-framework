import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { 
  createErrorResponse, 
  createSuccessResponse,
  handleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight request first
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const { access_token, refresh_token } = await req.json();

    // Initialize Supabase client with the anon key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Check if the access token is valid
    const { data: { user }, error: accessError } = await supabaseClient.auth.getUser(access_token);

    if (accessError) {
      // If the access token is invalid, try to refresh it
      const { data, error: refreshError } = await supabaseClient.auth.refreshSession({ refresh_token });

      if (refreshError) {
        console.error("Refresh error:", refreshError);
        return createErrorResponse(refreshError.message, 401);
      }

      // Get the user's profile
      const { data: profile, error: profileError } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error("Profile fetch error:", profileError);
        // Don't fail if profile fetch fails
      }

      return createSuccessResponse({
        user: data.user,
        access_token: data.access_token,
        profile: profile || null
      });
    }

    // If the access token is valid, get the user's profile
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
      profile: profile || null
    });
  } catch (error) {
    console.error("Error in session handler:", error);
    return createErrorResponse("Internal server error", 500);
  }
}); 