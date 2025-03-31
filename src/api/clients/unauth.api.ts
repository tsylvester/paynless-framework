import { BaseApiClient } from './base.api';
import { logger } from '../../utils/logger';
import { ApiResponse } from '../../types/api.types';
import { User } from '../../types/auth.types';

/**
 * Data required for user registration
 */
export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Response from a successful registration
 */
export interface RegisterResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

/**
 * API client for unauthenticated operations
 */
export class UnauthApiClient extends BaseApiClient {
  constructor() {
    super('unauth');
  }
  
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<ApiResponse<RegisterResponse>> {
    try {
      logger.info('Registering new user', { email: data.email });
      
      const response = await this.post<RegisterResponse>('', {
        action: 'register',
        ...data
      });
      
      // If successful, store tokens in localStorage
      if (response.data && !response.error) {
        if (response.data.access_token) {
          localStorage.setItem('access_token', response.data.access_token);
        }
        
        if (response.data.refresh_token) {
          localStorage.setItem('refresh_token', response.data.refresh_token);
        }
      }
      
      return response;
    } catch (error) {
      logger.error('Error during registration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: data.email
      });
      
      return {
        error: {
          code: 'registration_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred during registration',
        },
        status: 500
      };
    }
  }
}

// Export singleton instance
export const unauthApiClient = new UnauthApiClient();