import { socialApiClient } from '../../api/clients/social';
import { logger } from '../../utils/logger';
import { Reaction, ReactionType, ReactionCheckResponse } from '../../types/post.types';

/**
 * Service for reaction-related functionality
 */
export class ReactionService {
  /**
   * React to a post (like, love, etc.)
   */
  async reactToPost(postId: string, type: ReactionType): Promise<Reaction | null> {
    try {
      logger.info('Reacting to post', { postId, type });
      
      const request = {
        postId,
        type,
      };
      
      const response = await socialApiClient.createReaction(request);
      
      if (response.error || !response.data) {
        logger.error('Failed to react to post', { 
          error: response.error,
          postId,
          type,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error reacting to post', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
        type,
      });
      return null;
    }
  }
  
  /**
   * Remove a reaction from a post
   */
  async unreactToPost(postId: string): Promise<boolean> {
    try {
      logger.info('Removing reaction from post', { postId });
      
      const response = await socialApiClient.deleteReaction(postId);
      
      if (response.error) {
        logger.error('Failed to remove reaction from post', { 
          error: response.error,
          postId,
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Unexpected error removing reaction from post', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return false;
    }
  }
  
  /**
   * Check if the current user has reacted to a post
   */
  async checkIfReacted(postId: string): Promise<ReactionCheckResponse | null> {
    try {
      logger.info('Checking if reacted to post', { postId });
      
      // Use the API endpoint
      const response = await socialApiClient.checkReaction(postId);
      
      if (response.error || !response.data) {
        logger.warn('Failed to check if reacted to post', { 
          error: response.error,
          postId,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error checking if reacted to post', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return null;
    }
  }
}