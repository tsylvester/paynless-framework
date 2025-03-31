import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle getting conversations for a user
 */
export const handleGetConversations = async (
  supabase: SupabaseClient,
  userId: string,
  params: URLSearchParams
): Promise<Response> => {
  try {
    const cursor = params.get("cursor");
    const limit = parseInt(params.get("limit") || "20");
    
    // Get conversations where the user is a participant
    let query = supabase
      .from("conversations")
      .select("*")
      .contains("participants", [userId])
      .order("updated_at", { ascending: false })
      .limit(limit + 1); // Get one extra to determine if there are more
    
    // Apply cursor if provided
    if (cursor) {
      query = query.lt("updated_at", cursor);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return createErrorResponse(error.message, 400);
    }
    
    // Check if there are more results
    const hasMore = data.length > limit;
    const conversationsData = data.slice(0, limit);
    
    // For each conversation, get the last message and unread count
    const conversationsPromises = conversationsData.map(async (conv) => {
      // Get last message
      const { data: lastMessageData } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      // Count unread messages
      const { count: unreadCount } = await supabase
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("recipient_id", userId)
        .neq("status", "read");
      
      let lastMessage = undefined;
      
      if (lastMessageData) {
        lastMessage = {
          id: lastMessageData.id,
          senderId: lastMessageData.sender_id,
          recipientId: lastMessageData.recipient_id,
          content: lastMessageData.content,
          status: lastMessageData.status,
          createdAt: lastMessageData.created_at,
          updatedAt: lastMessageData.updated_at,
        };
      }
      
      return {
        id: conv.id,
        participants: conv.participants,
        lastMessage,
        unreadCount: unreadCount || 0,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      };
    });
    
    const conversations = await Promise.all(conversationsPromises);
    
    // Get the next cursor from the last item
    const nextCursor = hasMore && conversations.length > 0
      ? conversations[conversations.length - 1].updatedAt
      : undefined;
    
    return createSuccessResponse({
      conversations,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.error("Error getting conversations:", error);
    return createErrorResponse(error.message);
  }
};