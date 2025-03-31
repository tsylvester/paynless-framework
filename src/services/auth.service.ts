import React from 'react';
import { authApiClient } from '../api/clients/auth.api';
import { LoginCredentials, RegisterCredentials, User } from '../types/auth.types';
import { logger } from '../utils/logger';
import { AuthApiClient, RegisterData } from '../api/clients/auth.api';
import { UnauthApiClient } from '../api/clients/unauth.api';

/**
 * Service for handling authentication-related operations
 */
export class AuthService {
  private authClient: AuthApiClient;
  private unauthClient: UnauthApiClient;

  constructor() {
    this.authClient = new AuthApiClient();
    this.unauthClient = new UnauthApiClient();
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<User | null> {
    try {
      logger.info('Attempting to login user', { email });
      
      const response = await this.authClient.login({ email, password });
      
      if (!response.access_token) {
        logger.error('Login failed', { email });
        return null;
      }
      
      logger.info('User logged in successfully');
      return null; // TODO: Get user details after successful login
    } catch (error) {
      logger.error('Unexpected error during login', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
      return null;
    }
  }
  
  /**
   * Logout the current user
   */
  async logout(): Promise<boolean> {
    try {
      logger.info('Attempting to logout user');
      
      await this.authClient.logout();
      
      logger.info('User logged out successfully');
      return true;
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
      logger.info('Fetching current user');
      
      const user = await this.authClient.getCurrentUser();
      
      if (!user) {
        logger.info('No authenticated user found');
        return null;
      }
      
      logger.info('Current user fetched successfully', { userId: user.id });
      return user;
    } catch (error) {
      logger.error('Unexpected error fetching current user', { 
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
      logger.info('Attempting to reset password', { email });
      
      await this.authClient.resetPassword(email);
      
      logger.info('Password reset email sent successfully', { email });
      return true;
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