// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.

// DEPLOYMENT NOTE: This function handles user signup BEFORE a user JWT exists.
// It should be secured via an API key check (e.g., Supabase anon key) within the function body.
// Deploy using: supabase functions deploy register --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient as actualCreateClient } from "npm:@supabase/supabase-js";
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
  console.log("[register/index.ts] Handling request:", req.method, req.url);
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  console.log("[register/index.ts] Verifying API key...");
  const receivedApiKey = req.headers.get('apikey');
  const expectedApiKey = Deno.env.get("SUPABASE_ANON_KEY");
  console.log(`[register/index.ts] Received API Key Header: ${receivedApiKey}`);
  console.log(`[register/index.ts] Expected API Key from Env: ${expectedApiKey}`);
  const isValid = deps.verifyApiKey(req); // verifyApiKey already logs comparison
  if (!isValid) {
    console.log("[register/index.ts] API key verification failed.");
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }
  console.log("[register/index.ts] API key verified.");

  if (req.method !== 'POST') {
      console.log(`[register/index.ts] Method ${req.method} not allowed.`);
      return deps.createErrorResponse('Method Not Allowed', 405);
  }

  try {
    console.log("[register/index.ts] Parsing JSON body...");
    const { email, password } = await req.json();
    console.log("[register/index.ts] JSON body parsed.");

    if (!email || !password) {
      console.log("[register/index.ts] Email or password missing.");
      return deps.createErrorResponse("Email and password are required", 400);
    }
    
    console.log("[register/index.ts] Creating Supabase client...");
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    console.log(`[register/index.ts] Env Vars for client: URL=${!!supabaseUrl}, Key=${!!supabaseAnonKey}`);
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("[register/index.ts] CRITICAL: Missing SUPABASE_URL or SUPABASE_ANON_KEY in env for client creation.");
        return deps.createErrorResponse("Server configuration error", 500);
    }
    const supabaseClient = deps.createSupabaseClient(supabaseUrl, supabaseAnonKey);
    console.log("[register/index.ts] Supabase client created.");

    console.log(`[register/index.ts] Attempting signUp for: ${email}`); 
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });
    console.log(`[register/index.ts] signUp result: user=${!!data?.user}, session=${!!data?.session}, error=${error?.message}`);

    if (error) {
      console.error("[register/index.ts] signUp Error:", error);
      return deps.createErrorResponse(
          `Auth Error: ${error.message}`,
          error.status || 400
      );
    }

    // Check added in case signUp succeeds but returns null user/session unexpectedly
    if (!data?.user || !data?.session) { 
       console.error("[register/index.ts] signUp succeeded but user/session data missing", data);
       return deps.createErrorResponse("Registration completed but failed to retrieve session.", 500);
    }
    
    console.log(`[register/index.ts] signUp Success for: ${email}`); 
    return deps.createSuccessResponse({
      user: data.user,
      session: data.session
    });

  } catch (err) {
    console.error("[register/index.ts] FATAL UNEXPECTED ERROR in handler:", err);
    console.error("Error Name:", err?.name);
    console.error("Error Message:", err?.message);
    console.error("Error Stack:", err?.stack);
    return deps.createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred in handler",
      500
    );
  }
}

// Deno.serve calls the handler, which uses defaultDeps by default
// Update serve call to explicitly pass defaultDeps
serve((req) => handleRegisterRequest(req, defaultDeps)); 