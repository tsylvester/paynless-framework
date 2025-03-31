// supabase/functions/auth/login/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../../_shared/cors-headers.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Log headers for debugging
  console.log("Request headers:", Object.fromEntries(req.headers.entries()));

  try {
    // Check for apikey header
    const apiKey = req.headers.get('apikey');
    if (!apiKey) {
      console.error("Missing apikey header");
      return createErrorResponse("Missing API key", 401);
    }

    // Verify the API key matches the ANON key
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (apiKey !== anonKey) {
      console.error("Invalid API key");
      return createErrorResponse("Invalid API key", 401);
    }

    // Parse request body
    const { email, password } = await req.json();

    // Basic validation
    if (!email || !password) {
      return createErrorResponse("Email and password are required", 400);
    }

    // Use Supabase Auth API to sign in
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error("Login error:", error);
      return createErrorResponse(error.message, 400);
    }

    // Transform the response to match your expected format
    return createSuccessResponse({
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.user_metadata?.firstName,
        lastName: data.user.user_metadata?.lastName,
        avatarUrl: data.user.user_metadata?.avatarUrl,
        role: data.user.role || 'user',
        createdAt: data.user.created_at,
        updatedAt: data.user.updated_at
      },
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + data.session.expires_in
      }
    });
  } catch (err) {
    console.error("Unexpected error during login:", err);
    return createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred"
    );
  }
});