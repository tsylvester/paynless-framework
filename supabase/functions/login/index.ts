// DEPLOYMENT NOTE: This function handles user login BEFORE a user JWT exists.
// It is secured via an API key check (verifyApiKey) within the function body.
// Deploy using: supabase functions deploy login --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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

Deno.serve(async (req) => {
  // Handle CORS preflight request first
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all non-OPTIONS requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    const { email, password } = await req.json();

    // Basic validation
    if (!email || !password) {
      return createErrorResponse("Email and password are required", 400);
    }

    // Initialize Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Sign in the user
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Login error:", error);
      return createErrorResponse(error.message, 400);
    }

    // Get the user's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      // Don't fail the login if profile fetch fails
      // The user can still log in and their profile will be created if missing
    }

    // Return successful response with user and profile data
    return createSuccessResponse({
      user: data.user,
      session: data.session,
      profile: profile || null
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred"
    );
  }
}); 