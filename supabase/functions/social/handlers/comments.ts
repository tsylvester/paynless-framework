import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle comment-related endpoints
 */
export const handleComments = async (
  supabase: SupabaseClient,
  req: Request,
  path: string,
  userId: string,
  requestData: any
): Promise<Response> => {
  try {
    // Add comment to a post
    if (path === "/comments" && req.method === "POST") {
      const { postId, content } = requestData;
      
      if (!postId || !content) {
        return createErrorResponse("Missing required parameters", 400);
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
      
      // Check if the user can comment on this post
      if (postData.user_id !== userId && postData.visibility === "private") {
        return createErrorResponse("You do not have permission to comment on this post", 403);
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
          return createErrorResponse("You do not have permission to comment on this post", 403);
        }
      }
      
      // Create the comment
      const { data, error } = await supabase
        .from("comments")
        .insert([
          {
            post_id: postId,
            user_id: userId,
            content,
          },
        ])
        .select()
        .single();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({
        id: data.id,
        postId: data.post_id,
        userId: data.user_id,
        content: data.content,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }, 201);
    }
    
    // Get comments for a post
    else if (path.match(/^\/comments\/[^/]+$/) && req.method === "GET") {
      const postId = path.split("/")[2];
      const params = new URL(req.url).searchParams;
      const cursor = params.get("cursor");
      const limit = parseInt(params.get("limit") || "20");
      
      // Check if the post exists and is visible to the user
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      
      if (postError) {
        return createErrorResponse("Post not found", 404);
      }
      
      // Check if the user can see this post's comments
      if (postData.user_id !== userId && postData.visibility === "private") {
        return createErrorResponse("You do not have permission to view comments on this post", 403);
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
          return createErrorResponse("You do not have permission to view comments on this post", 403);
        }
      }
      
      // Build the query for comments
      let query = supabase
        .from("comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(limit + 1); // Get one extra to determine if there are more
      
      // Apply cursor if provided
      if (cursor) {
        query = query.gt("created_at", cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      // Check if there are more results
      const hasMore = data.length > limit;
      const comments = data.slice(0, limit).map(item => ({
        id: item.id,
        postId: item.post_id,
        userId: item.user_id,
        content: item.content,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
      
      // Get the next cursor from the last item
      const nextCursor = hasMore && comments.length > 0
        ? comments[comments.length - 1].createdAt
        : undefined;
      
      return createSuccessResponse({
        comments,
        pagination: {
          hasMore,
          nextCursor,
        },
      });
    }
    
    // Update a comment
    else if (path.match(/^\/comments\/[^/]+$/) && req.method === "PUT") {
      const commentId = path.split("/")[2];
      const { content } = requestData;
      
      if (!content) {
        return createErrorResponse("Missing required content", 400);
      }
      
      // Check if the comment exists and belongs to the user
      const { data: commentData, error: commentError } = await supabase
        .from("comments")
        .select("*")
        .eq("id", commentId)
        .eq("user_id", userId)
        .single();
      
      if (commentError) {
        return createErrorResponse("Comment not found or you do not have permission to update it", 404);
      }
      
      // Update the comment
      const { data, error } = await supabase
        .from("comments")
        .update({
          content,
          updated_at: new Date().toISOString(),
        })
        .eq("id", commentId)
        .select()
        .single();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({
        id: data.id,
        postId: data.post_id,
        userId: data.user_id,
        content: data.content,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    }
    
    // Delete a comment
    else if (path.match(/^\/comments\/[^/]+$/) && req.method === "DELETE") {
      const commentId = path.split("/")[2];
      
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", userId);
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({ success: true });
    }
    
    // Route not found
    else {
      return createErrorResponse("Comments endpoint not found", 404);
    }
  } catch (error) {
    console.error("Error handling comments request:", error);
    return createErrorResponse(error.message);
  }
};