import { BaseApiClient } from './base.api';
import { AuthResponse, LoginCredentials, RegisterCredentials } from '../../types/auth.types';
import { ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';

/**
 * API client for authentication operations
 */
export class AuthApiClient extends BaseApiClient {
  constructor() {
    super('auth');
  }
  
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Logging in user', { email: credentials.email });
      return await this.post<AuthResponse>('/login', credentials);
    } catch (error) {
      logger.error('Error logging in', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: credentials.email,
      });
      
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Register a new user
   */
  async register(credentials: RegisterCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Registering user', { email: credentials.email });
      return await this.post<AuthResponse>('/register', credentials);
    } catch (error) {
      logger.error('Error registering user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: credentials.email,
      });
      
      return {
        error: {
          code: 'auth_error',
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
      return await this.post<void>('/logout');
    } catch (error) {
      logger.error('Error logging out', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
  
  /**
   * Get the current user
   */
  async getCurrentUser(): Promise<ApiResponse<AuthResponse>> {
    try {
      logger.info('Getting current user');
      return await this.get<AuthResponse>('/me');
    } catch (error) {
      logger.error('Error getting current user', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }

  async resetPassword(email: string): Promise<ApiResponse<void>> {
    try {
      logger.info('Resetting password for user', { email });
      return await this.post<void>('/reset-password', { email });
    } catch (error) {
      logger.error('Error resetting password', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
      
      return {
        error: {
          code: 'auth_error',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
        status: 500,
      };
    }
  }
}

// Export singleton instance
export const authApiClient = new AuthApiClient();