import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';

/**
 * API client for password operations
 */
export class PasswordApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance('auth');
  }
  
  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Changing password');
      return await this.baseClient.post<void>('/password', {
        currentPassword,
        newPassword,
      });
    } catch (error) {
      logger.error('Error changing password', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'password_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const passwordApiClient = new PasswordApiClient();