import { ApiResponse } from '../../types/api.types';
import { UserProfile } from '../../types/auth.types';
import { UserSettings, UpdateSettingsRequest } from '../../types/profile.types';
import { UserPreferences, UserDetails } from '../../types/dating.types';
import { logger } from '../../utils/logger';
import { BaseApiClient } from './base.api';

/**
 * API client for user profile operations
 */
export class ProfileApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance('api-users');
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
   * Create or update current user's profile
   */
  async createOrUpdateProfile(profile: Partial<UserProfile> & { id: string }): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Creating or updating current user profile', { userId: profile.id });
      return await this.baseClient.put<UserProfile>('/me', profile);
    } catch (error) {
      logger.error('Error creating/updating current user profile', {
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
   * Update current user's profile
   */
  async updateProfile(profile: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
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
  
  /**
   * Get current user's preferences
   */
  async getMyPreferences(): Promise<ApiResponse<UserPreferences>> {
    try {
      logger.info('Fetching current user preferences');
      return await this.baseClient.get<UserPreferences>('/me/preferences');
    } catch (error) {
      logger.error('Error fetching current user preferences', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'preferences_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  /**
   * Get current user's details
   */
  async getMyDetails(): Promise<ApiResponse<UserDetails>> {
    try {
      logger.info('Fetching current user details');
      return await this.baseClient.get<UserDetails>('/me/details');
    } catch (error) {
      logger.error('Error fetching current user details', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'details_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  /**
   * Update current user's preferences
   */
  async updateMyPreferences(updates: Partial<UserPreferences>): Promise<ApiResponse<UserPreferences>> {
    try {
      logger.info('Updating current user preferences');
      return await this.baseClient.put<UserPreferences>('/me/preferences', updates);
    } catch (error) {
      logger.error('Error updating current user preferences', {
        error: error instanceof Error ? error.message : 'Unknown error',
        updates,
      });
      
      return {
        error: {
          code: 'preferences_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  /**
   * Update current user's details
   */
  async updateMyDetails(updates: Partial<UserDetails>): Promise<ApiResponse<UserDetails>> {
    try {
      logger.info('Updating current user details');
      return await this.baseClient.put<UserDetails>('/me/details', updates);
    } catch (error) {
      logger.error('Error updating current user details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        updates,
      });
      
      return {
        error: {
          code: 'details_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get current user's settings
   */
  async getMySettings(): Promise<ApiResponse<UserSettings>> {
    try {
      logger.info('Fetching current user settings');
      return await this.baseClient.get<UserSettings>('/me/settings');
    } catch (error) {
      logger.error('Error getting current user settings', { 
        error: error instanceof Error ? error.message : 'Unknown error',
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
   * Update current user's settings
   */
  async updateMySettings(settings: UpdateSettingsRequest): Promise<ApiResponse<UserSettings>> {
    try {
      logger.info('Updating current user settings');
      return await this.baseClient.put<UserSettings>('/me/settings', settings);
    } catch (error) {
      logger.error('Error updating current user settings', { 
        error: error instanceof Error ? error.message : 'Unknown error',
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
      return await this.baseClient.post<{ url: string }>('/me/avatar', formData);
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