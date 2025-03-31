import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { getSupabaseClient } from '../../../utils/supabase';
import {
  ProfileVisibility,
  PrivacySettings,
  UpdatePrivacySettingsRequest
} from '../../../types/privacy.types';

/**
 * API client for privacy settings endpoints
 */
export class PrivacyApiClient {
  private baseClient: BaseApiClient;
  private supabase = getSupabaseClient();
  
  constructor() {
    this.baseClient = new BaseApiClient(`${import.meta.env.VITE_API_URL}/social`);
  }
  
  /**
   * Get privacy settings
   */
  async getPrivacySettings(): Promise<ApiResponse<PrivacySettings>> {
    try {
      logger.info('Getting privacy settings');
      
      // Try the API endpoint first
      try {
        return await this.baseClient.get<PrivacySettings>('/privacy');
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('metadata')
        .eq('id', userId)
        .single();
      
      if (error) {
        return {
          error: {
            code: 'privacy_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      // Default privacy settings if none exist
      const defaultSettings: PrivacySettings = {
        profileVisibility: ProfileVisibility.PUBLIC,
        allowTagging: true,
        allowMessaging: {
          everyone: true,
          followers: true,
          none: false,
        },
        showOnlineStatus: true,
        showActivity: true,
        showFollowers: true,
        showFollowing: true,
      };
      
      const privacySettings = data.metadata?.privacy || defaultSettings;
      
      return {
        data: privacySettings,
        status: 200,
      };
    } catch (error) {
      logger.error('Error getting privacy settings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'privacy_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Update privacy settings
   */
  async updatePrivacySettings(request: UpdatePrivacySettingsRequest): Promise<ApiResponse<PrivacySettings>> {
    try {
      logger.info('Updating privacy settings');
      
      // Try the API endpoint first
      try {
        return await this.baseClient.put<PrivacySettings>('/privacy', request);
      } catch (apiError) {
        logger.warn('API endpoint failed, falling back to direct DB access', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
        });
      }
      
      // Fallback to direct Supabase access
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData.user?.id;
      
      if (!userId) {
        return {
          error: {
            code: 'unauthorized',
            message: 'User not authenticated',
          },
          status: 401,
        };
      }
      
      // Get current settings
      const { data: currentData, error: fetchError } = await this.supabase
        .from('user_profiles')
        .select('metadata')
        .eq('id', userId)
        .single();
      
      if (fetchError) {
        return {
          error: {
            code: 'privacy_error',
            message: fetchError.message,
            details: fetchError,
          },
          status: 400,
        };
      }
      
      // Default privacy settings if none exist
      const defaultSettings: PrivacySettings = {
        profileVisibility: ProfileVisibility.PUBLIC,
        allowTagging: true,
        allowMessaging: {
          everyone: true,
          followers: true,
          none: false,
        },
        showOnlineStatus: true,
        showActivity: true,
        showFollowers: true,
        showFollowing: true,
      };
      
      // Merge current settings with the update
      const currentSettings = currentData.metadata?.privacy || defaultSettings;
      const updatedSettings = {
        ...currentSettings,
        ...request.settings,
      };
      
      // Prepare metadata object, preserving other metadata fields
      const metadata = {
        ...(currentData.metadata || {}),
        privacy: updatedSettings,
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
            code: 'privacy_error',
            message: error.message,
            details: error,
          },
          status: 400,
        };
      }
      
      return {
        data: data.metadata.privacy,
        status: 200,
      };
    } catch (error) {
      logger.error('Error updating privacy settings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'privacy_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}