import { socialApiClient } from '../../api/clients/social';
import { logger } from '../../utils/logger';
import { PrivacySettings } from '../../types/privacy.types';

/**
 * Service for privacy settings-related functionality
 */
export class PrivacyService {
  /**
   * Get privacy settings for the current user
   */
  async getPrivacySettings(): Promise<PrivacySettings | null> {
    try {
      logger.info('Getting privacy settings');
      
      const response = await socialApiClient.getPrivacySettings();
      
      if (response.error || !response.data) {
        logger.error('Failed to get privacy settings', { 
          error: response.error,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error getting privacy settings', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Update privacy settings for the current user
   */
  async updatePrivacySettings(settings: Partial<PrivacySettings>): Promise<PrivacySettings | null> {
    try {
      logger.info('Updating privacy settings');
      
      const request = {
        settings,
      };
      
      const response = await socialApiClient.updatePrivacySettings(request);
      
      if (response.error || !response.data) {
        logger.error('Failed to update privacy settings', { 
          error: response.error,
        });
        return null;
      }
      
      return response.data;
    } catch (error) {
      logger.error('Unexpected error updating privacy settings', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}