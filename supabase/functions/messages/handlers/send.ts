import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle sending a message
 */
export const handleSendMessage = async (
  supabase: SupabaseClient,
  userId: string,
  requestData: any
): Promise<Response> => {
  try {
    const { recipientId, content } = requestData;
    
    if (!recipientId || !content) {
      return createErrorResponse("Missing required parameters", 400);
    }
    
    // Check if recipient exists
    const { data: recipientData, error: recipientError } = await supabase
      .from("user_profiles")
      .select("id, metadata")
      .eq("id", recipientId)
      .single();
    
    if (recipientError) {
      return createErrorResponse("Recipient not found", 404);
    }
    
    // Check if the recipient allows messages from this user
    const privacySettings = recipientData.metadata?.privacy || {};
    const messagingSettings = privacySettings.allowMessaging || { everyone: true, followers: true, none: false };
    
    if (messagingSettings.none) {
      return createErrorResponse("Recipient does not allow messages", 403);
    }
    
    // If messaging is limited to followers, check if the recipient follows the sender
    if (!messagingSettings.everyone && messagingSettings.followers) {
      const { data: relationship, error: relationshipError } = await supabase
        .from("user_relationships")
        .select("*")
        .eq("user_id", recipientId)
        .eq("related_user_id", userId)
        .eq("relationship_type", "follow")
        .maybeSingle();
      
      if (relationshipError || !relationship) {
        return createErrorResponse("Recipient only accepts messages from users they follow", 403);
      }
    }
    
    // Check if a conversation already exists between these users
    const participantsArray = [userId, recipientId].sort();
    
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .contains("participants", participantsArray)
      .maybeSingle();
    
    let conversationId = existingConversation?.id;
    
    // If no conversation exists, create one
    if (!conversationId) {
      const { data: newConversation, error: conversationError } = await supabase
        .from("conversations")
        .insert([
          {
            participants: participantsArray,
          },
        ])
        .select()
        .single();
      
      if (conversationError) {
        return createErrorResponse(conversationError.message, 400);
      }
      
      conversationId = newConversation.id;
    }
    
    // Send the message
    const { data, error } = await supabase
      .from("direct_messages")
      .insert([
        {
          conversation_id: conversationId,
          sender_id: userId,
          recipient_id: recipientId,
          content,
          status: "sent",
        },
      ])
      .select()
      .single();
    
    if (error) {
      return createErrorResponse(error.message, 400);
    }
    
    return createSuccessResponse({
      id: data.id,
      senderId: data.sender_id,
      recipientId: data.recipient_id,
      content: data.content,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }, 201);
  } catch (error) {
    console.error("Error sending message:", error);
    return createErrorResponse(error.message);
  }
};