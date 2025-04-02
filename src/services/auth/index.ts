import { LoginService } from './login.service';
import { RegisterService } from './register.service';
import { SessionService } from './session.service';
import { PasswordService } from './password.service';
import { LoginCredentials, RegisterCredentials, User } from '../../types/auth.types';
import { logger } from '../../utils/logger';

/**
 * Service for handling authentication-related operations
 */
export class AuthService {
  private loginService: LoginService;
  private registerService: RegisterService;
  private sessionService: SessionService;
  private passwordService: PasswordService;
  
  constructor() {
    this.loginService = new LoginService();
    this.registerService = new RegisterService();
    this.sessionService = new SessionService();
    this.passwordService = new PasswordService();
  }
  
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<User | null> {
    try {
      return await this.loginService.login(credentials);
    } catch (error) {
      logger.error('Unexpected error during login', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email: credentials.email,
      });
      return null;
    }
  }
  
  /**
   * Register a new user
   */
  async register(credentials: RegisterCredentials): Promise<User | null> {
    try {
      return await this.registerService.register(credentials);
    } catch (error) {
      logger.error('Unexpected error during registration', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email: credentials.email,
      });
      return null;
    }
  }
  
  /**
   * Logout the current user
   */
  async logout(): Promise<boolean> {
    try {
      return await this.sessionService.logout();
    } catch (error) {
      logger.error('Unexpected error during logout', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
  
  /**
   * Get the current authenticated user
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      return await this.sessionService.getCurrentUser();
    } catch (error) {
      logger.error('Unexpected error fetching current user', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Refresh the current session
   */
  async refreshSession(refresh_token: string): Promise<User | null> {
    try {
      return await this.sessionService.refreshSession(refresh_token);
    } catch (error) {
      logger.error('Unexpected error refreshing session', { 
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
  
  /**
   * Check if the user has the required role
   */
  hasRole(user: User | null, role: string): boolean {
    if (!user) return false;
    return user.role === role;
  }
  
  /**
   * Reset password for a user
   */
  async resetPassword(email: string): Promise<boolean> {
    try {
      return await this.passwordService.resetPassword(email);
    } catch (error) {
      logger.error('Unexpected error during password reset', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
      return false;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();