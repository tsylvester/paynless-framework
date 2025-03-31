import { UnauthApiClient, RegisterData } from '../api/clients/unauth.api';
import { logger } from '../utils/logger';
import { User } from '../types/auth.types';

/**
 * Service for handling unauthenticated operations
 */
export class UnauthService {
  private unauthClient: UnauthApiClient;

  constructor() {
    this.unauthClient = new UnauthApiClient();
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<User | null> {
    try {
      logger.info('Attempting to register new user', { email: data.email });
      
      const response = await this.unauthClient.register(data);
      
      if (!response.user) {
        logger.error('Registration failed', { 
          email: data.email,
        });
        return null;
      }
      
      logger.info('User registered successfully', { userId: response.user.id });
      return response.user;
    } catch (error) {
      logger.error('Unexpected error during registration', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email: data.email,
      });
      return null;
    }
  }
}

// Export singleton instance
export const unauthService = new UnauthService(); 