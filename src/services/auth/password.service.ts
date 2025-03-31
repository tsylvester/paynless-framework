import { authApiClient } from '../../api/clients/auth';
import { logger } from '../../utils/logger';

/**
 * Service for handling password operations
 */
export class PasswordService {
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