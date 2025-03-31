import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { Relationship, RelationshipStatus } from '../../../types/social.types';

/**
 * API client for relationship-related endpoints
 */
export class RelationshipApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance('social/relationships');
  }
  
  async followUser(userId: string): Promise<ApiResponse<Relationship>> {
    try {
      logger.info('Following user', { userId });
      return await this.baseClient.post<Relationship>('/follow', { userId });
    } catch (error) {
      logger.error('Error following user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async unfollowUser(userId: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Unfollowing user', { userId });
      return await this.baseClient.delete<void>(`/follow/${userId}`);
    } catch (error) {
      logger.error('Error unfollowing user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async getFollowers(userId: string): Promise<ApiResponse<Relationship[]>> {
    try {
      logger.info('Getting followers', { userId });
      return await this.baseClient.get<Relationship[]>(`/${userId}/followers`);
    } catch (error) {
      logger.error('Error getting followers', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async getFollowing(userId: string): Promise<ApiResponse<Relationship[]>> {
    try {
      logger.info('Getting following', { userId });
      return await this.baseClient.get<Relationship[]>(`/${userId}/following`);
    } catch (error) {
      logger.error('Error getting following', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  async getRelationshipStatus(userId: string): Promise<ApiResponse<RelationshipStatus>> {
    try {
      logger.info('Getting relationship status', { userId });
      return await this.baseClient.get<RelationshipStatus>(`/${userId}/status`);
    } catch (error) {
      logger.error('Error getting relationship status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const relationshipApiClient = new RelationshipApiClient();