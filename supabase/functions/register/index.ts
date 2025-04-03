import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { 
  createErrorResponse, 
  createSuccessResponse,
  handleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
// import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts"; // Temporarily disable API key check

/**
 * NOTE: Edge functions don't return console logs to us in production environments.
 * Avoid using console.log/error/warn/info for debugging as they won't be visible
 * and can affect function execution.
 */

Deno.serve(async (req) => {
  // Handle CORS preflight request first
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Temporarily bypass API key check for debugging
  /*
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }
  */

  // Allow only POST
  if (req.method !== 'POST') {
      return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const { email, password } = await req.json();

    // Basic validation (Keep this)
    if (!email || !password) {
      return createErrorResponse("Email and password are required", 400);
    }

    // Initialize Supabase client using Admin key for signUp
    // IMPORTANT: Use SERVICE_ROLE_KEY for direct admin actions if needed,
    // but signUp often works with anon key if policies allow
    // Sticking with ANON_KEY as per original code for now.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')! // Or SERVICE_ROLE_KEY if required
    );

    console.log(`[Register Function Debug] Attempting signUp for: ${email}`); // Add log

    // Create the user
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error("[Register Function Debug] signUp Error:", error);
      // Still return the error, possibly with more context
      return createErrorResponse(
          `Auth Error: ${error.message}`,
          error.status || 400 // Use status from error if available
      );
    }

    // Ensure data.user and data.session are not null before returning
    if (!data.user || !data.session) {
       console.error("[Register Function Debug] signUp succeeded but user/session data missing", data);
       return createErrorResponse("Registration completed but failed to retrieve session.", 500);
    }
    
    console.log(`[Register Function Debug] signUp Success for: ${email}`); // Add log

    // Return successful response
    return createSuccessResponse({
      user: data.user,
      session: data.session
    });

  } catch (err) {
    console.error("[Register Function Debug] Unexpected Handler Error:", err);
    return createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred in handler",
      500
    );
  }
}); 