// supabase/functions/auth/login/index.ts
import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../../_shared/cors-headers.ts";

export default async function handleLogin(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { email, password } = await req.json();

    // Validate input
    if (!email || !password) {
      return createErrorResponse("Email and password are required", 400);
    }

    // Sign in the user using regular auth endpoint
    const signInResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      }
    );

    if (!signInResponse.ok) {
      const error = await signInResponse.json();
      throw new Error(error.message || "Failed to sign in user");
    }

    const { access_token, refresh_token } = await signInResponse.json();

    return createSuccessResponse({
      access_token,
      refresh_token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Login failed",
      400
    );
  }
}
