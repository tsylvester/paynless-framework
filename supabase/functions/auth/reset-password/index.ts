import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../../_shared/auth.ts";

/**
 * Handles password reset requests and confirmations
 * 
 * This endpoint handles two operations:
 * 1. Request password reset (POST /reset-password)
 *    - Sends a password reset email to the user
 *    - Requires email in request body
 * 
 * 2. Confirm password reset (POST /reset-password/confirm)
 *    - Sets new password using the reset token
 *    - Requires token and new password in request body
 */
export default async function handleResetPassword(req: Request): Promise<Response> {
  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  // Verify JWT token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return createUnauthorizedResponse("No authorization header");
  }

  try {
    const url = new URL(req.url);
    const isConfirm = url.pathname.endsWith('/confirm');
    const { email, password, token } = await req.json();

    if (isConfirm) {
      // Confirm password reset
      if (!token || !password) {
        return createErrorResponse("Token and new password are required", 400);
      }

      const response = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/auth/v1/user`,
        {
          method: "PUT",
          headers: {
            "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset password");
      }

      return createSuccessResponse({ message: "Password reset successful" });
    } else {
      // Request password reset
      if (!email) {
        return createErrorResponse("Email is required", 400);
      }

      const response = await fetch(
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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send reset email");
      }

      return createSuccessResponse({ 
        message: "Password reset email sent successfully" 
      });
    }
  } catch (error) {
    console.error("Password reset error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Password reset failed",
      400
    );
  }
} 