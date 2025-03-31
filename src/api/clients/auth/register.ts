import { BaseApiClient } from '../base.api';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';
import { RegisterCredentials, AuthResponse } from '../../../types/auth.types';

/**
 * API client for registration operations
 */
export class RegisterApiClient {
  private baseClient: BaseApiClient;
  
  constructor() {
    this.baseClient = BaseApiClient.getInstance('');  // Empty string for no base path
  }
  
  /**
   * Register a new user
   */
  async register(request: RegisterCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Registering new user', { email: request.email });
      return await this.baseClient.post<AuthResponse>('/register', request);
    } catch (error) {
      logger.error('Error registering user', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'register_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const registerApiClient = new RegisterApiClient();