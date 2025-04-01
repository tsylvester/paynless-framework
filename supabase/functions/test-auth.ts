// Test script for authentication and database access
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { 
  createSupabaseClient, 
  getUserId, 
  isAuthenticated, 
  verifyApiKey 
} from "./_shared/auth.ts";
import { 
  createSuccessResponse, 
  createErrorResponse,
  handleCorsPreflightRequest
} from "./_shared/cors-headers.ts";

/**
 * Test endpoint to verify authentication and database access
 */
Deno.serve(async (req) => {
  console.log("Test auth endpoint called");
  
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;
  
  try {
    // Log all headers for debugging
    console.log("Request headers:", Object.fromEntries(req.headers.entries()));
    
    // Check authentication
    const { isValid, userId, error } = await isAuthenticated(req);
    
    if (!isValid) {
      console.error("Authentication failed:", error);
      return createErrorResponse(`Authentication failed: ${error}`, 401);
    }
    
    console.log("Authentication successful for user:", userId);
    
    // Create Supabase client
    const supabase = createSupabaseClient(req);
    
    // Test database access by fetching user profile
    const { data, error: dbError } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name")
      .eq("id", userId)
      .single();
    
    if (dbError) {
      console.error("Database query failed:", dbError);
      return createErrorResponse(`Database access failed: ${dbError.message}`, 500);
    }
    
    // Return success with profile data
    return createSuccessResponse({
      message: "Authentication and database access successful",
      userId,
      profile: data
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return createErrorResponse(
      err instanceof Error ? err.message : "An unexpected error occurred"
    );
  }
});
