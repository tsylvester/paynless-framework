import { socialApiClient } from '../../api/clients/social';
import { logger } from '../../utils/logger';
import { Comment } from '../../types/post.types';

/**
 * Service for comment-related functionality
 */
export class CommentService {
  /**
   * Add a comment to a post
   */
  async createComment(postId: string, content: string): Promise<Comment | null> {
    try {
      logger.info('Creating comment', { postId });
      
      const request = {
        postId,
        content,
      };
      
      const response = await socialApiClient.createComment(request);
      
      if (response.error || !response.data) {
        logger.error('Failed to create comment', { 
          error: response.error,
          postId,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error creating comment', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return null;
    }
  }
  
  /**
   * Get comments for a post
   */
  async getComments(postId: string, cursor?: string, limit: number = 20): Promise<CommentsResponseWithUsers | null> {
    try {
      logger.info('Getting comments', { postId, cursor, limit });
      
      const response = await socialApiClient.getComments(postId, cursor, limit);
      
      if (response.error || !response.data) {
        logger.error('Failed to get comments', { 
          error: response.error,
          postId,
        });
        return null;
      }
      
      // Enhance comments with user information
      const enhancedComments = response.data.comments.map(comment => ({
        ...comment,
        user: {
          firstName: 'User',
          lastName: comment.userId.substring(0, 4),
          avatarUrl: undefined,
        },
      }));
      
      return {
        comments: enhancedComments,
        pagination: response.data.pagination,
      };
    } catch (error) {
      logger.error('Unexpected error getting comments', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return null;
    }
  }
}

export interface CommentsResponseWithUsers {
  comments: Comment[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}