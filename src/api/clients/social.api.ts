import { BaseApiClient } from './base.api';
import { ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';
import { 
  Post, 
  PostVisibility,
  TimelineResponse,
  CreatePostRequest,
  UpdatePostRequest,
} from '../../types/post.types';

/**
 * API client for social features
 */
export class SocialApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('social');
  }
  
  /**
   * Get a user's timeline
   */
  async getTimeline(cursor?: string, limit: number = 20): Promise<ApiResponse<TimelineResponse>> {
    try {
      logger.info('Getting timeline', { cursor, limit });
      
      return await this.baseClient.get<TimelineResponse>('/timeline', {
        params: { cursor, limit: limit.toString() },
      });
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
}

// Export singleton instance
export const socialApiClient = new SocialApiClient();