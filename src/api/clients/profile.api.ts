import { ApiResponse } from '../../types/api.types';
import { UserProfile } from '../../types/auth.types';
import { UserSettings, UpdateSettingsRequest } from '../../types/profile.types';
import { logger } from '../../utils/logger';
import { BaseApiClient } from './base.api';

/**
 * API client for user profile operations
 */
export class ProfileApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance('profile');
  }
  
  /**
   * Get user profile
   */
  async getProfile(): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Fetching user profile');
      return await this.baseClient.get<UserProfile>('/me');
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
   * Update user profile
   */
  async updateProfile(profile: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Updating user profile', { profile });
      return await this.baseClient.put<UserProfile>('/me', profile);
    } catch (error) {
      logger.error('Error updating user profile', {
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
  
  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<ApiResponse<UserSettings>> {
    try {
      logger.info('Fetching user settings', { userId });
      return await this.baseClient.get<UserSettings>(`/users/${userId}/settings`);
    } catch (error) {
      logger.error('Error getting user settings', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'settings_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Update user settings
   */
  async updateUserSettings(userId: string, settings: UpdateSettingsRequest): Promise<ApiResponse<UserSettings>> {
    try {
      logger.info('Updating user settings', { userId });
      return await this.baseClient.put<UserSettings>(`/users/${userId}/settings`, settings);
    } catch (error) {
      logger.error('Error updating user settings', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      
      return {
        error: {
          code: 'settings_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  async uploadAvatar(file: File): Promise<ApiResponse<{ url: string }>> {
    try {
      logger.info('Uploading avatar');
      const formData = new FormData();
      formData.append('avatar', file);
      return await this.baseClient.post<{ url: string }>('/avatar', formData);
    } catch (error) {
      logger.error('Error uploading avatar', {
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
}

export const profileApiClient = new ProfileApiClient();