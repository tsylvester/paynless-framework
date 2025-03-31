import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
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
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance('social');
  }
  
  /**
   * Create a new post
   */
  async createPost(request: CreatePostRequest): Promise<ApiResponse<Post>> {
    try {
      logger.info('Creating post', { visibility: request.visibility });
      return await this.baseClient.post<Post>('/posts', request);
    } catch (error) {
      logger.error('Error creating post', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'post_error',
          message: error instanceof Error ? error.message : 'Unknown error',
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
      return await this.baseClient.put<Post>(`/posts/${postId}`, request);
    } catch (error) {
      logger.error('Error updating post', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      
      return {
        error: {
          code: 'post_error',
          message: error instanceof Error ? error.message : 'Unknown error',
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
      return await this.baseClient.delete(`/posts/${postId}`);
    } catch (error) {
      logger.error('Error deleting post', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      
      return {
        error: {
          code: 'post_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get a user's timeline
   */
  async getTimeline(cursor?: string, limit?: number): Promise<ApiResponse<TimelineResponse>> {
    try {
      logger.info('Getting timeline', { cursor, limit });
      return await this.baseClient.get<TimelineResponse>('/timeline', {
        params: { cursor, limit },
      });
    } catch (error) {
      logger.error('Error getting timeline', {
        error: error instanceof Error ? error.message : 'Unknown error',
        cursor,
        limit,
      });
      
      return {
        error: {
          code: 'timeline_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get a user's posts
   */
  async getUserPosts(userId: string, cursor?: string, limit?: number): Promise<ApiResponse<TimelineResponse>> {
    try {
      logger.info('Getting user posts', { userId, cursor, limit });
      return await this.baseClient.get<TimelineResponse>(`/users/${userId}/posts`, {
        params: { cursor, limit },
      });
    } catch (error) {
      logger.error('Error getting user posts', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        cursor,
        limit,
      });
      
      return {
        error: {
          code: 'posts_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const postApiClient = new PostApiClient();