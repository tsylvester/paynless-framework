import { ApiResponse } from '../../types/api.types';
import { UserProfile } from '../../types/auth.types';
import { logger } from '../../utils/logger';
import { BaseApiClient } from './base.api';

/**
 * API client for user profile operations
 */
export class ProfileApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance();
  }
  
  /**
   * Get current user's profile
   */
  async getMyProfile(): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Fetching current user profile');
      return await this.baseClient.get<UserProfile>('/me');
    } catch (error) {
      logger.error('Error fetching current user profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'profile_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  /**
   * Get another user's profile
   */
  async getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Fetching user profile', { userId });
      return await this.baseClient.get<UserProfile>(`/profile/${userId}`);
    } catch (error) {
      logger.error('Error fetching user profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'profile_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Update current user's profile
   */
  async updateMyProfile(profile: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Updating current user profile', { profile });
      return await this.baseClient.put<UserProfile>('/me', profile);
    } catch (error) {
      logger.error('Error updating current user profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
        profile,
      });
      
      return {
        error: {
          code: 'profile_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

export const profileApiClient = new ProfileApiClient();