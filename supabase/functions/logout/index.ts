import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as actualCreateClient } from "@supabase/supabase-js";
import type { SupabaseClient, AuthResponse, SupabaseClientOptions } from "@supabase/supabase-js";
import { 
  createErrorResponse as actualCreateErrorResponse, 
  createSuccessResponse as actualCreateSuccessResponse,
  handleCorsPreflightRequest as actualHandleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { 
    verifyApiKey as actualVerifyApiKey, 
    createUnauthorizedResponse as actualCreateUnauthorizedResponse 
} from "../_shared/auth.ts";

// Define dependencies
export interface LogoutHandlerDeps {
    handleCorsPreflightRequest: (req: Request) => Response | null;
    verifyApiKey: (req: Request) => boolean;
    createUnauthorizedResponse: (message: string) => Response;
    createErrorResponse: (message: string, status?: number) => Response;
    createSuccessResponse: (data: unknown, status?: number) => Response;
    createSupabaseClient: (url: string, key: string, options?: SupabaseClientOptions<any>) => SupabaseClient<any>;
    // signOut?: (client: SupabaseClient<any>) => Promise<{ error: AuthError | null }>; // For finer-grained testing if needed
}

// Default dependencies
const defaultDeps: LogoutHandlerDeps = {
    handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
    verifyApiKey: actualVerifyApiKey,
    createUnauthorizedResponse: actualCreateUnauthorizedResponse,
    createErrorResponse: actualCreateErrorResponse,
    createSuccessResponse: actualCreateSuccessResponse,
    createSupabaseClient: actualCreateClient
};

// Export the handler, accepting dependencies
export async function handleLogoutRequest(
    req: Request,
    deps: LogoutHandlerDeps = defaultDeps
): Promise<Response> {
  // Use injected dependencies
  const corsResponse = deps.handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  const isValid = deps.verifyApiKey(req);
  if (!isValid) {
    return deps.createUnauthorizedResponse("Invalid or missing apikey");
  }

  // Note: Original didn't check method, so we won't add it here unless required

  try {
    // Use injected client factory
    const supabaseAdmin = deps.createSupabaseClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );
    
    // Sign out the user
    const { error } = await supabaseAdmin.auth.signOut();
    
    if (error) {
      console.error("Logout error:", error);
      return deps.createErrorResponse(error.message, 500); // Default to 500 for signOut errors
    }

    return deps.createSuccessResponse({ message: "Successfully signed out" });

  } catch (error) {
    console.error("Error in logout handler:", error);
    return deps.createErrorResponse("Internal server error", 500);
  }
}

// Deno.serve uses the handler with default dependencies
serve(handleLogoutRequest); 