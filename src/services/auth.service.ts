import React from 'react';
import { authApiClient } from '../api/clients/auth.api';
import { LoginCredentials, RegisterCredentials, User } from '../types/auth.types';
import { logger } from '../utils/logger';

/**
 * Service for handling authentication-related operations
 */
export class AuthService {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<User | null> {
    try {
      logger.info('Attempting to login user', { email: credentials.email });
      
      const response = await authApiClient.login(credentials);
      
      if (response.error || !response.data?.user) {
        logger.error('Login failed', { 
          error: response.error,
          email: credentials.email,
        });
        return null;
      }
      
      logger.info('User logged in successfully', { userId: response.data.user.id });
      return response.data.user;
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
      logger.info('Attempting to register new user', { email: credentials.email });
      
      const response = await authApiClient.register(credentials);
      
      if (response.error || !response.data?.user) {
        logger.error('Registration failed', { 
          error: response.error,
          email: credentials.email,
        });
        return null;
      }
      
      logger.info('User registered successfully', { userId: response.data.user.id });
      return response.data.user;
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
      logger.info('Attempting to logout user');
      
      const response = await authApiClient.logout();
      
      if (response.error) {
        logger.error('Logout failed', { error: response.error });
        return false;
      }
      
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
      
      const response = await authApiClient.getCurrentUser();
      
      if (response.error || !response.data?.user) {
        logger.info('No authenticated user found');
        return null;
      }
      
      logger.info('Current user fetched successfully', { userId: response.data.user.id });
      return response.data.user;
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
      
      const response = await authApiClient.resetPassword(email);
      
      if (response.error) {
        logger.error('Password reset failed', { 
          error: response.error,
          email,
        });
        return false;
      }
      
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