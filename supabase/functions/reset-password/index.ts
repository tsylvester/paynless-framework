// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as defaultCreateSupabaseClient, SupabaseClient, AuthError } from "jsr:@supabase/supabase-js@2";
import {
  createErrorResponse as defaultCreateErrorResponse,
  createSuccessResponse as defaultCreateSuccessResponse,
  handleCorsPreflightRequest as defaultHandleCorsPreflightRequest
} from "../_shared/cors-headers.ts";
import { verifyApiKey as defaultVerifyApiKey, createUnauthorizedResponse as defaultCreateUnauthorizedResponse } from "../_shared/auth.ts";

// --- Dependency Injection ---

interface ResetPasswordDependencies {
  handleCorsPreflightRequest: (req: Request) => Response | null;
  verifyApiKey: (req: Request) => boolean;
  createUnauthorizedResponse: (message: string) => Response;
  createErrorResponse: (message: string, status: number) => Response;
  createSuccessResponse: (body?: Record<string, unknown>) => Response;
  getEnv: (key: string) => string | undefined;
  getOriginHeader: (req: Request) => string | null;
  createSupabaseClient: (url: string, key: string) => SupabaseClient;
  supabaseResetPassword: (client: SupabaseClient, email: string, options: { redirectTo: string }) => Promise<{ error: AuthError | null }>;
}

// --- Default Dependencies ---

const defaultDependencies: ResetPasswordDependencies = {
  handleCorsPreflightRequest: defaultHandleCorsPreflightRequest,
  verifyApiKey: defaultVerifyApiKey,
  createUnauthorizedResponse: defaultCreateUnauthorizedResponse,
  createErrorResponse: defaultCreateErrorResponse,
  createSuccessResponse: defaultCreateSuccessResponse,
  getEnv: Deno.env.get,
  getOriginHeader: (req) => req.headers.get('origin'),
  createSupabaseClient: defaultCreateSupabaseClient,
  supabaseResetPassword: (client, email, options) => client.auth.resetPasswordForEmail(email, options),
};

// --- Core Logic ---

export async function handleResetPasswordRequest(req: Request, deps: ResetPasswordDependencies): Promise<Response> {
    const {
        handleCorsPreflightRequest,
        verifyApiKey,
        createUnauthorizedResponse,
        createErrorResponse,
        createSuccessResponse,
        getEnv,
        getOriginHeader,
        createSupabaseClient,
        supabaseResetPassword
    } = deps;

    // Handle CORS preflight request first
    const corsResponse = handleCorsPreflightRequest(req);
    if (corsResponse) return corsResponse;

    // Verify API key for all non-OPTIONS requests
    if (req.method !== 'OPTIONS') { // Don't check API key for OPTIONS
      const isValid = verifyApiKey(req);
      if (!isValid) {
        return createUnauthorizedResponse("Invalid or missing apikey");
      }
    }

    // Only allow POST method for the actual reset request
    if (req.method !== 'POST') {
      return createErrorResponse('Method Not Allowed', 405);
    }

    try {
      const { email } = await req.json();

      // Basic validation
      if (!email) {
        return createErrorResponse("Email is required", 400);
      }
      if (typeof email !== 'string') {
        return createErrorResponse("Invalid email format", 400);
      }

      // Get required env vars
      const supabaseUrl = getEnv('SUPABASE_URL');
      const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');
      if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Reset password error: Missing Supabase URL or Anon Key");
        return createErrorResponse("Configuration error", 500);
      }
      
      // Get origin for redirect
      const origin = getOriginHeader(req);
      if (!origin) {
         console.warn("Reset password warning: Missing origin header, redirect might not work as expected.");
         // Fallback or decide how to handle - maybe use a default env var?
         // For now, we'll proceed but the redirect might be incorrect.
      }
      const redirectTo = `${origin || ''}/reset-password`; // Use origin or empty string

      // Initialize Supabase client
      let supabaseAdmin: SupabaseClient;
      try {
        supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseAnonKey);
      } catch(initError) {
        console.error("Reset password error: Failed to initialize Supabase client:", initError);
        return createErrorResponse("Failed to initialize service", 500);
      }

      // Send password reset email
      console.log(`Attempting password reset for: ${email}`);
      const { error } = await supabaseResetPassword(supabaseAdmin, email, { redirectTo });

      if (error) {
        console.error(`Reset password error for ${email}:`, error.message); // Log specific error
        // Avoid exposing detailed Supabase errors to the client
        return createErrorResponse("Failed to send reset email", 500); 
      }

      console.log(`Password reset email sent successfully for: ${email}`);
      return createSuccessResponse({ message: "Password reset email sent successfully" });

    } catch (error) {
      if (error instanceof SyntaxError) {
         return createErrorResponse("Invalid JSON body", 400);
      }
      console.error("Error in reset password handler:", error);
      return createErrorResponse("Internal server error", 500);
    }
}

// --- Server Entry Point ---

if (import.meta.main) {
  serve((req) => handleResetPasswordRequest(req, defaultDependencies));
}

// --- Exports for Testing ---
export type { ResetPasswordDependencies }; 