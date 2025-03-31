import { AuthApiLogin } from './login';
import { AuthApiRegister } from './register';
import { AuthApiSession } from './session';
import { AuthApiPassword } from './password';
import { ApiResponse, AuthResponse, LoginCredentials, RegisterCredentials } from '../../../types/auth.types';
import { logger } from '../../../utils/logger';

/**
 * API client for authentication operations
 */
export class AuthApiClient {
  private loginClient: AuthApiLogin;
  private registerClient: AuthApiRegister;
  private sessionClient: AuthApiSession;
  private passwordClient: AuthApiPassword;
  
  constructor() {
    this.loginClient = new AuthApiLogin();
    this.registerClient = new AuthApiRegister();
    this.sessionClient = new AuthApiSession();
    this.passwordClient = new AuthApiPassword();
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
      return await this.sessionClient.getCurrentUser();
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