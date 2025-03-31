import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { Reaction } from '../../../types/social.types';

/**
 * API client for reaction-related endpoints
 */
export class ReactionApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance();
  }
  
  /**
   * Get reactions for a post
   */
  async getReactions(postId: string): Promise<ApiResponse<Reaction[]>> {
    try {
      return await this.baseClient.get<Reaction[]>(`/social/reactions/${postId}`);
    } catch (error) {
      logger.error('Error getting reactions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Add a reaction to a post
   */
  async addReaction(postId: string, type: string): Promise<ApiResponse<Reaction>> {
    try {
      return await this.baseClient.post<Reaction>(`/social/reactions/${postId}`, { type });
    } catch (error) {
      logger.error('Error adding reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Remove a reaction from a post
   */
  async removeReaction(postId: string): Promise<ApiResponse<void>> {
    try {
      return await this.baseClient.delete<void>(`/social/reactions/${postId}`);
    } catch (error) {
      logger.error('Error removing reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const reactionApiClient = new ReactionApiClient();