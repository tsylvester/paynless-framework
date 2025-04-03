// src/api/clients/auth/login.ts
import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { LoginCredentials, AuthResponse } from '../../../types/auth.types';

/**
 * API client for login operations
 */
export class LoginApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    // Use the root path since we moved the function to the root
    this.baseClient = BaseApiClient.getInstance();
  }
  
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Logging in user', { email: credentials.email });
      
      // Make the login request to the login endpoint
      const response = await this.baseClient.post<AuthResponse>('/login', credentials);
      
      // If login is successful, store the tokens
      if (response.data?.session) {
        localStorage.setItem('access_token', response.data.session.access_token);
        localStorage.setItem('refresh_token', response.data.session.refresh_token);
      }
      
      return response;
    } catch (error) {
      logger.error('Error logging in user', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'login_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const loginApiClient = new LoginApiClient();