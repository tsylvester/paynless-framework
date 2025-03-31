import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle getting messages for a conversation
 */
export const handleGetMessages = async (
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  params: URLSearchParams
): Promise<Response> => {
  try {
    const cursor = params.get("cursor");
    const limit = parseInt(params.get("limit") || "50");
    
    // Check if the user is a participant in this conversation
    const { data: conversationData, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .contains("participants", [userId])
      .single();
    
    if (convError || !conversationData) {
      return createErrorResponse("Conversation not found or you are not a participant", 404);
    }
    
    // Build the query for messages in this conversation
    let query = supabase
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Get one extra to determine if there are more
    
    // Apply cursor if provided
    if (cursor) {
      query = query.lt("created_at", cursor);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return createErrorResponse(error.message, 400);
    }
    
    // Check if there are more results
    const hasMore = data.length > limit;
    const messages = data.slice(0, limit).map(item => ({
      id: item.id,
      senderId: item.sender_id,
      recipientId: item.recipient_id,
      content: item.content,
      status: item.status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
    
    // Mark messages as delivered if they are sent to this user
    const messagesToUpdate = messages
      .filter(msg => msg.recipientId === userId && msg.status === "sent")
      .map(msg => msg.id);
    
    if (messagesToUpdate.length > 0) {
      await supabase
        .from("direct_messages")
        .update({ status: "delivered", updated_at: new Date().toISOString() })
        .in("id", messagesToUpdate);
      
      // Update the status of messages in the response
      messages.forEach(msg => {
        if (messagesToUpdate.includes(msg.id)) {
          msg.status = "delivered";
        }
      });
    }
    
    // Get the next cursor from the last item
    const nextCursor = hasMore && messages.length > 0
      ? messages[messages.length - 1].createdAt
      : undefined;
    
    return createSuccessResponse({
      messages,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.error("Error getting messages:", error);
    return createErrorResponse(error.message);
  }
};