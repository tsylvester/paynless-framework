import { BaseApiClient } from './base.api';
import { logger } from '../../utils/logger';
import { RegisterData, RegisterResponse } from '../../types/auth.types';

/**
 * API client for unauthenticated operations
 */
export class UnauthApiClient extends BaseApiClient {
  constructor() {
    super('unauth');
  }
  
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<RegisterResponse> {
    logger.info('Registering new user', { email: data.email });
    const response = await this.post<RegisterResponse>('', {
      action: 'register',
      ...data
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Registration failed');
    }
    
    return response;
  }
}

// Export singleton instance
export const unauthApiClient = new UnauthApiClient(); 