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
    this.baseClient = BaseApiClient.getInstance();
  }
  
  /**
   * Get relationships for a user
   */
  async getRelationships(userId: string): Promise<ApiResponse<Relationship[]>> {
    try {
      return await this.baseClient.get<Relationship[]>(`/social/relationships/${userId}`);
    } catch (error) {
      logger.error('Error getting relationships', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Send a relationship request
   */
  async sendRequest(targetUserId: string): Promise<ApiResponse<Relationship>> {
    try {
      return await this.baseClient.post<Relationship>(`/social/relationships/${targetUserId}`);
    } catch (error) {
      logger.error('Error sending relationship request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        targetUserId,
      });
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Update relationship status
   */
  async updateStatus(relationshipId: string, status: RelationshipStatus): Promise<ApiResponse<Relationship>> {
    try {
      return await this.baseClient.put<Relationship>(`/social/relationships/${relationshipId}`, { status });
    } catch (error) {
      logger.error('Error updating relationship status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        relationshipId,
      });
      return {
        error: {
          code: 'relationship_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const relationshipApiClient = new RelationshipApiClient();