// src/api/clients/auth/register.ts
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
    // Use the full URL to the register endpoint
    this.baseClient = BaseApiClient.getInstance('access');
  }
  
  /**
   * Register a new user
   */
  async register(request: RegisterCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Registering new user', { email: request.email });
      
      // Make sure we're posting to the full register endpoint
      return await this.baseClient.post<AuthResponse>('/register', request);
    } catch (error) {
      logger.error('Error registering user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: request.email,
      });
      
      return {
        error: {
          code: 'register_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export a singleton instance
export const registerApiClient = new RegisterApiClient();