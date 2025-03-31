import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle updating message status
 */
export const handleUpdateStatus = async (
  supabase: SupabaseClient,
  userId: string,
  requestData: any
): Promise<Response> => {
  try {
    const { messageIds, status } = requestData;
    
    if (!messageIds || !Array.isArray(messageIds) || !status) {
      return createErrorResponse("Missing required parameters", 400);
    }
    
    if (messageIds.length === 0) {
      return createSuccessResponse({ success: true });
    }
    
    // Validate status
    const validStatuses = ["delivered", "read"];
    if (!validStatuses.includes(status)) {
      return createErrorResponse("Invalid status", 400);
    }
    
    // Update message status
    const { error } = await supabase
      .from("direct_messages")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .in("id", messageIds)
      .eq("recipient_id", userId);
    
    if (error) {
      return createErrorResponse(error.message, 400);
    }
    
    return createSuccessResponse({ success: true });
  } catch (error) {
    console.error("Error updating message status:", error);
    return createErrorResponse(error.message);
  }
};