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
    this.baseClient = BaseApiClient.getInstance();
  }
  
  /**
   * Get current session
   * 
  /**
   * Get current session
   * 
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
      const access_token = localStorage.getItem('access_token');
      const refresh_token = localStorage.getItem('refresh_token'); // Also get refresh token
      
      if (!access_token || !refresh_token) { // Check for both tokens
        logger.warn('Missing token(s) for getSession', { 
          hasAccessToken: !!access_token, 
          hasRefreshToken: !!refresh_token 
        });
        return {
          error: {
            code: 'session_error',
            message: 'Missing access or refresh token',
          },
          status: 401,
        };
      }

      // Change to POST and include tokens in the body
      return await this.baseClient.post<AuthResponse>('/session', {
        access_token,
        refresh_token,
      });
    } catch (error) {
      logger.error('Error getting session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // It might be useful to check if the error is from the API response
      if (error && typeof error === 'object' && 'response' in error && error.response) {
        const response = error.response as { status?: number; data?: any };
        return {
           error: {
             code: 'session_error',
             message: response.data?.message || 'Failed to get session',
           },
           status: response.status || 500,
        }
      }
      
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
   * Refresh session with refresh token
   */
  async refreshSession(refresh_token: string): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Refreshing session');

      if (!refresh_token) {
        return {
          error: {
            code: 'session_error',
            message: 'No refresh token provided',
          },
          status: 400,
        };
      }

      return await this.baseClient.post<AuthResponse>('/refresh', {
        refresh_token: refresh_token,
      });
    } catch (error) {
      logger.error('Error refreshing session', {
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