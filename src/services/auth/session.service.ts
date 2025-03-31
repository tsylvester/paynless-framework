import { authApiClient } from '../../api/clients/auth';
import { User } from '../../types/auth.types';
import { logger } from '../../utils/logger';

/**
 * Service for handling session operations
 */
export class SessionService {
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
}