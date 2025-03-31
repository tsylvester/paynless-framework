import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle privacy settings endpoints
 */
export const handlePrivacy = async (
  supabase: SupabaseClient,
  req: Request,
  path: string,
  userId: string,
  requestData: any
): Promise<Response> => {
  try {
    // Get privacy settings
    if (path === "/privacy" && req.method === "GET") {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("metadata")
        .eq("id", userId)
        .single();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      // Default privacy settings if none exist
      const defaultSettings = {
        profileVisibility: "public",
        allowTagging: true,
        allowMessaging: {
          everyone: true,
          followers: true,
          none: false,
        },
        showOnlineStatus: true,
        showActivity: true,
        showFollowers: true,
        showFollowing: true,
      };
      
      const privacySettings = data.metadata?.privacy || defaultSettings;
      
      return createSuccessResponse(privacySettings);
    }
    
    // Update privacy settings
    else if (path === "/privacy" && req.method === "PUT") {
      const { settings } = requestData;
      
      if (!settings) {
        return createErrorResponse("Missing required settings", 400);
      }
      
      // Validate profile visibility
      if (settings.profileVisibility && !["public", "followers", "private"].includes(settings.profileVisibility)) {
        return createErrorResponse("Invalid profile visibility", 400);
      }
      
      // Get current settings
      const { data: currentData, error: fetchError } = await supabase
        .from("user_profiles")
        .select("metadata")
        .eq("id", userId)
        .single();
      
      if (fetchError) {
        return createErrorResponse(fetchError.message, 400);
      }
      
      // Default privacy settings if none exist
      const defaultSettings = {
        profileVisibility: "public",
        allowTagging: true,
        allowMessaging: {
          everyone: true,
          followers: true,
          none: false,
        },
        showOnlineStatus: true,
        showActivity: true,
        showFollowers: true,
        showFollowing: true,
      };
      
      // Merge current settings with the update
      const currentSettings = currentData.metadata?.privacy || defaultSettings;
      const updatedSettings = {
        ...currentSettings,
        ...settings,
      };
      
      // Prepare metadata object, preserving other metadata fields
      const metadata = {
        ...(currentData.metadata || {}),
        privacy: updatedSettings,
      };
      
      // Update settings
      const { data, error } = await supabase
        .from("user_profiles")
        .update({
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select("metadata")
        .single();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse(data.metadata.privacy);
    }
    
    // Route not found
    else {
      return createErrorResponse("Privacy endpoint not found", 404);
    }
  } catch (error) {
    console.error("Error handling privacy request:", error);
    return createErrorResponse(error.message);
  }
};