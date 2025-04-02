// src/services/auth/register.service.ts
import { authApiClient } from '../../api/clients/auth';
import { RegisterCredentials, User } from '../../types/auth.types';
import { logger } from '../../utils/logger';

/**
 * Service for handling registration operations
 */
export class RegisterService {
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
        throw new Error(response.error?.message || 'Registration failed');
      }
      
      // Store tokens in localStorage if available in the response
      if (response.data.session) {
        localStorage.setItem('access_token', response.data.session.access_token);
        localStorage.setItem('refresh_token', response.data.session.refresh_token);
      }
      
      logger.info('User registered successfully', { userId: response.data.user.id });
      return response.data.user;
    } catch (error) {
      logger.error('Unexpected error during registration', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email: credentials.email,
      });
      throw error;
    }
  }
}