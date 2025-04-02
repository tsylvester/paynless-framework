import { profileApiClient } from '../api/clients/profile.api';
import { UserProfile } from '../types/auth.types';
import { logger } from '../utils/logger';

/**
 * Service for handling user profile operations
 */
export class ProfileService {
  /**
   * Get current user's profile
   */
  async getCurrentUserProfile(): Promise<UserProfile | null> {
    try {
      logger.info('Fetching current user profile via service');
      const response = await profileApiClient.getMyProfile();

      if (response.error || !response.data) {
        logger.warn('Failed to get current user profile', { 
          error: response.error,
        });
        return null;
      }

      logger.info('Current user profile fetched successfully');
      return response.data;
    } catch (error) {
      logger.error('Unexpected error fetching current user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get user profile by user ID
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      logger.info('Fetching user profile', { userId });
      
      const response = await profileApiClient.getProfile(userId);
      
      if (response.error || !response.data) {
        logger.warn('Failed to get user profile', { 
          error: response.error,
          userId,
        });
        return null;
      }
      
      logger.info('User profile fetched successfully', { userId });
      return response.data;
    } catch (error) {
      logger.error('Unexpected error fetching user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return null;
    }
  }
  
  /**
   * Update current user's profile
   */
  async updateCurrentUserProfile(profile: Partial<UserProfile>): Promise<UserProfile | null> {
    try {
      logger.info('Updating current user profile via service');
      const response = await profileApiClient.updateMyProfile(profile);

      if (response.error || !response.data) {
        logger.error('Failed to update current user profile', { 
          error: response.error,
          profileData: profile
        });
        return null;
      }

      logger.info('Current user profile updated successfully');
      return response.data;
    } catch (error) {
      logger.error('Unexpected error updating current user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}

// Export singleton instance
export const profileService = new ProfileService();