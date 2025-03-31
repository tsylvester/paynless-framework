import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { 
  createErrorResponse, 
  createSuccessResponse,
  handleCorsPreflightRequest 
} from "../_shared/cors-headers.ts";
import { verifyApiKey, createUnauthorizedResponse } from "../_shared/auth.ts";

serve(async (req) => {
  // Handle CORS preflight request first
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Verify API key for all non-OPTIONS requests
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return createUnauthorizedResponse("Invalid or missing apikey");
  }

  try {
    // Initialize Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );
    
    // Sign out the user
    const { error } = await supabaseAdmin.auth.signOut();
    
    if (error) {
      console.error("Logout error:", error);
      return createErrorResponse(error.message, 500);
    }

    return createSuccessResponse({ message: "Successfully signed out" });
  } catch (error) {
    console.error("Error in logout handler:", error);
    return createErrorResponse("Internal server error", 500);
  }
}); 