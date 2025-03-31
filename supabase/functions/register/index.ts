import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { 
  createErrorResponse, 
  createSuccessResponse,
  handleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";

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

    // Create the user
    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error("Registration error:", error);
      return createErrorResponse(error.message, 400);
    }

    // Return successful response
    return createSuccessResponse({
      user: data.user,
      session: data.session
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred"
    );
  }
}); 