// DEPLOYMENT NOTE: This function handles user login BEFORE a user JWT exists.
// It is secured via an API key check (verifyApiKey) within the function body.
// Deploy using: supabase functions deploy login --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient as actualCreateClient, SupabaseClient, SignInWithPasswordCredentials, AuthResponse, SupabaseClientOptions, PostgrestSingleResponse } from "npm:@supabase/supabase-js";
// import type { 
//     SupabaseClient, 
//     SignInWithPasswordCredentials, 
//     AuthResponse, 
//     SupabaseClientOptions, 
//     PostgrestSingleResponse // For profile fetch return type
// } from "@supabase/supabase-js";
import { 
  createErrorResponse as actualCreateErrorResponse, 
  createSuccessResponse as actualCreateSuccessResponse,
  handleCorsPreflightRequest as actualHandleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { 
    verifyApiKey as actualVerifyApiKey, 
    createUnauthorizedResponse as actualCreateUnauthorizedResponse 
} from "../_shared/auth.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("DEBUG: Running simplified login/index.ts for testing Kong");

// Define the interface for injectable dependencies
// Includes profile fetching logic simulation
export interface LoginHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    verifyApiKey: (req: Request) => boolean;
    createUnauthorizedResponse: (message: string) => Response;
    createErrorResponse: (message: string, status?: number) => Response;
    createSuccessResponse: (data: unknown, status?: number) => Response;
    // Pass URL/Key directly
    supabaseUrl: string;
    supabaseAnonKey: string;
    createSupabaseClient: (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;
    // Optional: Inject specific auth/db methods if needed for complex testing
    // signInWithPassword?: (client: SupabaseClient<any>, creds: SignInWithPasswordCredentials) => Promise<AuthResponse>;
    // fetchProfile?: (client: SupabaseClient<any>, userId: string) => Promise<PostgrestSingleResponse<any>>;
}

// Read env vars once when module loads for defaults
const defaultSupabaseUrl = Deno.env.get('SUPABASE_URL');
const defaultSupabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

// Default dependencies using the actual implementations
const defaultDeps: LoginHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    supabaseUrl: defaultSupabaseUrl || "", // Use loaded value or empty string
    supabaseAnonKey: defaultSupabaseAnonKey || "", // Use loaded value or empty string
    createSupabaseClient: actualCreateClient
};

// Export the handler, accepting dependencies with defaults
export async function handleLoginRequest(
    req: Request,
    deps: LoginHandlerDeps = defaultDeps
): Promise<Response> {
  // Use injected dependencies
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // ---> Add Logging Before Verify <---
  const apiKeyHeader = req.headers.get('apikey');
  console.log(`[login/index.ts] About to call verifyApiKey. Header received: ${apiKeyHeader}`);
  // ---> End Logging <---

  // Verify API key first for unauthenticated endpoint
  const isValid = deps.verifyApiKey(req); 
  if (!isValid) {
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }
  console.log("Login API Key check passed."); // Add log

  // Only allow POST method after API key check
  if (req.method !== 'POST') {
      return deps.createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return deps.createErrorResponse("Email and password are required", 400);
    }

    // Check if URL/Key are configured in dependencies
    if (!deps.supabaseUrl || !deps.supabaseAnonKey) {
        console.error("Login handler error: Supabase URL or Anon Key missing in dependencies.");
        return deps.createErrorResponse("Server configuration error", 500);
    }

    // Use injected client factory with injected URL/Key
    const supabaseAnonClient = deps.createSupabaseClient(
      deps.supabaseUrl,
      deps.supabaseAnonKey
      // No specific options needed for signInWithPassword with anon key
    );

    // Sign in the user
    const { data: authData, error: authError } = await supabaseAnonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error("Login auth error:", authError.message, "Status:", authError.status);
      // Use error status if available, default to 400 for auth errors
      return deps.createErrorResponse(authError.message, authError.status || 400); 
    }

    // Ensure user data exists after successful sign-in 
    if (!authData || !authData.user || !authData.session) {
        console.error("Login succeeded but user/session data missing:", authData);
        return deps.createErrorResponse("Login completed but failed to retrieve session.", 500);
    }

    let profile = null;
    try {
        // Get the user's profile using the SAME Anon client 
        // RLS policy on user_profiles should allow users to read their own profile
        const { data: profileData, error: profileError } = await supabaseAnonClient
          .from('user_profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profileError) {
          // Log error but don't fail the login if profile fetch fails
          console.warn("Profile fetch warning (non-critical):", profileError.message);
        } else {
          profile = profileData; // Assign profile if fetch succeeded
        }
    } catch (profileCatchError) {
        // Catch unexpected errors during profile fetch
        console.warn("Unexpected error during profile fetch (non-critical):", profileCatchError);
    }

    // Return successful response with user, session, and profile data
    return deps.createSuccessResponse({
      user: authData.user,
      session: authData.session,
      profile: profile // Will be null if fetch failed or profile doesn't exist
    });

  } catch (err) {
     if (err instanceof SyntaxError) {
         console.warn("Login request body parsing error:", err);
         return deps.createErrorResponse("Invalid JSON body", 400);
     }
    console.error("Unexpected login handler error:", err);
    return deps.createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred",
      500 
    );
  }
}

// Deno.serve calls the handler, which uses defaultDeps by default
// Need to ensure defaultDeps has valid URL/Key when served
if (!defaultDeps.supabaseUrl || !defaultDeps.supabaseAnonKey) {
    console.error("CRITICAL: Cannot start login server. SUPABASE_URL or SUPABASE_ANON_KEY not found in environment.");
} else {
    serve((req) => handleLoginRequest(req, defaultDeps)); 
} 