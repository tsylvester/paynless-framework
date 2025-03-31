// Messaging API endpoints
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
import { handleSendMessage } from "./handlers/send.ts";
import { handleGetConversations } from "./handlers/conversations.ts";
import { handleGetMessages } from "./handlers/messages.ts";
import { handleUpdateStatus } from "./handlers/status.ts";

serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/messages/, "");
    const supabase = createSupabaseClient(req);
    
    try {
      const userId = await getUserId(req);
      
      // Parse request body if it exists
      let requestData = {};
      if (req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")) {
        requestData = await req.json();
      }
      
      // Handle different routes
      
      // Send message
      if (path === "/" && req.method === "POST") {
        return await handleSendMessage(supabase, userId, requestData);
      }
      
      // Get conversations
      else if (path.startsWith("/conversations") && path.length === 14 && req.method === "GET") {
        return await handleGetConversations(supabase, userId, url.searchParams);
      }
      
      // Get messages for a conversation
      else if (path.startsWith("/conversations/") && path.length > 14 && req.method === "GET") {
        const conversationId = path.substring(14);
        return await handleGetMessages(supabase, userId, conversationId, url.searchParams);
      }
      
      // Update message status
      else if (path === "/status" && req.method === "PUT") {
        return await handleUpdateStatus(supabase, userId, requestData);
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