import { LoginApiClient } from './login';
import { RegisterApiClient } from './register';
import { SessionApiClient } from './session';
import { PasswordApiClient } from './password';
import { ApiResponse, AuthResponse, LoginCredentials, RegisterCredentials } from '../../../types/auth.types';
import { logger } from '../../../utils/logger';

/**
 * API client for authentication operations
 */
export class AuthApiClient {
  private loginClient: LoginApiClient;
  private registerClient: RegisterApiClient;
  private sessionClient: SessionApiClient;
  private passwordClient: PasswordApiClient;
  
  constructor() {
    this.loginClient = new LoginApiClient();
    this.registerClient = new RegisterApiClient();
    this.sessionClient = new SessionApiClient();
    this.passwordClient = new PasswordApiClient();
  }
  
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      return await this.loginClient.login(credentials);
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
      return await this.registerClient.register(credentials);
    } catch (error) {
      logger.error('Error in AuthApiClient.register', {
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
   * Logout the current user
   */
  async logout(): Promise<ApiResponse<void>> {
    try {
      return await this.sessionClient.logout();
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
      return await this.sessionClient.getSession();
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
   * Reset password
   */
  async resetPassword(email: string): Promise<ApiResponse<void>> {
    try {
      return await this.passwordClient.resetPassword(email);
    } catch (error) {
      logger.error('Error in AuthApiClient.resetPassword', {
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
}

// Export singleton instance
export const authApiClient = new AuthApiClient();