import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { AuthResponse } from '../../../types/auth.types';

/**
 * API client for session operations
 */
export class SessionApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance('auth');
  }
  
  /**
   * Get current session
   */
  async getSession(): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Getting current session');
      return await this.baseClient.get<AuthResponse>('/session');
    } catch (error) {
      logger.error('Error getting session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'session_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  /**
   * Logout the current user
   */
  async logout(): Promise<ApiResponse<void>> {
    try {
      logger.info('Logging out user');
      return await this.baseClient.post<void>('/logout');
    } catch (error) {
      logger.error('Error logging out', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'session_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const sessionApiClient = new SessionApiClient();