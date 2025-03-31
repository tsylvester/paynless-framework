import { ApiResponse } from '../../types/api-types';
import { User, UserProfile } from '../../types/auth.types';
import { UserSettings, UpdateProfileRequest, UpdateSettingsRequest } from '../../types/profile.types';
import { getSupabaseClient } from '../../utils/supabase';
import { logger } from '../../utils/logger';
import { BaseApiClient } from './base.api';

/**
 * API client for user profile operations
 */
export class ProfileApiClient {
  private supabase = getSupabaseClient();
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/users`);
  }
  
  /**
   * Get user profile by user ID
   */
  async getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Fetching user profile', { userId });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<UserProfile>('/profile');
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
          userId,
        });
      }
      
      // Fallback to direct Supabase access
      const { data: profile, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        return {
          error: {
            code: 'profile_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      if (!profile) {
        logger.warn('Profile not found for user', { userId });
        return {
          data: null,
          status: 404,
        };
      }
      
      return {
        data: {
          id: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
          avatarUrl: profile.avatar_url,
          role: profile.role,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
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
   * Create or update user profile
   */
  async createOrUpdateProfile(profile: UpdateProfileRequest & { id: string }): Promise<ApiResponse<UserProfile>> {
    try {
      logger.info('Creating or updating user profile', { userId: profile.id });
      
      // Try the API endpoint first
      try {
        return await this.baseClient.put<UserProfile>('/profile', {
          firstName: profile.firstName,
          lastName: profile.lastName,
          avatarUrl: profile.avatarUrl,
        });
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
          userId: profile.id,
        });
      }
      
      // Fallback to direct Supabase access
      // Check if profile exists
      const { data: existingProfile } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();
      
      let result;
      
      if (existingProfile) {
        // Update existing profile
        logger.info('Updating existing profile', { userId: profile.id });
        result = await this.supabase
          .from('user_profiles')
          .update({
            first_name: profile.firstName,
            last_name: profile.lastName,
            avatar_url: profile.avatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id)
          .select()
          .single();
      } else {
        // Create new profile
        logger.info('Creating new profile for user', { userId: profile.id });
        result = await this.supabase
          .from('user_profiles')
          .insert([
            {
              id: profile.id,
              first_name: profile.firstName || '',
              last_name: profile.lastName || '',
              avatar_url: profile.avatarUrl || '',
              role: profile.role || 'user',
            },
          ])
          .select()
          .single();
      }
      
      if (result.error) {
        logger.error('Error creating/updating user profile', {
          error: result.error.message,
          userId: profile.id,
        });
        
        return {
          error: {
            code: 'profile_error',
            message: result.error.message,
            details: result.error,
          },
          status: 400,
        };
      }
      
      const profileData = result.data;
      
      return {
        data: {
          id: profileData.id,
          firstName: profileData.first_name,
          lastName: profileData.last_name,
          avatarUrl: profileData.avatar_url,
          role: profileData.role,
          createdAt: profileData.created_at,
          updatedAt: profileData.updated_at,
        },
        status: existingProfile ? 200 : 201,
      };
    } catch (error) {
      logger.error('Error creating/updating user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: profile.id,
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
      
      // Try the API endpoint
      try {
        return await this.baseClient.get<UserSettings>('/settings');
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
          userId,
        });
      }
      
      // Fallback to direct Supabase access
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('metadata')
        .eq('id', userId)
        .single();
      
      if (error) {
        return {
          error: {
            code: 'settings_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Default settings if none exist
      const settings = data.metadata?.settings || {
        notifications: {
          email: true,
          push: true,
          marketing: false,
        },
        theme: 'light',
        language: 'en',
      };
      
      return {
        data: settings,
        status: 200,
      };
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
      
      // Try the API endpoint
      try {
        return await this.baseClient.put<UserSettings>('/settings', settings);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
          userId,
        });
      }
      
      // Fallback to direct Supabase access
      // Get current user profile data
      const { data: currentData, error: fetchError } = await this.supabase
        .from('user_profiles')
        .select('metadata')
        .eq('id', userId)
        .single();
      
      if (fetchError) {
        return {
          error: {
            code: 'settings_error',
            message: fetchError.message,
            details: fetchError,
          },
          status: 400,
        };
      }
      
      // Prepare metadata object, preserving other metadata fields
      const metadata = {
        ...(currentData.metadata || {}),
        settings: settings.settings,
      };
      
      // Update settings
      const { data, error } = await this.supabase
        .from('user_profiles')
        .update({
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('metadata')
        .single();
      
      if (error) {
        return {
          error: {
            code: 'settings_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: data.metadata.settings,
        status: 200,
      };
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
}

export const profileApiClient = new ProfileApiClient();