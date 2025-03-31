import { BaseApiClient } from '../../clients/base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';

/**
 * API client for authentication password operations
 */
export class PasswordApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('auth');
  }
  
  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Requesting password reset', { email });
      return await this.baseClient.post<void>('/reset-password', { email });
    } catch (error) {
      logger.error('Error requesting password reset', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
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
  
  async updatePassword(newPassword: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Updating password');
      return await this.baseClient.put<void>('/password', { newPassword });
    } catch (error) {
      logger.error('Error updating password', {
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