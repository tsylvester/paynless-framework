// Social API endpoints
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  createSupabaseClient, 
  getUserId 
} from "../_shared/supabase-client.ts";
import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../_shared/cors-headers.ts";
import { handleRelationships } from "./handlers/relationships.ts";
import { handlePosts } from "./handlers/posts.ts";
import { handleComments } from "./handlers/comments.ts";
import { handleReactions } from "./handlers/reactions.ts";
import { handlePrivacy } from "./handlers/privacy.ts";
import { handleTimeline } from "./handlers/timeline.ts";

serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/social/, "");
    
    // Extract the access token from the Authorization header
    const authHeader = req.headers.get("Authorization");
    const accessToken = authHeader?.split(" ")[1]; // Remove "Bearer " prefix
    
    // Create Supabase client with the access token
    const supabase = createSupabaseClient(req);
    
    try {
      const userId = await getUserId(req);
      
      // Parse request body if it exists
      let requestData = {};
      if (req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")) {
        requestData = await req.json();
      }
      
      // Handle different route categories
      
      // Relationships (follow, block, mute)
      if (path.startsWith("/relationships")) {
        return await handleRelationships(supabase, req, path, userId, requestData);
      }
      
      // Posts
      else if (path.startsWith("/posts")) {
        return await handlePosts(supabase, req, path, userId, requestData);
      }
      
      // Timeline
      else if (path.startsWith("/timeline")) {
        return await handleTimeline(supabase, req, path, userId);
      }
      
      // Comments
      else if (path.startsWith("/comments")) {
        return await handleComments(supabase, req, path, userId, requestData);
      }
      
      // Reactions
      else if (path.startsWith("/reactions")) {
        return await handleReactions(supabase, req, path, userId, requestData);
      }
      
      // Privacy settings
      else if (path.startsWith("/privacy")) {
        return await handlePrivacy(supabase, req, path, userId, requestData);
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