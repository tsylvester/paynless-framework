import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { SessionResponse } from '../../../types/auth.types';

/**
 * API client for session operations
 */
export class SessionApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = new BaseApiClient('auth');
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
          code: 'logout_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get the current user's session
   */
  async getSession(): Promise<ApiResponse<SessionResponse>> {
    try {
      logger.info('Getting user session');
      return await this.baseClient.get<SessionResponse>('/session');
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
}