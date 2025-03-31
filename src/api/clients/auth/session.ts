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
   * 
   * IMPORTANT: This endpoint requires:
   * 1. A JWT in the Authorization header (handled by BaseApiClient)
   * 2. Access and refresh tokens in the request body (handled here)
   * 
   * The JWT in the header is required by Supabase to invoke the edge function,
   * while the tokens in the body are used by the function to validate/refresh the session.
   */
  async getSession(): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Getting current session');
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!accessToken || !refreshToken) {
        return {
          error: {
            code: 'session_error',
            message: 'No session tokens found',
          },
          status: 401,
        };
      }

      return await this.baseClient.post<AuthResponse>('/session', {
        access_token: accessToken,
        refresh_token: refreshToken
      });
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