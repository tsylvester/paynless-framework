// DEPLOYMENT NOTE: This function handles user signup BEFORE a user JWT exists.
// It should be secured via an API key check (e.g., Supabase anon key) within the function body.
// Deploy using: supabase functions deploy register --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient as actualCreateClient } from "@supabase/supabase-js";
import type { SupabaseClient, SignUpWithPasswordCredentials, AuthResponse, SupabaseClientOptions } from "@supabase/supabase-js";
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
export interface RegisterHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    verifyApiKey: (req: Request) => boolean;
    createUnauthorizedResponse: (message: string) => Response;
    createErrorResponse: (message: string, status?: number) => Response;
    createSuccessResponse: (data: unknown, status?: number) => Response;
    createSupabaseClient: (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;
    // Allow injecting specific auth methods for finer-grained testing if needed later
    // signUp?: (client: SupabaseClient<any>, creds: SignUpWithPasswordCredentials) => Promise<AuthResponse>; 
}

// Default dependencies using the actual implementations
const defaultDeps: RegisterHandlerDeps = {
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
export async function handleRegisterRequest(
  req: Request, 
  deps: RegisterHandlerDeps = defaultDeps // Use default dependencies if none provided
): Promise<Response> {
  // Use injected dependencies
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  const isValid = deps.verifyApiKey(req);
  if (!isValid) {
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }

  if (req.method !== 'POST') {
      return deps.createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return deps.createErrorResponse("Email and password are required", 400);
    }
    
    // Use injected createSupabaseClient
    const supabaseClient = deps.createSupabaseClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    console.log(`[Register Function Debug] Attempting signUp for: ${email}`); 

    // Call the actual signUp method via the created client
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error("[Register Function Debug] signUp Error:", error);
      return deps.createErrorResponse(
          `Auth Error: ${error.message}`,
          error.status || 400
      );
    }

    if (!data.user || !data.session) {
       console.error("[Register Function Debug] signUp succeeded but user/session data missing", data);
       return deps.createErrorResponse("Registration completed but failed to retrieve session.", 500);
    }
    
    console.log(`[Register Function Debug] signUp Success for: ${email}`); 

    // Use injected createSuccessResponse
    return deps.createSuccessResponse({
      user: data.user,
      session: data.session
    });

  } catch (err) {
    console.error("[Register Function Debug] Unexpected Handler Error:", err);
    // Use injected createErrorResponse
    return deps.createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred in handler",
      500
    );
  }
}

// Deno.serve calls the handler, which uses defaultDeps by default
Deno.serve(handleRegisterRequest); 