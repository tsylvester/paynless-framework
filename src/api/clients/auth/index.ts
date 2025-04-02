import { registerApiClient } from './register';
import { loginApiClient } from './login';
import { sessionApiClient } from './session';
import { passwordApiClient } from './password';
import { resetPasswordApiClient } from './reset-password';
import { AuthResponse, LoginCredentials, RegisterCredentials } from '../../../types/auth.types';
import { ApiResponse } from '../../../types/api.types';
import { logger } from '../../../utils/logger';

/**
 * Main API client for authentication operations
 */
export class AuthApiClient {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      return await loginApiClient.login(credentials);
    } catch (error) {
      logger.error('Error in AuthApiClient.login', {
        error: error instanceof Error ? error.message : 'Unknown error'
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
      return await registerApiClient.register(credentials);
    } catch (error) {
      logger.error('Error in AuthApiClient.register', {
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
   * Logout the current user
   */
  async logout(): Promise<ApiResponse<void>> {
    try {
      return await sessionApiClient.logout();
    } catch (error) {
      logger.error('Error in AuthApiClient.logout', {
        error: error instanceof Error ? error.message : 'Unknown error'
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
      return await sessionApiClient.getSession();
    } catch (error) {
      logger.error('Unexpected error in AuthApiClient.getCurrentUser', {
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
   * Refresh the session
   */
  async refreshSession(refresh_token: string): Promise<ApiResponse<AuthResponse>> {
    try {
      return await sessionApiClient.refreshSession(refresh_token);
    } catch (error) {
      logger.error('Error in AuthApiClient.refreshSession', {
        error: error instanceof Error ? error.message : 'Unknown error'
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
   * Request a password reset email
   */
  async resetPassword(email: string): Promise<ApiResponse<void>> {
    try {
      return await resetPasswordApiClient.requestReset(email);
    } catch (error) {
      logger.error('Error in AuthApiClient.resetPassword', {
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
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    try {
      return await passwordApiClient.changePassword(currentPassword, newPassword);
    } catch (error) {
      logger.error('Error in AuthApiClient.changePassword', {
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
}

// Export a singleton instance
export const authApiClient = new AuthApiClient();