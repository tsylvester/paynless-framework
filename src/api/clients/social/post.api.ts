import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { getSupabaseClient } from '../../../utils/supabase';
import { 
  Post, 
  PostVisibility,
  TimelineResponse,
  CreatePostRequest,
  UpdatePostRequest,
} from '../../../types/post.types';
import { RelationshipType } from '../../../types/relationship.types';

/**
 * API client for post-related endpoints
 */
export class PostApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/social`);
  }
  
  /**
   * Create a new post
   */
  async createPost(request: CreatePostRequest): Promise<ApiResponse<Post>> {
    try {
      logger.info('Creating post', { visibility: request.visibility });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.post<Post>('/posts', request);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      const { data, error } = await this.supabase
        .from('posts')
        .insert([
          {
            user_id: userId,
            content: request.content,
            visibility: request.visibility,
            attachments: request.attachments,
          },
        ])
        .select()
        .single();
      
      if (error) {
        return {
          error: {
            code: 'post_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: {
          id: data.id,
          userId: data.user_id,
          content: data.content,
          visibility: data.visibility as PostVisibility,
          attachments: data.attachments,
          likeCount: data.like_count,
          commentCount: data.comment_count,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        status: 201,
      };
    } catch (error) {
      logger.error('Error creating post', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'post_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Update an existing post
   */
  async updatePost(postId: string, request: UpdatePostRequest): Promise<ApiResponse<Post>> {
    try {
      logger.info('Updating post', { postId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.put<Post>(`/posts/${postId}`, request);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      // Check if the post exists and belongs to the user
      const { data: postData, error: postError } = await this.supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .eq('user_id', userId)
        .single();
      
      if (postError) {
        return {
          error: {
            code: 'post_error',
            message: 'Post not found or you do not have permission to update it',
            details: postError,
          },
          status: 404,
        };
      }
      
      // Update the post
      const updateData: Record<string, any> = {};
      if (request.content !== undefined) updateData.content = request.content;
      if (request.visibility !== undefined) updateData.visibility = request.visibility;
      if (request.attachments !== undefined) updateData.attachments = request.attachments;
      updateData.updated_at = new Date().toISOString();
      
      const { data, error } = await this.supabase
        .from('posts')
        .update(updateData)
        .eq('id', postId)
        .select()
        .single();
      
      if (error) {
        return {
          error: {
            code: 'post_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: {
          id: data.id,
          userId: data.user_id,
          content: data.content,
          visibility: data.visibility as PostVisibility,
          attachments: data.attachments,
          likeCount: data.like_count,
          commentCount: data.comment_count,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error updating post', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'post_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Delete a post
   */
  async deletePost(postId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Deleting post', { postId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.delete<void>(`/posts/${postId}`);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      const { error } = await this.supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId);
      
      if (error) {
        return {
          error: {
            code: 'post_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        status: 200,
      };
    } catch (error) {
      logger.error('Error deleting post', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'post_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get a user's timeline (their posts and posts from people they follow)
   */
  async getTimeline(cursor?: string, limit: number = 20): Promise<ApiResponse<TimelineResponse>> {
    try {
      logger.info('Getting timeline', { cursor, limit });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<TimelineResponse>('/timeline', {
          params: { cursor, limit: limit.toString() },
        });
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      // Get users that the current user follows
      const { data: followingData } = await this.supabase
        .from('user_relationships')
        .select('related_user_id')
        .eq('user_id', userId)
        .eq('relationship_type', RelationshipType.FOLLOW);
      
      const followingIds = followingData?.map(item => item.related_user_id) || [];
      
      // Build the query for posts
      let query = this.supabase.from('posts').select('*');
      
      // Add conditions for which posts to include
      if (followingIds.length > 0) {
        // Include the user's own posts and posts from people they follow
        query = query.or(`user_id.eq.${userId},and(user_id.in.(${followingIds.join(',')}),visibility.in.(public,followers))`);
      } else {
        // If not following anyone, just show their own posts and public posts
        query = query.or(`user_id.eq.${userId},visibility.eq.public`);
      }
      
      // Apply sorting and limit
      query = query
        .order('created_at', { ascending: false })
        .limit(limit + 1); // Get one extra to determine if there are more
      
      // Apply cursor if provided
      if (cursor) {
        query = query.lt('created_at', cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return {
          error: {
            code: 'timeline_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Check if there are more results
      const hasMore = data.length > limit;
      const posts = data.slice(0, limit).map(item => ({
        id: item.id,
        userId: item.user_id,
        content: item.content,
        visibility: item.visibility as PostVisibility,
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
      
      return {
        data: {
          posts: posts || [], // Ensure posts is an array even if undefined
          pagination: {
            hasMore,
            nextCursor,
          },
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting timeline', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'timeline_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get a user's posts
   */
  async getUserPosts(userId: string, cursor?: string, limit: number = 20): Promise<ApiResponse<TimelineResponse>> {
    try {
      logger.info('Getting user posts', { userId, cursor, limit });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<TimelineResponse>(`/posts/user/${userId}`, {
          params: { cursor, limit: limit.toString() },
        });
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const currentUserId = authData.user?.id;
      
      if (!currentUserId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      // Determine what visibility levels the current user can see
      let visibilityCondition = '';
      
      if (userId === currentUserId) {
        // User can see all their own posts
        visibilityCondition = ''; // No filter needed
      } else {
        // Check if the current user follows the target user
        const { data: relationshipData } = await this.supabase
          .from('user_relationships')
          .select('*')
          .eq('user_id', currentUserId)
          .eq('related_user_id', userId)
          .eq('relationship_type', RelationshipType.FOLLOW)
          .maybeSingle();
        
        // If following, user can see public and followers-only posts
        // If not following, user can only see public posts
        visibilityCondition = relationshipData
          ? "and(visibility.in.(public,followers))"
          : "and(visibility.eq.public)";
      }
      
      // Build the query for posts from the specified user
      let query = this.supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId);
      
      // Apply visibility condition if needed
      if (visibilityCondition) {
        query = query.or(visibilityCondition);
      }
      
      // Apply sorting and limit
      query = query
        .order('created_at', { ascending: false })
        .limit(limit + 1); // Get one extra to determine if there are more
      
      // Apply cursor if provided
      if (cursor) {
        query = query.lt('created_at', cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return {
          error: {
            code: 'posts_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Check if there are more results
      const hasMore = data.length > limit;
      const posts = data.slice(0, limit).map(item => ({
        id: item.id,
        userId: item.user_id,
        content: item.content,
        visibility: item.visibility as PostVisibility,
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
      
      return {
        data: {
          posts: posts || [], // Ensure posts is an array even if undefined
          pagination: {
            hasMore,
            nextCursor,
          },
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting user posts', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'posts_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}