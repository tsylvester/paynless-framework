import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { Comment } from '../../../types/social.types';

/**
 * API client for comment-related endpoints
 */
export class CommentApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance();
  }
  
  /**
   * Get comments for a post
   */
  async getComments(postId: string): Promise<ApiResponse<Comment[]>> {
    try {
      return await this.baseClient.get<Comment[]>(`/social/comments/${postId}`);
    } catch (error) {
      logger.error('Error getting comments', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return {
        error: {
          code: 'comment_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Create a new comment
   */
  async createComment(postId: string, content: string): Promise<ApiResponse<Comment>> {
    try {
      return await this.baseClient.post<Comment>(`/social/comments/${postId}`, { content });
    } catch (error) {
      logger.error('Error creating comment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return {
        error: {
          code: 'comment_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<ApiResponse<void>> {
    try {
      return await this.baseClient.delete<void>(`/social/comments/${commentId}`);
    } catch (error) {
      logger.error('Error deleting comment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId,
      });
      return {
        error: {
          code: 'comment_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const commentApiClient = new CommentApiClient();