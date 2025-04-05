// DEPLOYMENT NOTE: This function handles user login BEFORE a user JWT exists.
// It is secured via an API key check (verifyApiKey) within the function body.
// Deploy using: supabase functions deploy login --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient as actualCreateClient } from "@supabase/supabase-js";
import type { 
    SupabaseClient, 
    SignInWithPasswordCredentials, 
    AuthResponse, 
    SupabaseClientOptions, 
    PostgrestSingleResponse // For profile fetch return type
} from "@supabase/supabase-js";
import { 
  createErrorResponse as actualCreateErrorResponse, 
  createSuccessResponse as actualCreateSuccessResponse,
  handleCorsPreflightRequest as actualHandleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { 
    verifyApiKey as actualVerifyApiKey, 
    createUnauthorizedResponse as actualCreateUnauthorizedResponse 
} from "../_shared/auth.ts";

// Define the interface for injectable dependencies
// Includes profile fetching logic simulation
export interface LoginHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    verifyApiKey: (req: Request) => boolean;
    createUnauthorizedResponse: (message: string) => Response;
    createErrorResponse: (message: string, status?: number) => Response;
    createSuccessResponse: (data: unknown, status?: number) => Response;
    // We inject the client factory AND potentially the specific methods
    createSupabaseClient: (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;
    // Alternatively, inject specific methods if testing gets complex
    // signInWithPassword?: (client: SupabaseClient<any>, creds: SignInWithPasswordCredentials) => Promise<AuthResponse>;
    // fetchProfile?: (client: SupabaseClient<any>, userId: string) => Promise<PostgrestSingleResponse<any>>;
}

// Default dependencies using the actual implementations
const defaultDeps: LoginHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateClient
};

/**
 * NOTE: Edge functions don't return console logs to us in production environments.
 * Avoid using console.log/error/warn/info for debugging as they won't be visible
 * and can affect function execution.
 */

// Export the handler, accepting dependencies with defaults
export async function handleLoginRequest(
    req: Request,
    deps: LoginHandlerDeps = defaultDeps
): Promise<Response> {
  // Use injected dependencies
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  const isValid = deps.verifyApiKey(req);
  if (!isValid) {
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }

  // Only allow POST method after API key check
  if (req.method !== 'POST') {
      return deps.createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return deps.createErrorResponse("Email and password are required", 400);
    }

    // Use injected client factory
    const supabaseAdmin = deps.createSupabaseClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Sign in the user
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error("Login error:", authError);
      // Use error status if available, default to 400 for auth errors
      return deps.createErrorResponse(authError.message, authError.status || 400); 
    }

    // Ensure user data exists after successful sign-in (Supabase should guarantee this, but check anyway)
    if (!authData || !authData.user || !authData.session) {
        console.error("Login succeeded but user/session data missing:", authData);
        return deps.createErrorResponse("Login completed but failed to retrieve session.", 500);
    }

    let profile = null;
    try {
        // Get the user's profile using the client
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('user_profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileError) {
          console.error("Profile fetch error (non-critical):", profileError);
          // Don't fail the login if profile fetch fails
        } else {
          profile = profileData; // Assign profile if fetch succeeded
        }
    } catch (profileCatchError) {
        // Catch unexpected errors during profile fetch
        console.error("Unexpected error during profile fetch:", profileCatchError);
    }

    // Return successful response with user, session, and profile data
    return deps.createSuccessResponse({
      user: authData.user,
      session: authData.session,
      profile: profile // Will be null if fetch failed or profile doesn't exist
    });

  } catch (err) {
    console.error("Unexpected handler error:", err);
    return deps.createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred",
      500 // Ensure status is 500 for unexpected errors
    );
  }
}

// Deno.serve calls the handler, which uses defaultDeps by default
Deno.serve(handleLoginRequest); 