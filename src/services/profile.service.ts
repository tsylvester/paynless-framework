import { profileApiClient } from '../api/clients/profile.api';
import { UserProfile } from '../types/auth.types';
import { UserPreferences, UserDetails } from '../types/dating.types';
import { logger } from '../utils/logger';

/**
 * Service for handling user profile operations
 */
export class ProfileService {
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
   * Create or update user profile
   */
  async createOrUpdateProfile(profile: Partial<UserProfile> & { id: string }): Promise<UserProfile | null> {
    try {
      logger.info('Creating or updating user profile', { userId: profile.id });
      
      const response = await profileApiClient.createOrUpdateProfile(profile);
      
      if (response.error || !response.data) {
        logger.error('Failed to create/update user profile', { 
          error: response.error,
          userId: profile.id,
        });
        return null;
      }
      
      logger.info('User profile created/updated successfully', { userId: profile.id });
      return response.data;
    } catch (error) {
      logger.error('Unexpected error creating/updating user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: profile.id,
      });
      return null;
    }
  }
  
  /**
   * Ensure user profile exists, creating one if it doesn't
   */
  async ensureProfileExists(userId: string, defaultProfile: Partial<UserProfile> = {}): Promise<UserProfile | null> {
    try {
      // Try to get existing profile
      const profile = await this.getProfile(userId);
      
      // If profile exists, return it
      if (profile) {
        return profile;
      }
      
      // Otherwise create a new profile
      logger.info('Profile not found, creating new profile', { userId });
      
      return await this.createOrUpdateProfile({
        id: userId,
        ...defaultProfile,
      });
    } catch (error) {
      logger.error('Error ensuring profile exists', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return null;
    }
  }
}

// Export singleton instance
export const profileService = new ProfileService();