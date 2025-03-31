import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../../_shared/auth.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Log request details for debugging
  console.log("=== Registration Request Details ===");
  console.log("Request method:", req.method);
  console.log("Request URL:", req.url);
  console.log("Request headers:", Object.fromEntries(req.headers.entries()));
  
  // Log environment variables (without sensitive values)
  console.log("Environment variables configured:", {
    SUPABASE_URL: !!Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: !!Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  });
  
  // Log search params
  const url = new URL(req.url);
  console.log("Search params:", Object.fromEntries(url.searchParams.entries()));
  
  // Log sb parameter
  const sb = url.searchParams.get('sb');
  console.log("SB parameter:", sb);
  if (sb) {
    try {
      const sbData = JSON.parse(sb);
      console.log("Parsed SB data:", JSON.stringify(sbData, null, 2));
      console.log("JWT role:", sbData.jwt?.[0]?.apikey?.[0]?.payload?.[0]?.role);
      console.log("JWT invalid:", sbData.jwt?.[0]?.apikey?.[0]?.invalid);
    } catch (e) {
      console.error("Error parsing SB data:", e);
    }
  }

  // Verify apikey for registration requests
  console.log("=== API Key Verification ===");
  const isValid = verifyApiKey(req);
  console.log("API key verification result:", isValid);
  if (!isValid) {
    console.log("API key verification failed");
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    console.log("=== Processing Registration ===");
    const { email, password, firstName, lastName } = await req.json();
    console.log("Registration data received:", { email, firstName, lastName });

    // Validate input
    if (!email || !password) {
      return createErrorResponse("Email and password are required", 400);
    }

    // Validate optional fields if provided
    if (firstName && typeof firstName !== 'string') {
      return createErrorResponse("First name must be a string", 400);
    }
    if (lastName && typeof lastName !== 'string') {
      return createErrorResponse("Last name must be a string", 400);
    }

    // Get service role key from environment
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      console.error("Service role key not configured");
      throw new Error("Service role key not configured");
    }

    // Create user with admin privileges
    console.log("Creating user with email:", email);
    const createUserResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
        }),
      }
    );

    if (!createUserResponse.ok) {
      const error = await createUserResponse.json();
      console.error("Failed to create user:", error);
      throw new Error(error.message || "Failed to create user");
    }

    const { user } = await createUserResponse.json();
    console.log("User created successfully:", user.id);

    // Create user profile if firstName or lastName is provided
    if (firstName || lastName) {
      console.log("Creating user profile");
      const createProfileResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/rest/v1/user_profiles`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
            first_name: firstName || null,
            last_name: lastName || null,
          }),
        }
      );

      if (!createProfileResponse.ok) {
        const error = await createProfileResponse.json();
        console.error("Failed to create user profile:", error);
        throw new Error(error.message || "Failed to create user profile");
      }
      console.log("User profile created successfully");
    }

    // Sign in the user using regular auth endpoint
    console.log("Signing in user");
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
      console.error("Failed to sign in user:", error);
      throw new Error(error.message || "Failed to sign in user");
    }

    const { access_token, refresh_token } = await signInResponse.json();
    console.log("User signed in successfully");

    return createSuccessResponse({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      access_token,
      refresh_token,
    });
  } catch (error) {
    console.error("=== Registration Error ===");
    console.error("Error details:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Registration failed",
      error instanceof Error && error.message.includes("already registered") ? 409 : 400
    );
  }
}); 