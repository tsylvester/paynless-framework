import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';

/**
 * API client for password reset operations
 */
export class ResetPasswordApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('auth');
  }
  
  /**
   * Request a password reset email
   */
  async requestReset(email: string): Promise<ApiResponse<void>> {
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
          code: 'reset_password_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Resetting password');
      return await this.baseClient.post<void>('/reset-password/confirm', {
        token,
        password: newPassword,
      });
    } catch (error) {
      logger.error('Error resetting password', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'reset_password_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
} 