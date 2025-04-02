import { authApiClient } from '../../api/clients/auth';
import { LoginCredentials, User } from '../../types/auth.types';
import { logger } from '../../utils/logger';

/**
 * Service for handling login operations
 */
export class LoginService {
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
      
      // Store tokens in localStorage
      if (response.data.session) {
        console.log("Access token is set to:", response.data.session.access_token, "Refresh token is set to:", response.data.session.refresh_token)
        localStorage.setItem('access_token', response.data.session.access_token);
        localStorage.setItem('refresh_token', response.data.session.refresh_token);
      }
      
      logger.info('User logged in successfully', { userId: response.data.user.id });
      return response.data.user;
    } catch (error) {
      logger.error('Unexpected error during login', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email: credentials.email,
      });
      throw error;
    }
  }
}