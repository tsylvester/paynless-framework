// supabase/functions/register/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
/*import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../_shared/cors-headers.ts";*/

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  /*const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;*/

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