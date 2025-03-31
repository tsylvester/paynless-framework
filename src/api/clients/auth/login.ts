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
    this.baseClient = BaseApiClient.getInstance('auth');
  }
  
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Logging in user', { email: credentials.email });
      return await this.baseClient.post<AuthResponse>('/login', credentials);
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