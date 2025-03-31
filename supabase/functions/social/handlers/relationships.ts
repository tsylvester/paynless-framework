import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle relationship-related endpoints
 */
export const handleRelationships = async (
  supabase: SupabaseClient,
  req: Request,
  path: string,
  userId: string,
  requestData: any
): Promise<Response> => {
  try {
    // Create a relationship
    if (path === "/relationships" && req.method === "POST") {
      const { relatedUserId, type } = requestData;
      
      if (!relatedUserId || !type) {
        return createErrorResponse("Missing required parameters", 400);
      }
      
      // Validate relationship type
      const validTypes = ["follow", "block", "mute"];
      if (!validTypes.includes(type)) {
        return createErrorResponse("Invalid relationship type", 400);
      }
      
      // Check if we're trying to create a relationship with ourselves
      if (userId === relatedUserId) {
        return createErrorResponse("Cannot create a relationship with yourself", 400);
      }
      
      // Check if related user exists
      const { data: relatedUser, error: userError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", relatedUserId)
        .single();
      
      if (userError || !relatedUser) {
        return createErrorResponse("Related user not found", 404);
      }
      
      // Create the relationship
      const { data, error } = await supabase
        .from("user_relationships")
        .insert([
          {
            user_id: userId,
            related_user_id: relatedUserId,
            relationship_type: type,
          },
        ])
        .select()
        .single();
      
      if (error) {
        // If the error is a duplicate, it's not really an error in this context
        if (error.code === "23505") { // Unique constraint violation
          const { data: existingRelationship, error: fetchError } = await supabase
            .from("user_relationships")
            .select("*")
            .eq("user_id", userId)
            .eq("related_user_id", relatedUserId)
            .eq("relationship_type", type)
            .single();
          
          if (fetchError) {
            return createErrorResponse(fetchError.message, 400);
          }
          
          return createSuccessResponse({
            id: existingRelationship.id,
            userId: existingRelationship.user_id,
            relatedUserId: existingRelationship.related_user_id,
            type: existingRelationship.relationship_type,
            createdAt: existingRelationship.created_at,
          });
        }
        
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({
        id: data.id,
        userId: data.user_id,
        relatedUserId: data.related_user_id,
        type: data.relationship_type,
        createdAt: data.created_at,
      }, 201);
    }
    
    // Remove a relationship
    else if (path.match(/^\/relationships\/[^/]+\/[^/]+$/) && req.method === "DELETE") {
      const parts = path.split("/");
      const relatedUserId = parts[2];
      const type = parts[3];
      
      // Validate relationship type
      const validTypes = ["follow", "block", "mute"];
      if (!validTypes.includes(type)) {
        return createErrorResponse("Invalid relationship type", 400);
      }
      
      const { error } = await supabase
        .from("user_relationships")
        .delete()
        .eq("user_id", userId)
        .eq("related_user_id", relatedUserId)
        .eq("relationship_type", type);
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({ success: true });
    }
    
    // Check if a relationship exists
    else if (path.match(/^\/relationships\/check\/[^/]+\/[^/]+$/) && req.method === "GET") {
      const parts = path.split("/");
      const relatedUserId = parts[3];
      const type = parts[4];
      
      // Validate relationship type
      const validTypes = ["follow", "block", "mute"];
      if (!validTypes.includes(type)) {
        return createErrorResponse("Invalid relationship type", 400);
      }
      
      const { data, error } = await supabase
        .from("user_relationships")
        .select("*")
        .eq("user_id", userId)
        .eq("related_user_id", relatedUserId)
        .eq("relationship_type", type)
        .maybeSingle();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      if (!data) {
        return createSuccessResponse({ exists: false });
      }
      
      return createSuccessResponse({
        exists: true,
        relationship: {
          id: data.id,
          userId: data.user_id,
          relatedUserId: data.related_user_id,
          type: data.relationship_type,
          createdAt: data.created_at,
        },
      });
    }
    
    // Get relationships of a specific type
    else if (path.match(/^\/relationships\/[^/]+$/) && req.method === "GET") {
      const type = path.split("/")[2];
      
      // Validate relationship type
      const validTypes = ["follow", "block", "mute"];
      if (!validTypes.includes(type)) {
        return createErrorResponse("Invalid relationship type", 400);
      }
      
      const params = new URL(req.url).searchParams;
      const cursor = params.get("cursor");
      const limit = parseInt(params.get("limit") || "20");
      
      // Build query for relationships
      let query = supabase
        .from("user_relationships")
        .select("*")
        .eq("user_id", userId)
        .eq("relationship_type", type)
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
      const relationships = data.slice(0, limit).map(item => ({
        id: item.id,
        userId: item.user_id,
        relatedUserId: item.related_user_id,
        type: item.relationship_type,
        createdAt: item.created_at,
      }));
      
      // Get the next cursor from the last item
      const nextCursor = hasMore && relationships.length > 0
        ? relationships[relationships.length - 1].createdAt
        : undefined;
      
      return createSuccessResponse({
        relationships,
        pagination: {
          hasMore,
          nextCursor,
        },
      });
    }
    
    // Get follower/following counts
    else if (path.match(/^\/relationships\/counts\/[^/]+$/) && req.method === "GET") {
      const targetUserId = path.split("/")[3];
      
      // Count followers (users who follow the specified user)
      const { count: followerCount, error: followerError } = await supabase
        .from("user_relationships")
        .select("*", { count: "exact", head: true })
        .eq("related_user_id", targetUserId)
        .eq("relationship_type", "follow");
      
      if (followerError) {
        return createErrorResponse(followerError.message, 400);
      }
      
      // Count following (users the specified user follows)
      const { count: followingCount, error: followingError } = await supabase
        .from("user_relationships")
        .select("*", { count: "exact", head: true })
        .eq("user_id", targetUserId)
        .eq("relationship_type", "follow");
      
      if (followingError) {
        return createErrorResponse(followingError.message, 400);
      }
      
      return createSuccessResponse({
        userId: targetUserId,
        followerCount: followerCount || 0,
        followingCount: followingCount || 0,
      });
    }
    
    // Route not found
    else {
      return createErrorResponse("Relationship endpoint not found", 404);
    }
  } catch (error) {
    console.error("Error handling relationship request:", error);
    return createErrorResponse(error.message);
  }
};