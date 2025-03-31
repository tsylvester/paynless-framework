import { BaseApiClient } from './base.api';
import { logger } from '../../utils/logger';

export interface LoginData {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * API client for authentication operations
 */
export class AuthApiClient extends BaseApiClient {
  constructor() {
    super('auth');
  }
  
  /**
   * Login with email and password
   */
  async login(data: LoginData): Promise<LoginResponse> {
    logger.info('Logging in user', { email: data.email });
    return this.post<LoginResponse>('/login', data);
  }
  
  /**
   * Logout the current user
   */
  async logout(): Promise<void> {
    logger.info('Logging out user');
    return this.post('/logout');
  }
  
  /**
   * Get the current user
   */
  async getCurrentUser(): Promise<User> {
    logger.info('Getting current user');
    return this.get<User>('/me');
  }

  async resetPassword(email: string): Promise<void> {
    logger.info('Resetting password', { email });
    return this.post('/reset-password', { email });
  }
}

// Export singleton instance
export const authApiClient = new AuthApiClient();