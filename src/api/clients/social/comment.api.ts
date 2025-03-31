import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { getSupabaseClient } from '../../../utils/supabase';
import {
  Comment,
  CommentsResponse,
  CreateCommentRequest
} from '../../../types/post.types';
import { RelationshipType } from '../../../types/relationship.types';

/**
 * API client for comment-related endpoints
 */
export class CommentApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/social`);
  }
  
  /**
   * Add a comment to a post
   */
  async createComment(request: CreateCommentRequest): Promise<ApiResponse<Comment>> {
    try {
      logger.info('Creating comment', { postId: request.postId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.post<Comment>('/comments', request);
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
        .from('comments')
        .insert([
          {
            post_id: request.postId,
            user_id: userId,
            content: request.content,
          },
        ])
        .select()
        .single();
      
      if (error) {
        return {
          error: {
            code: 'comment_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: {
          id: data.id,
          postId: data.post_id,
          userId: data.user_id,
          content: data.content,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        status: 201,
      };
    } catch (error) {
      logger.error('Error creating comment', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'comment_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get comments for a post
   */
  async getComments(postId: string, cursor?: string, limit: number = 20): Promise<ApiResponse<CommentsResponse>> {
    try {
      logger.info('Getting comments', { postId, cursor, limit });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<CommentsResponse>(`/comments/${postId}`, {
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
      
      // Check if the post exists and the user can see it
      const { data: postData, error: postError } = await this.supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();
      
      if (postError) {
        return {
          error: {
            code: 'comments_error',
            message: 'Post not found',
            details: postError,
          },
          status: 404,
        };
      }
      
      // Check if the user has permission to see this post's comments
      if (postData.user_id !== userId && postData.visibility === 'private') {
        return {
          error: {
            code: 'comments_error',
            message: 'You do not have permission to view comments on this post',
          },
          status: 403,
        };
      }
      
      if (postData.user_id !== userId && postData.visibility === 'followers') {
        // Check if the user follows the post owner
        const { data: relationshipData, error: relationshipError } = await this.supabase
          .from('user_relationships')
          .select('*')
          .eq('user_id', userId)
          .eq('related_user_id', postData.user_id)
          .eq('relationship_type', RelationshipType.FOLLOW)
          .maybeSingle();
        
        if (relationshipError || !relationshipData) {
          return {
            error: {
              code: 'comments_error',
              message: 'You do not have permission to view comments on this post',
            },
            status: 403,
          };
        }
      }
      
      // Build the query for comments on the post
      let query = this.supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(limit + 1); // Get one extra to determine if there are more
      
      // Apply cursor if provided
      if (cursor) {
        query = query.gt('created_at', cursor);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return {
          error: {
            code: 'comments_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
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
      
      return {
        data: {
          comments: comments || [], // Ensure comments is an array even if undefined
          pagination: {
            hasMore,
            nextCursor,
          },
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting comments', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'comments_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}