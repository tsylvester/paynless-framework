import { BaseApiClient } from '../../clients/base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { Comment } from '../../../types/social.types';

/**
 * API client for comment-related endpoints
 */
export class CommentApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('social/comments');
  }
  
  /**
   * Get comments for a post
   */
  async getComments(postId: string): Promise<ApiResponse<Comment[]>> {
    try {
      logger.info('Getting comments', { postId });
      return await this.baseClient.get<Comment[]>(`/${postId}`);
    } catch (error) {
      logger.error('Error getting comments', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
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
   * Add a comment to a post
   */
  async addComment(postId: string, content: string): Promise<ApiResponse<Comment>> {
    try {
      logger.info('Adding comment', { postId });
      return await this.baseClient.post<Comment>('/', { postId, content });
    } catch (error) {
      logger.error('Error adding comment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
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
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Deleting comment', { commentId });
      return await this.baseClient.delete<void>(`/${commentId}`);
    } catch (error) {
      logger.error('Error deleting comment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId,
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
}