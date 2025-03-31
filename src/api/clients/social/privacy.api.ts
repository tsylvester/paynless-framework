import { BaseApiClient } from '../../clients/base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { PrivacySettings } from '../../../types/social.types';

/**
 * API client for privacy settings endpoints
 */
export class PrivacyApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('social/privacy');
  }
  
  /**
   * Get privacy settings
   */
  async getPrivacySettings(): Promise<ApiResponse<PrivacySettings>> {
    try {
      logger.info('Getting privacy settings');
      return await this.baseClient.get<PrivacySettings>('/settings');
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
  async updatePrivacySettings(settings: Partial<PrivacySettings>): Promise<ApiResponse<PrivacySettings>> {
    try {
      logger.info('Updating privacy settings');
      return await this.baseClient.put<PrivacySettings>('/settings', settings);
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