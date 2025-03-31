import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle post-related endpoints
 */
export const handlePosts = async (
  supabase: SupabaseClient,
  req: Request,
  path: string,
  userId: string,
  requestData: any
): Promise<Response> => {
  try {
    // Create a post
    if (path === "/posts" && req.method === "POST") {
      const { content, visibility, attachments } = requestData;
      
      if (!content) {
        return createErrorResponse("Missing required content", 400);
      }
      
      // Validate visibility
      const validVisibility = ["public", "followers", "private"];
      if (visibility && !validVisibility.includes(visibility)) {
        return createErrorResponse("Invalid visibility", 400);
      }
      
      const { data, error } = await supabase
        .from("posts")
        .insert([
          {
            user_id: userId,
            content,
            visibility: visibility || "public",
            attachments,
          },
        ])
        .select()
        .single();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({
        id: data.id,
        userId: data.user_id,
        content: data.content,
        visibility: data.visibility,
        attachments: data.attachments,
        likeCount: data.like_count,
        commentCount: data.comment_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }, 201);
    }
    
    // Update a post
    else if (path.match(/^\/posts\/[^/]+$/) && req.method === "PUT") {
      const postId = path.split("/")[2];
      const { content, visibility, attachments } = requestData;
      
      // Validate visibility
      const validVisibility = ["public", "followers", "private"];
      if (visibility && !validVisibility.includes(visibility)) {
        return createErrorResponse("Invalid visibility", 400);
      }
      
      // Check if the post exists and belongs to the user
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .eq("user_id", userId)
        .single();
      
      if (postError) {
        return createErrorResponse("Post not found or you do not have permission to update it", 404);
      }
      
      // Update the post
      const updateData: Record<string, any> = {};
      if (content !== undefined) updateData.content = content;
      if (visibility !== undefined) updateData.visibility = visibility;
      if (attachments !== undefined) updateData.attachments = attachments;
      updateData.updated_at = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("posts")
        .update(updateData)
        .eq("id", postId)
        .select()
        .single();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({
        id: data.id,
        userId: data.user_id,
        content: data.content,
        visibility: data.visibility,
        attachments: data.attachments,
        likeCount: data.like_count,
        commentCount: data.comment_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    }
    
    // Delete a post
    else if (path.match(/^\/posts\/[^/]+$/) && req.method === "DELETE") {
      const postId = path.split("/")[2];
      
      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", userId);
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      return createSuccessResponse({ success: true });
    }
    
    // Get a specific post
    else if (path.match(/^\/posts\/[^/]+$/) && req.method === "GET") {
      const postId = path.split("/")[2];
      
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      
      if (error) {
        return createErrorResponse(error.message, 400);
      }
      
      // Check if the user can see this post
      if (data.user_id !== userId && data.visibility === "private") {
        return createErrorResponse("You do not have permission to view this post", 403);
      }
      
      if (data.user_id !== userId && data.visibility === "followers") {
        // Check if the user follows the post owner
        const { data: relationshipData, error: relationshipError } = await supabase
          .from("user_relationships")
          .select("*")
          .eq("user_id", userId)
          .eq("related_user_id", data.user_id)
          .eq("relationship_type", "follow")
          .maybeSingle();
        
        if (relationshipError || !relationshipData) {
          return createErrorResponse("You do not have permission to view this post", 403);
        }
      }
      
      return createSuccessResponse({
        id: data.id,
        userId: data.user_id,
        content: data.content,
        visibility: data.visibility,
        attachments: data.attachments,
        likeCount: data.like_count,
        commentCount: data.comment_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    }
    
    // Get posts for a specific user
    else if (path.match(/^\/posts\/user\/[^/]+$/) && req.method === "GET") {
      const targetUserId = path.split("/")[3];
      const params = new URL(req.url).searchParams;
      const cursor = params.get("cursor");
      const limit = parseInt(params.get("limit") || "20");
      
      // Determine what visibility levels the current user can see
      let visibilityCondition = "";
      
      if (targetUserId === userId) {
        // User can see all their own posts
        visibilityCondition = ""; // No filter needed
      } else {
        // Check if the current user follows the target user
        const { data: relationshipData } = await supabase
          .from("user_relationships")
          .select("*")
          .eq("user_id", userId)
          .eq("related_user_id", targetUserId)
          .eq("relationship_type", "follow")
          .maybeSingle();
        
        // If following, user can see public and followers-only posts
        // If not following, user can only see public posts
        visibilityCondition = relationshipData
          ? "and(visibility.in.(public,followers))"
          : "and(visibility.eq.public)";
      }
      
      // Build the query for posts from the specified user
      let query = supabase
        .from("posts")
        .select("*")
        .eq("user_id", targetUserId);
      
      // Apply visibility condition if needed
      if (visibilityCondition) {
        query = query.or(visibilityCondition);
      }
      
      // Apply sorting and limit
      query = query
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
      const posts = data.slice(0, limit).map(item => ({
        id: item.id,
        userId: item.user_id,
        content: item.content,
        visibility: item.visibility,
        attachments: item.attachments,
        likeCount: item.like_count,
        commentCount: item.comment_count,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
      
      // Get the next cursor from the last item
      const nextCursor = hasMore && posts.length > 0
        ? posts[posts.length - 1].createdAt
        : undefined;
      
      return createSuccessResponse({
        posts,
        pagination: {
          hasMore,
          nextCursor,
        },
      });
    }
    
    // Route not found
    else {
      return createErrorResponse("Posts endpoint not found", 404);
    }
  } catch (error) {
    console.error("Error handling posts request:", error);
    return createErrorResponse(error.message);
  }
};