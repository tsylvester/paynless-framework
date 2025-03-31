import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  // Parse the URL to get the path
  const url = new URL(req.url);
  const path = url.pathname.replace('/functions/v1/auth', '');

  // Route to the appropriate handler based on the path
  switch (path) {
    case '/login':
      return handleLogin(req);
    case '/logout':
      return handleLogout(req);
    case '/me':
      return handleGetCurrentUser(req);
    case '/reset-password':
      return handleResetPassword(req);
    default:
      return createErrorResponse("Not found", 404);
  }
});

async function handleLogin(req: Request): Promise<Response> {
  try {
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

async function handleLogout(req: Request): Promise<Response> {
  try {
    // Get the access token from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse("Missing authorization header", 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');

    // Sign out the user using the auth endpoint
    const signOutResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/logout`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!signOutResponse.ok) {
      const error = await signOutResponse.json();
      throw new Error(error.message || "Failed to sign out user");
    }

    return createSuccessResponse({});
  } catch (error) {
    console.error("Logout error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Logout failed",
      400
    );
  }
}

async function handleGetCurrentUser(req: Request): Promise<Response> {
  try {
    // Get the access token from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse("Missing authorization header", 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');

    // Get the current user using the auth endpoint
    const userResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/user`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    if (!userResponse.ok) {
      const error = await userResponse.json();
      throw new Error(error.message || "Failed to get current user");
    }

    const { id, email, role, created_at, updated_at } = await userResponse.json();

    return createSuccessResponse({
      id,
      email,
      role,
      createdAt: created_at,
      updatedAt: updated_at,
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Failed to get current user",
      400
    );
  }
}

async function handleResetPassword(req: Request): Promise<Response> {
  try {
    const { email } = await req.json();

    // Validate input
    if (!email) {
      return createErrorResponse("Email is required", 400);
    }

    // Reset password using the auth endpoint
    const resetResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/recover`,
      {
        method: "POST",
        headers: {
          "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      }
    );

    if (!resetResponse.ok) {
      const error = await resetResponse.json();
      throw new Error(error.message || "Failed to reset password");
    }

    return createSuccessResponse({});
  } catch (error) {
    console.error("Reset password error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Failed to reset password",
      400
    );
  }
} 