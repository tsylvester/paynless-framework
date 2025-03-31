import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";

/**
 * Handle timeline-related endpoints
 */
export const handleTimeline = async (
  supabase: SupabaseClient,
  req: Request,
  path: string,
  userId: string
): Promise<Response> => {
  try {
    // Get user's timeline
    if (path === "/timeline" && req.method === "GET") {
      const params = new URL(req.url).searchParams;
      const cursor = params.get("cursor");
      const limit = parseInt(params.get("limit") || "20");
      
      // Get users that the current user follows
      const { data: followingData } = await supabase
        .from("user_relationships")
        .select("related_user_id")
        .eq("user_id", userId)
        .eq("relationship_type", "follow");
      
      const followingIds = followingData?.map(item => item.related_user_id) || [];
      
      // Build the query for posts
      let query = supabase.from("posts").select("*");
      
      // Add conditions for which posts to include
      if (followingIds.length > 0) {
        // Include the user's own posts and posts from people they follow
        query = query.or(
          `user_id.eq.${userId},and(user_id.in.(${followingIds.join(',')}),visibility.in.(public,followers))`
        );
      } else {
        // If not following anyone, just show their own posts
        query = query.eq("user_id", userId);
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
      return createErrorResponse("Timeline endpoint not found", 404);
    }
  } catch (error) {
    console.error("Error handling timeline request:", error);
    return createErrorResponse(error.message);
  }
};