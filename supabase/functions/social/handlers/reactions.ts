import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle reaction-related endpoints
 */
export const handleReactions = async (
  supabase: SupabaseClient,
  req: Request,
  path: string,
  userId: string,
  requestData: any
): Promise<Response> => {
  try {
    // Add reaction to a post
    if (path === "/reactions" && req.method === "POST") {
      const { postId, type } = requestData;
      
      if (!postId || !type) {
        return createErrorResponse("Missing required parameters", 400);
      }
      
      // Validate reaction type
      const validTypes = ["like", "love", "celebrate", "support"];
      if (!validTypes.includes(type)) {
        return createErrorResponse("Invalid reaction type", 400);
      }
      
      // Check if the post exists and is visible to the user
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      
      if (postError) {
        return createErrorResponse("Post not found", 404);
      }
      
      // Check if the user can react to this post
      if (postData.user_id !== userId && postData.visibility === "private") {
        return createErrorResponse("You do not have permission to react to this post", 403);
      }
      
      if (postData.user_id !== userId && postData.visibility === "followers") {
        // Check if the user follows the post owner
        const { data: relationshipData, error: relationshipError } = await supabase
          .from("user_relationships")
          .select("*")
          .eq("user_id", userId)
          .eq("related_user_id", postData.user_id)
          .eq("relationship_type", "follow")
          .maybeSingle();
        
        if (relationshipError || !relationshipData) {
          return createErrorResponse("You do not have permission to react to this post", 403);
        }
      }
      
      // Check if the user already has a reaction to this post
      const { data: existingReaction } = await supabase
        .from("reactions")
        .select("*")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();
      
      let result;
      
      if (existingReaction) {
        // Update existing reaction if type is different
        if (existingReaction.type !== type) {
          result = await supabase
            .from("reactions")
            .update({ type })
            .eq("id", existingReaction.id)
            .select()
            .single();
        } else {
          // Return existing reaction if type is the same
          return createSuccessResponse({
            id: existingReaction.id,
            postId: existingReaction.post_id,
            userId: existingReaction.user_id,
            type: existingReaction.type,
            createdAt: existingReaction.created_at,
          });
        }
      } else {
        // Create new reaction
        result = await supabase
          .from("reactions")
          .insert([
            {
              post_id: postId,
              user_id: userId,
              type,
            },
          ])
          .select()
          .single();
      }
      
      if (result.error) {
        return createErrorResponse(result.error.message, 400);
      }
      
      return createSuccessResponse({
        id: result.data.id,
        postId: result.data.post_id,
        userId: result.data.user_id,
        type: result.data.type,
        createdAt: result.data.created_at,
      }, existingReaction ? 200 : 201);
    }
    
    // Remove reaction from a post
    else if (path.match(/^\/reactions\/[^/]+$/) && req.method === "DELETE") {
      const postId = path.split("/")[2];
      
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({ success: true });
    }
    
    // Get reactions for a post
    else if (path.match(/^\/reactions\/[^/]+$/) && req.method === "GET") {
      const postId = path.split("/")[2];
      const params = new URL(req.url).searchParams;
      const limit = parseInt(params.get("limit") || "100");
      
      // Check if the post exists and is visible to the user
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      
      if (postError) {
        return createErrorResponse("Post not found", 404);
      }
      
      // Check if the user can see this post's reactions
      if (postData.user_id !== userId && postData.visibility === "private") {
        return createErrorResponse("You do not have permission to view reactions on this post", 403);
      }
      
      if (postData.user_id !== userId && postData.visibility === "followers") {
        // Check if the user follows the post owner
        const { data: relationshipData, error: relationshipError } = await supabase
          .from("user_relationships")
          .select("*")
          .eq("user_id", userId)
          .eq("related_user_id", postData.user_id)
          .eq("relationship_type", "follow")
          .maybeSingle();
        
        if (relationshipError || !relationshipData) {
          return createErrorResponse("You do not have permission to view reactions on this post", 403);
        }
      }
      
      // Get reactions for the post
      const { data, error } = await supabase
        .from("reactions")
        .select("*")
        .eq("post_id", postId)
        .limit(limit);
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      const reactions = data.map(item => ({
        id: item.id,
        postId: item.post_id,
        userId: item.user_id,
        type: item.type,
        createdAt: item.created_at,
      }));
      
      return createSuccessResponse({ reactions });
    }
    
    // Check if the user has reacted to a post
    else if (path.match(/^\/reactions\/check\/[^/]+$/) && req.method === "GET") {
      const postId = path.split("/")[3];
      
      // Check if the post exists and is visible to the user
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      
      if (postError) {
        return createErrorResponse("Post not found", 404);
      }
      
      // Check if the user can see this post's reactions
      if (postData.user_id !== userId && postData.visibility === "private") {
        return createErrorResponse("You do not have permission to view reactions on this post", 403);
      }
      
      if (postData.user_id !== userId && postData.visibility === "followers") {
        // Check if the user follows the post owner
        const { data: relationshipData, error: relationshipError } = await supabase
          .from("user_relationships")
          .select("*")
          .eq("user_id", userId)
          .eq("related_user_id", postData.user_id)
          .eq("relationship_type", "follow")
          .maybeSingle();
        
        if (relationshipError || !relationshipData) {
          return createErrorResponse("You do not have permission to view reactions on this post", 403);
        }
      }
      
      // Check if the user has reacted to the post
      const { data, error } = await supabase
        .from("reactions")
        .select("*")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      if (!data) {
        return createSuccessResponse({ hasReacted: false });
      }
      
      return createSuccessResponse({
        hasReacted: true,
        reaction: {
          id: data.id,
          postId: data.post_id,
          userId: data.user_id,
          type: data.type,
          createdAt: data.created_at,
        },
      });
    }
    
    // Route not found
    else {
      return createErrorResponse("Reactions endpoint not found", 404);
    }
  } catch (error) {
    console.error("Error handling reactions request:", error);
    return createErrorResponse(error.message);
  }
};