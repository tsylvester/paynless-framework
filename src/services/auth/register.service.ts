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
}