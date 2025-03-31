// User API endpoints
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  createSupabaseClient, 
  getUserId 
} from "../_shared/supabase-client.ts";
import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse 
} from "../_shared/cors-headers.ts";
import { getProfile, updateProfile } from "./handlers/profile.ts";
import { getSettings, updateSettings } from "./handlers/settings.ts";

// Handle API routes
serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api-users/, "");
    const supabase = createSupabaseClient(req);
    
    try {
      // GET /profile - Get user profile
      if (path === "/profile" && req.method === "GET") {
        const userId = await getUserId(req);
        return await getProfile(supabase, userId);
      }
      
      // PUT /profile - Update user profile
      else if (path === "/profile" && req.method === "PUT") {
        const userId = await getUserId(req);
        const profileData = await req.json();
        return await updateProfile(supabase, userId, profileData);
      }
      
      // GET /settings - Get user settings
      else if (path === "/settings" && req.method === "GET") {
        const userId = await getUserId(req);
        return await getSettings(supabase, userId);
      }
      
      // PUT /settings - Update user settings
      else if (path === "/settings" && req.method === "PUT") {
        const userId = await getUserId(req);
        const newSettings = await req.json();
        return await updateSettings(supabase, userId, newSettings);
      }
      
      // Route not found
      else {
        return createErrorResponse("Not found", 404);
      }
    } catch (routeError) {
      // Specific handling for authentication errors
      if (routeError.message === "Unauthorized") {
        return createErrorResponse("Unauthorized", 401);
      }
      throw routeError; // Let the outer catch handle other errors
    }
  } catch (error) {
    console.error("Error handling request:", error);
    return createErrorResponse(error.message);
  }
});