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
    this.baseClient = BaseApiClient.getInstance('social/reactions');
  }
  
  async addReaction(postId: string, type: string): Promise<ApiResponse<Reaction>> {
    try {
      logger.info('Adding reaction', { postId, type });
      return await this.baseClient.post<Reaction>('/', { postId, type });
    } catch (error) {
      logger.error('Error adding reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
        type,
      });
      
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async removeReaction(postId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Removing reaction', { postId });
      return await this.baseClient.delete<void>(`/${postId}`);
    } catch (error) {
      logger.error('Error removing reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async getReactions(postId: string): Promise<ApiResponse<Reaction[]>> {
    try {
      logger.info('Getting reactions', { postId });
      return await this.baseClient.get<Reaction[]>(`/${postId}`);
    } catch (error) {
      logger.error('Error getting reactions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId,
      });
      
      return {
        error: {
          code: 'reaction_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const reactionApiClient = new ReactionApiClient();